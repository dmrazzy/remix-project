import React from 'react'
import { FormattedMessage } from 'react-intl'
import { WorkspaceSummary, StorageFile } from 'libs/remix-api/src/lib/plugins/api-types'
import { RemoteWorkspacesList, CurrentWorkspaceSection } from './components'
import { LoginButton } from '@remix-ui/login'

export interface CloudWorkspacesProps {
  plugin: any
  workspaces: WorkspaceSummary[]
  selectedWorkspace: string | null
  backups: StorageFile[]
  autosave: StorageFile | null
  loading: boolean
  error: string | null
  isAuthenticated: boolean
  onSelectWorkspace: (workspaceId: string) => void
  onRestoreBackup: (folder: string, filename: string) => void
  onDeleteBackup: (folder: string, filename: string) => void
  onRefresh: () => void
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
  onSelectWorkspace,
  onRestoreBackup,
  onDeleteBackup,
  onRefresh
}) => {

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
    <div className="cloud-workspaces-container h-100 d-flex flex-column" style={{ fontSize: '0.85rem' }}>
      {/* Current Workspace Section */}
      <CurrentWorkspaceSection 
        plugin={plugin} 
        isAuthenticated={isAuthenticated} 
      />

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
  )
}
