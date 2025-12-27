import React from 'react'
import { ViewPlugin } from '@remixproject/engine-web'
import { PluginViewWrapper } from '@remix-ui/helper'
import * as packageJson from '../../../../../package.json'
import { RemixUICloudWorkspaces } from '@remix-ui/cloud-workspaces'
import { WorkspaceSummary, StorageFile } from 'libs/remix-api/src/lib/plugins/api-types'

const profile = {
  name: 'cloudWorkspaces',
  displayName: 'Cloud Workspaces',
  methods: ['getWorkspaces', 'getBackups', 'refresh'],
  events: ['workspacesLoaded', 'backupsLoaded'],
  icon: 'assets/img/cloud.svg',
  description: 'View and manage your cloud workspaces and backups',
  kind: 'storage',
  location: 'sidePanel',
  documentation: '',
  version: packageJson.version,
  maintainedBy: 'Remix'
}

export interface CloudWorkspacesState {
  workspaces: WorkspaceSummary[]
  selectedWorkspace: string | null
  backups: StorageFile[]
  autosave: StorageFile | null
  loading: boolean
  error: string | null
  isAuthenticated: boolean
}

export class CloudWorkspacesPlugin extends ViewPlugin {
  dispatch: React.Dispatch<any> = () => {}
  private state: CloudWorkspacesState = {
    workspaces: [],
    selectedWorkspace: null,
    backups: [],
    autosave: null,
    loading: false,
    error: null,
    isAuthenticated: false
  }

  constructor() {
    super(profile)
  }

  async onActivation(): Promise<void> {
    // Check auth status and load workspaces
    await this.checkAuthAndLoad()
    
    // Listen for auth state changes
    this.on('auth', 'authStateChanged', async (state: { isAuthenticated: boolean }) => {
      this.state.isAuthenticated = state.isAuthenticated
      if (state.isAuthenticated) {
        await this.loadWorkspaces()
      } else {
        this.state.workspaces = []
        this.state.backups = []
        this.state.autosave = null
        this.state.selectedWorkspace = null
        this.renderComponent()
      }
    })
    
    // Listen for backup events from s3Storage
    this.on('s3Storage', 'backupCompleted', async () => {
      await this.refresh()
    })
  }

  async onDeactivation(): Promise<void> {
    this.off('auth', 'authStateChanged')
    this.off('s3Storage', 'backupCompleted')
  }

  private async checkAuthAndLoad(): Promise<void> {
    try {
      const isAuth = await this.call('auth', 'isAuthenticated')
      this.state.isAuthenticated = isAuth
      if (isAuth) {
        await this.loadWorkspaces()
      } else {
        this.renderComponent()
      }
    } catch (e) {
      console.error('[CloudWorkspacesPlugin] Auth check failed:', e)
      this.state.isAuthenticated = false
      this.renderComponent()
    }
  }

  /**
   * Get list of user's remote workspaces
   */
  async getWorkspaces(): Promise<WorkspaceSummary[]> {
    return this.state.workspaces
  }

  /**
   * Get backups for a specific workspace
   */
  async getBackups(workspaceId: string): Promise<StorageFile[]> {
    if (this.state.selectedWorkspace === workspaceId) {
      return this.state.backups
    }
    await this.loadBackups(workspaceId)
    return this.state.backups
  }

  /**
   * Refresh the workspace list
   */
  async refresh(): Promise<void> {
    await this.loadWorkspaces()
    if (this.state.selectedWorkspace) {
      await this.loadBackups(this.state.selectedWorkspace)
    }
  }

  private async loadWorkspaces(): Promise<void> {
    this.state.loading = true
    this.state.error = null
    this.renderComponent()

    try {
      const result = await this.call('s3Storage', 'listWorkspaces')
      this.state.workspaces = result.workspaces || []
      this.emit('workspacesLoaded', this.state.workspaces)
    } catch (e) {
      console.error('[CloudWorkspacesPlugin] Failed to load workspaces:', e)
      this.state.error = e.message || 'Failed to load workspaces'
    } finally {
      this.state.loading = false
      this.renderComponent()
    }
  }

  private async loadBackups(workspaceId: string): Promise<void> {
    this.state.selectedWorkspace = workspaceId
    this.state.loading = true
    this.state.error = null
    this.renderComponent()

    try {
      // Load both backups and autosave in parallel
      const [backupsResult, autosaveResult] = await Promise.all([
        this.call('s3Storage', 'list', { folder: `${workspaceId}/backups` }),
        this.call('s3Storage', 'list', { folder: `${workspaceId}/autosave` })
      ])
      
      this.state.backups = backupsResult.files || []
      
      // Autosave folder should only have one file
      const autosaveFiles = autosaveResult.files || []
      this.state.autosave = autosaveFiles.length > 0 ? autosaveFiles[0] : null
      
      this.emit('backupsLoaded', { workspaceId, backups: this.state.backups, autosave: this.state.autosave })
    } catch (e) {
      console.error('[CloudWorkspacesPlugin] Failed to load backups:', e)
      this.state.error = e.message || 'Failed to load backups'
    } finally {
      this.state.loading = false
      this.renderComponent()
    }
  }

  // Action handlers - will be called from UI
  async selectWorkspace(workspaceId: string): Promise<void> {
    await this.loadBackups(workspaceId)
  }

  async restoreBackup(backupFolder: string, backupFilename: string): Promise<void> {
    try {
      // Construct the relative path (without users/X prefix)
      const backupPath = `${backupFolder}/${backupFilename}`
      await this.call('s3Storage', 'restoreWorkspace', backupPath)
    } catch (e) {
      console.error('[CloudWorkspacesPlugin] Restore failed:', e)
      throw e
    }
  }

  async deleteBackup(backupFolder: string, backupFilename: string): Promise<void> {
    try {
      await this.call('s3Storage', 'delete', backupFilename, backupFolder)
      // Refresh the backup list
      if (this.state.selectedWorkspace) {
        await this.loadBackups(this.state.selectedWorkspace)
      }
    } catch (e) {
      console.error('[CloudWorkspacesPlugin] Delete failed:', e)
      throw e
    }
  }

  setDispatch(dispatch: React.Dispatch<any>): void {
    this.dispatch = dispatch
    this.renderComponent()
  }

  render(): JSX.Element {
    return (
      <div id="cloudWorkspaces" className="h-100">
        <PluginViewWrapper plugin={this} />
      </div>
    )
  }

  updateComponent(state: CloudWorkspacesState): JSX.Element {
    return (
      <RemixUICloudWorkspaces
        plugin={this}
        workspaces={state.workspaces}
        selectedWorkspace={state.selectedWorkspace}
        backups={state.backups}
        autosave={state.autosave}
        loading={state.loading}
        error={state.error}
        isAuthenticated={state.isAuthenticated}
        onSelectWorkspace={(id) => this.selectWorkspace(id)}
        onRestoreBackup={(folder, filename) => this.restoreBackup(folder, filename)}
        onDeleteBackup={(folder, filename) => this.deleteBackup(folder, filename)}
        onRefresh={() => this.refresh()}
      />
    )
  }

  renderComponent(): void {
    this.dispatch({ ...this.state })
  }
}
