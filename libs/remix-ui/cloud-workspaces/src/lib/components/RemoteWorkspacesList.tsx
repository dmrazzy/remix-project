import React, { useState } from 'react'
import { FormattedMessage, useIntl } from 'react-intl'
import { CustomTooltip } from '@remix-ui/helper'
import { WorkspaceSummary, StorageFile } from 'libs/remix-api/src/lib/plugins/api-types'
import { WorkspaceItem } from './WorkspaceItem'
import { DeleteConfirmModal } from './DeleteConfirmModal'

export interface RemoteWorkspacesListProps {
  workspaces: WorkspaceSummary[]
  selectedWorkspace: string | null
  backups: StorageFile[]
  autosave: StorageFile | null
  loading: boolean
  error: string | null
  onSelectWorkspace: (workspaceId: string) => void
  onRestoreBackup: (folder: string, filename: string) => void
  onDeleteBackup: (folder: string, filename: string) => void
  onRefresh: () => void
}

export const RemoteWorkspacesList: React.FC<RemoteWorkspacesListProps> = ({
  workspaces,
  selectedWorkspace,
  backups,
  autosave,
  loading,
  error,
  onSelectWorkspace,
  onRestoreBackup,
  onDeleteBackup,
  onRefresh
}) => {
  const intl = useIntl()
  const [expandedWorkspaces, setExpandedWorkspaces] = useState<Set<string>>(new Set())
  const [confirmDelete, setConfirmDelete] = useState<{ folder: string; filename: string } | null>(null)

  const toggleWorkspaceExpand = (workspaceId: string) => {
    const newExpanded = new Set(expandedWorkspaces)
    if (newExpanded.has(workspaceId)) {
      newExpanded.delete(workspaceId)
    } else {
      newExpanded.add(workspaceId)
      onSelectWorkspace(workspaceId)
    }
    setExpandedWorkspaces(newExpanded)
  }

  const handleRestore = async (folder: string, filename: string) => {
    try {
      await onRestoreBackup(folder, filename)
    } catch (e) {
      console.error('Restore failed:', e)
    }
  }

  const handleDeleteConfirm = (folder: string, filename: string) => {
    setConfirmDelete({ folder, filename })
  }

  const handleDeleteCancel = () => {
    setConfirmDelete(null)
  }

  const handleDeleteExecute = async () => {
    if (confirmDelete) {
      try {
        await onDeleteBackup(confirmDelete.folder, confirmDelete.filename)
      } catch (e) {
        console.error('Delete failed:', e)
      }
      setConfirmDelete(null)
    }
  }

  return (
    <div className="remote-workspaces-section">
      {/* Section Header */}
      <div className="d-flex justify-content-between align-items-center px-2 py-1 border-bottom">
        <span className="text-muted small">
          <i className="fas fa-cloud me-1"></i>
          <FormattedMessage id="cloudWorkspaces.remoteWorkspaces" defaultMessage="Remote Workspaces" />
        </span>
        <CustomTooltip
          placement="bottom"
          tooltipText={intl.formatMessage({ id: 'cloudWorkspaces.refresh', defaultMessage: 'Refresh' })}
        >
          <button
            className="btn btn-sm p-0 text-muted"
            onClick={onRefresh}
            disabled={loading}
            style={{ border: 'none', background: 'none' }}
          >
            <i className={`fas fa-sync-alt ${loading ? 'fa-spin' : ''}`}></i>
          </button>
        </CustomTooltip>
      </div>

      {/* Error Display */}
      {error && (
        <div className="alert alert-danger m-1 py-1 small">
          <i className="fas fa-exclamation-triangle me-1"></i>
          {error}
        </div>
      )}

      {/* Workspaces List */}
      <div className="workspaces-list">
        {loading && workspaces.length === 0 ? (
          <div className="text-center p-3">
            <i className="fas fa-spinner fa-spin"></i>
            <p className="mt-1 mb-0 text-muted small">
              <FormattedMessage id="cloudWorkspaces.loading" defaultMessage="Loading..." />
            </p>
          </div>
        ) : workspaces.length === 0 ? (
          <div className="text-center p-3">
            <i className="fas fa-folder-open text-muted mb-1"></i>
            <p className="text-muted small mb-1">
              <FormattedMessage id="cloudWorkspaces.noWorkspaces" defaultMessage="No cloud workspaces" />
            </p>
            <small className="text-muted" style={{ fontSize: '0.75rem' }}>
              <FormattedMessage id="cloudWorkspaces.backupHint" defaultMessage="Use 'Cloud Backup' to backup your first workspace" />
            </small>
          </div>
        ) : (
          <div className="list-group list-group-flush">
            {workspaces.map((workspace) => (
              <WorkspaceItem
                key={workspace.id}
                workspace={workspace}
                isExpanded={expandedWorkspaces.has(workspace.id)}
                isSelected={selectedWorkspace === workspace.id}
                backups={selectedWorkspace === workspace.id ? backups : []}
                autosave={selectedWorkspace === workspace.id ? autosave : null}
                loading={loading && selectedWorkspace === workspace.id}
                onToggleExpand={toggleWorkspaceExpand}
                onRestore={handleRestore}
                onDelete={handleDeleteConfirm}
              />
            ))}
          </div>
        )}
      </div>

      {/* Delete Confirmation Modal */}
      {confirmDelete && (
        <DeleteConfirmModal
          filename={confirmDelete.filename}
          onConfirm={handleDeleteExecute}
          onCancel={handleDeleteCancel}
        />
      )}
    </div>
  )
}
