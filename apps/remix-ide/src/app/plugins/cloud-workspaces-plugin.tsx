import React from 'react'
import { ViewPlugin } from '@remixproject/engine-web'
import { PluginViewWrapper } from '@remix-ui/helper'
import * as packageJson from '../../../../../package.json'
import { RemixUICloudWorkspaces } from '@remix-ui/cloud-workspaces'
import { WorkspaceSummary, StorageFile } from 'libs/remix-api/src/lib/plugins/api-types'

const profile = {
  name: 'cloudWorkspaces',
  displayName: 'Cloud Workspaces',
  methods: [
    'getWorkspaces', 
    'getBackups', 
    'refresh', 
    'updateStatus',
    'saveToCloud',
    'createBackup',
    'restoreAutosave',
    'linkToCurrentUser',
    'updateWorkspaceRemoteId'
  ],
  events: ['workspacesLoaded', 'backupsLoaded', 'statusChanged'],
  icon: 'assets/img/cloud.svg',
  description: 'View and manage your cloud workspaces and backups',
  kind: 'storage',
  location: 'sidePanel',
  documentation: '',
  version: packageJson.version,
  maintainedBy: 'Remix'
}

// Badge status types for the sidebar icon
export type CloudStatusKey = 'none' | 'login' | 'link' | 'syncing' | 'synced' | 'autosave' | 'error'

interface CloudStatus {
  key: CloudStatusKey | number
  title: string
  type: 'warning' | 'success' | 'info' | 'error' | ''
}

// Current workspace cloud status - tracks sync state of the active workspace
export interface CurrentWorkspaceCloudStatus {
  workspaceName: string
  remoteId: string | null
  lastSaved: string | null
  lastBackup: string | null
  autosaveEnabled: boolean
  isSaving: boolean
  isBackingUp: boolean
  isRestoring: boolean
  isLinking: boolean
  ownedByCurrentUser: boolean
  linkedToAnotherUser: boolean
  canSave: boolean
}

const defaultWorkspaceStatus: CurrentWorkspaceCloudStatus = {
  workspaceName: '',
  remoteId: null,
  lastSaved: null,
  lastBackup: null,
  autosaveEnabled: false,
  isSaving: false,
  isBackingUp: false,
  isRestoring: false,
  isLinking: false,
  ownedByCurrentUser: true,
  linkedToAnotherUser: false,
  canSave: true
}

