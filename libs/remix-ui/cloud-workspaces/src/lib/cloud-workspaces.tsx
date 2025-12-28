import React from 'react'
import { FormattedMessage } from 'react-intl'
import { WorkspaceSummary, StorageFile } from 'libs/remix-api/src/lib/plugins/api-types'
import { RemoteWorkspacesList, CurrentWorkspaceSection } from './components'
import { LoginButton } from '@remix-ui/login'
import { CloudWorkspacesProvider, CurrentWorkspaceCloudStatus, CloudWorkspacesContextValue } from './context'

export interface CloudWorkspacesProps {
  plugin: any
  workspaces: WorkspaceSummary[]
  selectedWorkspace: string | null
  backups: StorageFile[]
  autosave: StorageFile | null
  loading: boolean
  error: string | null
  isAuthenticated: boolean
  currentWorkspaceStatus: CurrentWorkspaceCloudStatus
  onSelectWorkspace: (workspaceId: string) => void
  onRestoreBackup: (folder: string, filename: string) => void
  onDeleteBackup: (folder: string, filename: string) => void
  onRefresh: () => void
  onSaveToCloud: () => Promise<void>
  onCreateBackup: () => Promise<void>
  onRestoreAutosave: () => Promise<void>
  onLinkToCurrentUser: () => Promise<void>
  onUpdateRemoteId: (workspaceName: string, remoteId: string) => Promise<void>
}

export const RemixUICloudWorkspaces: React.FC<CloudWorkspacesProps> = ({
  plugin,
  workspaces,
  selectedWorkspace,
  backups,
  autosave,
  loading,
  error,
  isAuthenticated,
  currentWorkspaceStatus,
  onSelectWorkspace,
  onRestoreBackup,
  onDeleteBackup,
  onRefresh,
  onSaveToCloud,
  onCreateBackup,
  onRestoreAutosave,
  onLinkToCurrentUser,
  onUpdateRemoteId
}) => {
  // Create context value from props
  const contextValue: CloudWorkspacesContextValue = {
    isAuthenticated,
    loading,
    error,
    currentWorkspaceStatus,
    saveToCloud: onSaveToCloud,
    createBackup: onCreateBackup,
    restoreAutosave: onRestoreAutosave,
    linkToCurrentUser: onLinkToCurrentUser,
    setWorkspaceRemoteId: onUpdateRemoteId,
    refresh: async () => { onRefresh() }
  }

  if (!isAuthenticated) {
    return (
      <div className="p-3 text-center">
        <i className="fas fa-cloud fa-3x mb-3 text-muted"></i>
        <p className="text-muted">
          <FormattedMessage id="cloudWorkspaces.loginRequired" defaultMessage="Please log in to view your cloud workspaces" />
        </p>
        <LoginButton
          plugin={plugin}
          variant="compact"
          showCredits={true}
        />
      </div>
    )
  }

  return (
    <CloudWorkspacesProvider value={contextValue}>
      <div className="cloud-workspaces-container h-100 d-flex flex-column" style={{ fontSize: '0.85rem' }}>
        {/* Current Workspace Section */}
        <CurrentWorkspaceSection plugin={plugin} />

        {/* Remote Workspaces Section */}
        <RemoteWorkspacesList
          workspaces={workspaces}
          selectedWorkspace={selectedWorkspace}
          backups={backups}
          autosave={autosave}
          loading={loading}
          error={error}
          onSelectWorkspace={onSelectWorkspace}
          onRestoreBackup={onRestoreBackup}
          onDeleteBackup={onDeleteBackup}
          onRefresh={onRefresh}
        />
      </div>
    </CloudWorkspacesProvider>
  )
}
