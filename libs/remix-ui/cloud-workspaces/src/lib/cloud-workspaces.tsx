import React, { useState } from 'react'
import { FormattedMessage, useIntl } from 'react-intl'
import { WorkspaceSummary, StorageFile } from 'libs/remix-api/src/lib/plugins/api-types'
import { CustomTooltip } from '@remix-ui/helper'

interface CloudWorkspacesProps {
  plugin: any
  workspaces: WorkspaceSummary[]
  selectedWorkspace: string | null
  backups: StorageFile[]
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
  loading,
  error,
  isAuthenticated,
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

  const formatDate = (dateStr: string | null): string => {
    if (!dateStr) return 'Never'
    const date = new Date(dateStr)
    return date.toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  const formatSize = (bytes: number): string => {
    if (bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
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
    <div className="cloud-workspaces-container h-100 d-flex flex-column">
      {/* Header */}
      <div className="d-flex justify-content-between align-items-center px-3 py-2 border-bottom">
        <h6 className="mb-0">
          <i className="fas fa-cloud me-2"></i>
          <FormattedMessage id="cloudWorkspaces.title" defaultMessage="Cloud Workspaces" />
        </h6>
        <CustomTooltip
          placement="bottom"
          tooltipText={intl.formatMessage({ id: 'cloudWorkspaces.refresh', defaultMessage: 'Refresh' })}
        >
          <button
            className="btn btn-sm btn-outline-secondary"
            onClick={onRefresh}
            disabled={loading}
          >
            <i className={`fas fa-sync-alt ${loading ? 'fa-spin' : ''}`}></i>
          </button>
        </CustomTooltip>
      </div>

      {/* Error Display */}
      {error && (
        <div className="alert alert-danger m-2 py-2">
          <i className="fas fa-exclamation-triangle me-2"></i>
          {error}
        </div>
      )}

      {/* Workspaces List */}
      <div className="flex-grow-1 overflow-auto">
        {loading && workspaces.length === 0 ? (
          <div className="text-center p-4">
            <i className="fas fa-spinner fa-spin fa-2x"></i>
            <p className="mt-2 text-muted">
              <FormattedMessage id="cloudWorkspaces.loading" defaultMessage="Loading workspaces..." />
            </p>
          </div>
        ) : workspaces.length === 0 ? (
          <div className="text-center p-4">
            <i className="fas fa-folder-open fa-2x text-muted mb-2"></i>
            <p className="text-muted">
              <FormattedMessage id="cloudWorkspaces.noWorkspaces" defaultMessage="No cloud workspaces found" />
            </p>
            <small className="text-muted">
              <FormattedMessage id="cloudWorkspaces.backupHint" defaultMessage="Use 'Cloud Backup' from the workspace menu to backup your first workspace" />
            </small>
          </div>
        ) : (
          <div className="list-group list-group-flush">
            {workspaces.map((workspace) => (
              <div key={workspace.id} className="workspace-item">
                {/* Workspace Header */}
                <div
                  className={`list-group-item list-group-item-action d-flex justify-content-between align-items-center cursor-pointer ${
                    expandedWorkspaces.has(workspace.id) ? 'active' : ''
                  }`}
                  onClick={() => toggleWorkspaceExpand(workspace.id)}
                >
                  <div className="d-flex align-items-center">
                    <i className={`fas fa-chevron-${expandedWorkspaces.has(workspace.id) ? 'down' : 'right'} me-2`}></i>
                    <i className="fas fa-folder me-2"></i>
                    <div>
                      <div className="fw-bold">{workspace.id}</div>
                      <small className="text-muted">
                        {workspace.backupCount} {workspace.backupCount === 1 ? 'backup' : 'backups'} • {formatSize(workspace.totalSize)}
                      </small>
                    </div>
                  </div>
                  {workspace.lastBackup && (
                    <small className="text-muted">
                      {formatDate(workspace.lastBackup)}
                    </small>
                  )}
                </div>

                {/* Backups List (when expanded) */}
                {expandedWorkspaces.has(workspace.id) && selectedWorkspace === workspace.id && (
                  <div className="backup-list ms-4 border-start">
                    {loading ? (
                      <div className="p-2 text-center">
                        <i className="fas fa-spinner fa-spin"></i>
                      </div>
                    ) : backups.length === 0 ? (
                      <div className="p-2 text-muted small">
                        <FormattedMessage id="cloudWorkspaces.noBackups" defaultMessage="No backups available" />
                      </div>
                    ) : (
                      backups.map((backup, index) => (
                        <div
                          key={backup.key || index}
                          className="d-flex justify-content-between align-items-center py-2 px-3 border-bottom"
                        >
                          <div>
                            <i className="fas fa-archive me-2 text-muted"></i>
                            <span className="small">{backup.filename}</span>
                            <br />
                            <small className="text-muted">
                              {formatSize(backup.size)} • {formatDate(backup.lastModified)}
                            </small>
                          </div>
                          <div className="btn-group btn-group-sm">
                            <CustomTooltip
                              placement="top"
                              tooltipText={intl.formatMessage({ id: 'cloudWorkspaces.restore', defaultMessage: 'Restore this backup' })}
                            >
                              <button
                                className="btn btn-outline-success btn-sm"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  handleRestore(backup.folder, backup.filename)
                                }}
                              >
                                <i className="fas fa-download"></i>
                              </button>
                            </CustomTooltip>
                            <CustomTooltip
                              placement="top"
                              tooltipText={intl.formatMessage({ id: 'cloudWorkspaces.delete', defaultMessage: 'Delete this backup' })}
                            >
                              <button
                                className="btn btn-outline-danger btn-sm"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  handleDeleteConfirm(backup.folder, backup.filename)
                                }}
                              >
                                <i className="fas fa-trash"></i>
                              </button>
                            </CustomTooltip>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Delete Confirmation Modal */}
      {confirmDelete && (
        <div className="modal d-block" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <div className="modal-dialog modal-dialog-centered">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">
                  <FormattedMessage id="cloudWorkspaces.confirmDelete" defaultMessage="Confirm Delete" />
                </h5>
                <button type="button" className="btn-close" onClick={handleDeleteCancel}></button>
              </div>
              <div className="modal-body">
                <p>
                  <FormattedMessage 
                    id="cloudWorkspaces.confirmDeleteMessage" 
                    defaultMessage="Are you sure you want to delete this backup? This action cannot be undone."
                  />
                </p>
                <code>{confirmDelete.filename}</code>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={handleDeleteCancel}>
                  <FormattedMessage id="cloudWorkspaces.cancel" defaultMessage="Cancel" />
                </button>
                <button type="button" className="btn btn-danger" onClick={handleDeleteExecute}>
                  <FormattedMessage id="cloudWorkspaces.delete" defaultMessage="Delete" />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