export interface CloudWorkspacesState {
  workspaces: WorkspaceSummary[]
  selectedWorkspace: string | null
  backups: StorageFile[]
  autosave: StorageFile | null
  loading: boolean
  error: string | null
  isAuthenticated: boolean
  currentStatus: CloudStatus
  currentWorkspaceStatus: CurrentWorkspaceCloudStatus
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
    isAuthenticated: false,
    currentStatus: { key: 'none', title: '', type: '' },
    currentWorkspaceStatus: { ...defaultWorkspaceStatus }
  }

  constructor() {
    super(profile)
  }

  // ==================== Status Badge Management ====================

  /**
   * Update the sidebar badge status based on current state
   */
  async updateStatus(): Promise<void> {    
    const status = await this.computeCurrentStatus()
    console.log('[CloudWorkspaces] Computed status:', status)
    
    if (status.key !== this.state.currentStatus.key) {
      console.log('[CloudWorkspaces] Status changed from', this.state.currentStatus.key, 'to', status.key)
      this.state.currentStatus = status
      console.log('[CloudWorkspaces] Emitting statusChanged:', status)
      this.emit('statusChanged', status)
    } else {
      console.log('[CloudWorkspaces] Status unchanged:', status.key)
    }
  }

  private async computeCurrentStatus(): Promise<CloudStatus> {
    console.log('[CloudWorkspaces] computeCurrentStatus - isAuthenticated:', this.state.isAuthenticated)
    
    // Check if any remote activity is in progress
    const status = this.state.currentWorkspaceStatus
    if (status.isSaving || status.isBackingUp || status.isRestoring || status.isLinking) {
      const activity = status.isSaving ? 'Saving' : 
                       status.isBackingUp ? 'Backing up' : 
                       status.isRestoring ? 'Restoring' : 'Linking'
      return { 
        key: 'syncing', 
        title: `${activity} to cloud...`, 
        type: 'info' 
      }
    }

    // Check if there's an error
    if (this.state.error) {
      return { 
        key: 'error', 
        title: this.state.error, 
        type: 'error' 
      }
    }

    // Check if user is logged in
    if (!this.state.isAuthenticated) {
      console.log('[CloudWorkspaces] Not authenticated, returning login status')
      return { 
        key: 'login', 
        title: 'Login to sync workspaces to cloud', 
        type: 'warning' 
      }
    }

    // Check if there's a current workspace
    try {
      const currentWorkspace = await this.call('filePanel', 'getCurrentWorkspace')
      console.log('[CloudWorkspaces] Current workspace:', currentWorkspace)
      if (!currentWorkspace || !currentWorkspace.name) {
        console.log('[CloudWorkspaces] No workspace open')
        return { key: 'none', title: '', type: '' }
      }

      // Check if workspace is linked to cloud
      const ownership = await this.call('s3Storage', 'getWorkspaceOwnership')
      console.log('[CloudWorkspaces] Ownership:', ownership)
      
      if (!ownership.remoteId) {
        return { 
          key: 'link', 
          title: 'Link workspace to cloud for backup', 
          type: 'info' 
        }
      }

      // Check if workspace is owned by another user
      if (!ownership.ownedByCurrentUser) {
        return { 
          key: 'error', 
          title: 'Workspace linked to another account', 
          type: 'error' 
        }
      }

      // Check if autosave is enabled and running
      const autosaveEnabled = await this.call('s3Storage', 'isAutosaveEnabled')
      if (autosaveEnabled) {
        return { 
          key: 'autosave', 
          title: 'Autosave enabled - syncing to cloud', 
          type: 'success' 
        }
      }

      // Workspace is linked but autosave is off
      return { 
        key: 'synced', 
        title: 'Workspace linked to cloud', 
        type: 'success' 
      }
    } catch (e) {
      console.warn('[CloudWorkspacesPlugin] Could not compute status:', e)
      return { key: 'none', title: '', type: '' }
    }
  }

  // ==================== Lifecycle ====================

  async onActivation(): Promise<void> {
    console.log('[CloudWorkspaces] Plugin activated')
    
    // Check auth status and load workspaces
    await this.checkAuthAndLoad()
    
    // Listen for auth state changes
    this.on('auth', 'authStateChanged', async (state: { isAuthenticated: boolean }) => {
      console.log('[CloudWorkspaces] authStateChanged:', state.isAuthenticated)
      this.state.isAuthenticated = state.isAuthenticated
      if (state.isAuthenticated) {
        await this.loadWorkspaces()
      } else {
        this.state.workspaces = []
        this.state.backups = []
        this.state.autosave = null
        this.state.selectedWorkspace = null
        this.state.currentWorkspaceStatus = { ...defaultWorkspaceStatus }
        this.renderComponent()
      }
      await this.loadCurrentWorkspaceStatus()
      await this.updateStatus()
    })
    
    // Listen for workspace changes
    this.on('filePanel', 'setWorkspace', async () => {
      console.log('[CloudWorkspaces] setWorkspace event received')
      await this.loadCurrentWorkspaceStatus()
      await this.updateStatus()
    })
    
    // Listen for backup events from s3Storage
    this.on('s3Storage', 'backupCompleted', async () => {
      console.log('[CloudWorkspaces] backupCompleted event received')
      await this.refresh()
      await this.loadCurrentWorkspaceStatus()
      await this.updateStatus()
    })
    
    // Listen for save events from s3Storage
    this.on('s3Storage', 'saveCompleted', async (data) => {
      console.log('[CloudWorkspaces] saveCompleted event received!', data)
      // Reset the saving flag that was set by autosaveStarted
      this.state.currentWorkspaceStatus = { ...this.state.currentWorkspaceStatus, isSaving: false }
      await this.loadCurrentWorkspaceStatus()
      await this.updateStatus()
    })
    
    // Listen for autosave starting (syncing indicator)
    this.on('s3Storage', 'autosaveStarted', async () => {
      console.log('[CloudWorkspaces] autosaveStarted event received')
      // Temporarily set syncing state for the badge
      this.state.currentWorkspaceStatus = { ...this.state.currentWorkspaceStatus, isSaving: true }
      await this.updateStatus()
    })
    
    // Listen for autosave setting changes
    this.on('s3Storage', 'autosaveChanged', async () => {
      console.log('[CloudWorkspaces] autosaveChanged event received')
      await this.loadCurrentWorkspaceStatus()
      await this.updateStatus()
    })
    
    // Initial status update
    console.log('[CloudWorkspaces] Calling initial updateStatus')
    await this.loadCurrentWorkspaceStatus()
    await this.updateStatus()
  }

  async onDeactivation(): Promise<void> {
    this.off('auth', 'authStateChanged')
    this.off('filePanel', 'setWorkspace')
    this.off('s3Storage', 'backupCompleted')
    this.off('s3Storage', 'saveCompleted')
    this.off('s3Storage', 'autosaveChanged')
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

  // ==================== Current Workspace Status ====================

  /**
   * Load the current workspace's cloud status
   */
  private async loadCurrentWorkspaceStatus(): Promise<void> {
    console.log('[CloudWorkspaces] loadCurrentWorkspaceStatus called')
    
    if (!this.state.isAuthenticated) {
      this.state.currentWorkspaceStatus = { ...defaultWorkspaceStatus }
      this.renderComponent()
      return
    }

    try {
      const currentWorkspace = await this.call('filePanel', 'getCurrentWorkspace')
      if (!currentWorkspace || !currentWorkspace.name) {
        this.state.currentWorkspaceStatus = { ...defaultWorkspaceStatus }
        this.renderComponent()
        return
      }

      const remoteId = await this.call('s3Storage', 'getWorkspaceRemoteId', currentWorkspace.name)
      const lastSaved = await this.call('s3Storage', 'getLastSaveTime', currentWorkspace.name)
      const lastBackup = await this.call('s3Storage', 'getLastBackupTime', currentWorkspace.name)
      const autosaveEnabled = await this.call('s3Storage', 'isAutosaveEnabled')
      const ownership = await this.call('s3Storage', 'getWorkspaceOwnership')
      
      console.log('[CloudWorkspaces] Ownership result:', ownership)

      this.state.currentWorkspaceStatus = {
        workspaceName: currentWorkspace.name,
        remoteId,
        lastSaved,
        lastBackup,
        autosaveEnabled,
        ownedByCurrentUser: ownership.ownedByCurrentUser,
        linkedToAnotherUser: ownership.linkedToAnotherUser,
        canSave: ownership.canSave,
        // Reset all action flags when loading fresh status
        isSaving: false,
        isBackingUp: false,
        isRestoring: false,
        isLinking: false
      }
      
      console.log('[CloudWorkspaces] Current workspace status loaded:', this.state.currentWorkspaceStatus)
      console.log('[CloudWorkspaces] canSave:', this.state.currentWorkspaceStatus.canSave)
      this.renderComponent()
    } catch (e) {
      console.error('[CloudWorkspacesPlugin] Failed to load workspace status:', e)
    }
  }

  // ==================== Current Workspace Actions ====================

  /**
   * Save current workspace to cloud
   */
  async saveToCloud(): Promise<void> {
    this.state.currentWorkspaceStatus = { ...this.state.currentWorkspaceStatus, isSaving: true }
    this.state.error = null
    this.renderComponent()
    await this.updateStatus()
    
    try {
      await this.call('s3Storage', 'saveToCloud')
      await this.loadCurrentWorkspaceStatus()
      await this.updateStatus()
    } catch (e) {
      this.state.error = e.message || 'Save failed'
      this.state.currentWorkspaceStatus = { ...this.state.currentWorkspaceStatus, isSaving: false }
      this.renderComponent()
      await this.updateStatus()
      throw e
    }
  }

  /**
   * Create a backup of current workspace
   */
  async createBackup(): Promise<void> {
    this.state.currentWorkspaceStatus = { ...this.state.currentWorkspaceStatus, isBackingUp: true }
    this.state.error = null
    this.renderComponent()
    await this.updateStatus()
    
    try {
      await this.call('s3Storage', 'backupWorkspace')
      await this.loadCurrentWorkspaceStatus()
      await this.updateStatus()
    } catch (e) {
      this.state.error = e.message || 'Backup failed'
      this.state.currentWorkspaceStatus = { ...this.state.currentWorkspaceStatus, isBackingUp: false }
      this.renderComponent()
      await this.updateStatus()
      throw e
    }
  }

  /**
   * Restore from autosave
   */
  async restoreAutosave(): Promise<void> {
    const remoteId = this.state.currentWorkspaceStatus.remoteId
    const workspaceName = this.state.currentWorkspaceStatus.workspaceName
    if (!remoteId || !workspaceName) return
    
    this.state.currentWorkspaceStatus = { ...this.state.currentWorkspaceStatus, isRestoring: true }
    this.state.error = null
    this.renderComponent()
    await this.updateStatus()
    
    try {
      // Build the autosave filename using the same sanitization as saveToCloud
      const sanitizedName = workspaceName.replace(/[^a-zA-Z0-9-_]/g, '-')
      const autosavePath = `${remoteId}/autosave/${sanitizedName}-autosave.zip`
      await this.call('s3Storage', 'restoreWorkspace', autosavePath)
      await this.loadCurrentWorkspaceStatus()
      await this.updateStatus()
    } catch (e) {
      this.state.error = e.message || 'Restore failed'
      this.state.currentWorkspaceStatus = { ...this.state.currentWorkspaceStatus, isRestoring: false }
      this.renderComponent()
      await this.updateStatus()
      throw e
    }
  }

  /**
   * Link workspace to current user
   */
  async linkToCurrentUser(): Promise<void> {
    this.state.currentWorkspaceStatus = { ...this.state.currentWorkspaceStatus, isLinking: true }
    this.state.error = null
    this.renderComponent()
    await this.updateStatus()
    
    try {
      await this.call('s3Storage', 'linkWorkspaceToCurrentUser')
      await this.loadCurrentWorkspaceStatus()
      await this.updateStatus()
    } catch (e) {
      this.state.error = e.message || 'Link failed'
      this.state.currentWorkspaceStatus = { ...this.state.currentWorkspaceStatus, isLinking: false }
      this.renderComponent()
      await this.updateStatus()
      throw e
    }
  }

  /**
   * Update workspace remote ID (rename in cloud)
   */
  async updateWorkspaceRemoteId(workspaceName: string, remoteId: string): Promise<void> {
    this.state.error = null
    
    try {
      await this.call('s3Storage', 'setWorkspaceRemoteId', workspaceName, remoteId)
      await this.loadCurrentWorkspaceStatus()
    } catch (e) {
      this.state.error = e.message || 'Failed to rename'
      this.renderComponent()
      throw e
    }
  }

  // ==================== Public API ====================
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
      
      // Extract the remote workspace ID from the backup path (first segment)
      const backupRemoteId = backupFolder.split('/')[0]
      
      // Check if current workspace has the same remote ID
      const currentRemoteId = await this.call('s3Storage', 'getWorkspaceRemoteId')
      const canRestoreToCurrent = currentRemoteId && currentRemoteId === backupRemoteId
      
      if (canRestoreToCurrent) {
        // Show modal with both options: restore to current or new workspace
        const restoreModal = {
          id: 'restoreBackupModal',
          title: 'Restore Backup',
          message: 'How would you like to restore this backup?',
          modalType: 'modal',
          okLabel: 'Restore to Current Workspace',
          cancelLabel: 'Create New Workspace',
          okFn: async () => {
            try {
              await this.call('s3Storage', 'restoreWorkspace', backupPath)
            } catch (e) {
              console.error('[CloudWorkspacesPlugin] Restore to current failed:', e)
              await this.call('notification', 'alert', {
                id: 'restoreError',
                title: 'Restore Failed',
                message: e.message || 'Failed to restore backup'
              })
            }
          },
          cancelFn: async () => {
            try {
              await this.call('s3Storage', 'restoreBackupToNewWorkspace', backupPath)
            } catch (e) {
              console.error('[CloudWorkspacesPlugin] Restore to new workspace failed:', e)
              await this.call('notification', 'alert', {
                id: 'restoreError',
                title: 'Restore Failed',
                message: e.message || 'Failed to restore backup to new workspace'
              })
            }
          },
          hideFn: () => null
        }
        await this.call('notification', 'modal', restoreModal)
      } else {
        // Only option is to restore to a new workspace - show confirmation
        const confirmModal = {
          id: 'restoreToNewWorkspaceModal',
          title: 'Restore to New Workspace',
          message: 'This will create a new workspace and restore the backup to it. Continue?',
          modalType: 'modal',
          okLabel: 'Yes, Create New Workspace',
          cancelLabel: 'Cancel',
          okFn: async () => {
            try {
              await this.call('s3Storage', 'restoreBackupToNewWorkspace', backupPath)
            } catch (e) {
              console.error('[CloudWorkspacesPlugin] Restore to new workspace failed:', e)
              await this.call('notification', 'alert', {
                id: 'restoreError',
                title: 'Restore Failed',
                message: e.message || 'Failed to restore backup to new workspace'
              })
            }
          },
          cancelFn: () => null,
          hideFn: () => null
        }
        await this.call('notification', 'modal', confirmModal)
      }
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
        currentWorkspaceStatus={state.currentWorkspaceStatus}
        onSelectWorkspace={(id) => this.selectWorkspace(id)}
        onRestoreBackup={(folder, filename) => this.restoreBackup(folder, filename)}
        onDeleteBackup={(folder, filename) => this.deleteBackup(folder, filename)}
        onRefresh={() => this.refresh()}
        onSaveToCloud={() => this.saveToCloud()}
        onCreateBackup={() => this.createBackup()}
        onRestoreAutosave={() => this.restoreAutosave()}
        onLinkToCurrentUser={() => this.linkToCurrentUser()}
        onUpdateRemoteId={(workspaceName, remoteId) => this.updateWorkspaceRemoteId(workspaceName, remoteId)}
      />
    )
  }

  renderComponent(): void {
    this.dispatch({ ...this.state })
  }
}
