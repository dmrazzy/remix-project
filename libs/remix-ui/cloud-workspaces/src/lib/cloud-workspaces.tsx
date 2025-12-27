import React from 'react'
import { FormattedMessage } from 'react-intl'
import { WorkspaceSummary, StorageFile } from 'libs/remix-api/src/lib/plugins/api-types'
import { RemoteWorkspacesList } from './components'

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
        <button
          className="btn btn-primary"
          onClick={() => plugin.call('menuicons', 'select', 'settings')}
        >
          <FormattedMessage id="cloudWorkspaces.login" defaultMessage="Log In" />
        </button>
      </div>
    )
  }

  return (
    <div className="cloud-workspaces-container h-100 d-flex flex-column" style={{ fontSize: '0.85rem' }}>
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

      {/* Current Workspace Section - placeholder for future */}
      {/* <CurrentWorkspaceSection plugin={plugin} /> */}
    </div>
  )
}
