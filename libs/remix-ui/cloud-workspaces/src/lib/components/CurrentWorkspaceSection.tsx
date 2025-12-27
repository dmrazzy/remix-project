import React, { useState, useEffect } from 'react'
import { FormattedMessage, useIntl } from 'react-intl'
import { CustomTooltip } from '@remix-ui/helper'

export interface CurrentWorkspaceSectionProps {
  plugin: any
  isAuthenticated: boolean
}

interface WorkspaceCloudStatus {
  workspaceName: string
  remoteId: string | null
  lastSaved: string | null
  lastBackup: string | null
  autosaveEnabled: boolean
  isSaving: boolean
  isBackingUp: boolean
  isRestoring: boolean
}

export const CurrentWorkspaceSection: React.FC<CurrentWorkspaceSectionProps> = ({
  plugin,
  isAuthenticated
}) => {
  const intl = useIntl()
  const [status, setStatus] = useState<WorkspaceCloudStatus>({
    workspaceName: '',
    remoteId: null,
    lastSaved: null,
    lastBackup: null,
    autosaveEnabled: false,
    isSaving: false,
    isBackingUp: false,
    isRestoring: false
  })
  const [isEditingName, setIsEditingName] = useState(false)
  const [editedName, setEditedName] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (isAuthenticated) {
      loadStatus()
    }
  }, [isAuthenticated])

  useEffect(() => {
    // Listen for workspace changes
    const handleWorkspaceChange = () => {
      if (isAuthenticated) {
        loadStatus()
      }
    }

    plugin.on('filePanel', 'workspaceCreated', handleWorkspaceChange)
    plugin.on('filePanel', 'workspaceRenamed', handleWorkspaceChange)
    plugin.on('filePanel', 'setWorkspace', handleWorkspaceChange)
    plugin.on('s3Storage', 'backupCompleted', handleWorkspaceChange)
    plugin.on('s3Storage', 'saveCompleted', handleWorkspaceChange)

    return () => {
      plugin.off('filePanel', 'workspaceCreated')
      plugin.off('filePanel', 'workspaceRenamed')
      plugin.off('filePanel', 'setWorkspace')
      plugin.off('s3Storage', 'backupCompleted')
      plugin.off('s3Storage', 'saveCompleted')
    }
  }, [plugin, isAuthenticated])

  const loadStatus = async () => {
    try {
      const currentWorkspace = await plugin.call('filePanel', 'getCurrentWorkspace')
      if (!currentWorkspace || !currentWorkspace.name) {
        setStatus(prev => ({ ...prev, workspaceName: '', remoteId: null }))
        return
      }

      const remoteId = await plugin.call('s3Storage', 'getWorkspaceRemoteId', currentWorkspace.name)
      const lastSaved = await plugin.call('s3Storage', 'getLastSaveTime', currentWorkspace.name)
      const lastBackup = await plugin.call('s3Storage', 'getLastBackupTime', currentWorkspace.name)
      const autosaveEnabled = await plugin.call('s3Storage', 'isAutosaveEnabled')

      setStatus({
        workspaceName: currentWorkspace.name,
        remoteId,
        lastSaved,
        lastBackup,
        autosaveEnabled,
        isSaving: false,
        isBackingUp: false,
        isRestoring: false
      })
      setEditedName(remoteId || '')
    } catch (e) {
      console.error('Failed to load workspace status:', e)
    }
  }

  const handleSaveToCloud = async () => {
    setStatus(prev => ({ ...prev, isSaving: true }))
    setError(null)
    try {
      await plugin.call('s3Storage', 'saveToCloud')
      await loadStatus()
    } catch (e) {
      setError(e.message || 'Save failed')
    } finally {
      setStatus(prev => ({ ...prev, isSaving: false }))
    }
  }

  const handleCreateBackup = async () => {
    setStatus(prev => ({ ...prev, isBackingUp: true }))
    setError(null)
    try {
      await plugin.call('s3Storage', 'backupWorkspace')
      await loadStatus()
    } catch (e) {
      setError(e.message || 'Backup failed')
    } finally {
      setStatus(prev => ({ ...prev, isBackingUp: false }))
    }
  }

  const handleRestoreAutosave = async () => {
    if (!status.remoteId) return
    
    setStatus(prev => ({ ...prev, isRestoring: true }))
    setError(null)
    try {
      const autosavePath = `${status.remoteId}/autosave/autosave-backup.zip`
      await plugin.call('s3Storage', 'restoreWorkspace', autosavePath)
      await loadStatus()
    } catch (e) {
      setError(e.message || 'Restore failed')
    } finally {
      setStatus(prev => ({ ...prev, isRestoring: false }))
    }
  }

  const handleStartEditName = () => {
    setEditedName(status.remoteId || '')
    setIsEditingName(true)
  }

  const handleCancelEditName = () => {
    setIsEditingName(false)
    setEditedName(status.remoteId || '')
  }

  const handleSaveName = async () => {
    if (!editedName.trim()) return
    
    setError(null)
    try {
      await plugin.call('s3Storage', 'setWorkspaceRemoteId', status.workspaceName, editedName.trim())
      setIsEditingName(false)
      await loadStatus()
    } catch (e) {
      setError(e.message || 'Failed to rename')
    }
  }

  const formatRelativeTime = (dateStr: string | null): string => {
    if (!dateStr) return intl.formatMessage({ id: 'cloudWorkspaces.never', defaultMessage: 'Never' })
    
    const date = new Date(dateStr)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMs / 3600000)
    const diffDays = Math.floor(diffMs / 86400000)

    if (diffMins < 1) return intl.formatMessage({ id: 'cloudWorkspaces.justNow', defaultMessage: 'Just now' })
    if (diffMins < 60) return intl.formatMessage({ id: 'cloudWorkspaces.minsAgo', defaultMessage: '{mins} min ago' }, { mins: diffMins })
    if (diffHours < 24) return intl.formatMessage({ id: 'cloudWorkspaces.hoursAgo', defaultMessage: '{hours}h ago' }, { hours: diffHours })
    if (diffDays < 7) return intl.formatMessage({ id: 'cloudWorkspaces.daysAgo', defaultMessage: '{days}d ago' }, { days: diffDays })
    
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  }

  if (!isAuthenticated) {
    return null
  }

  if (!status.workspaceName) {
    return (
      <div className="current-workspace-section border-bottom pb-2 mb-2">
        <div className="px-2 py-1 text-muted small">
          <i className="fas fa-folder-open me-1"></i>
          <FormattedMessage id="cloudWorkspaces.noWorkspaceOpen" defaultMessage="No workspace open" />
        </div>
      </div>
    )
  }

  return (
    <div className="current-workspace-section border-bottom pb-2 mb-2">
      {/* Section Header */}
      <div className="px-2 py-1 border-bottom">
        <span className="text-muted small">
          <i className="fas fa-folder me-1"></i>
          <FormattedMessage id="cloudWorkspaces.currentWorkspace" defaultMessage="Current Workspace" />
        </span>
      </div>

      {/* Workspace Info */}
      <div className="px-2 py-2">
        {/* Local workspace name */}
        <div className="small mb-1">
          <span className="text-muted">Local: </span>
          <span className="fw-bold text-truncate" title={status.workspaceName}>
            {status.workspaceName}
          </span>
        </div>

        {/* Remote ID with edit */}
        <div className="small mb-2">
          <span className="text-muted">Cloud: </span>
          {isEditingName ? (
            <div className="d-inline-flex align-items-center">
              <input
                type="text"
                className="form-control form-control-sm py-0"
                style={{ fontSize: '0.8rem', width: '120px' }}
                value={editedName}
                onChange={(e) => setEditedName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSaveName()
                  if (e.key === 'Escape') handleCancelEditName()
                }}
                autoFocus
              />
              <button
                className="btn btn-sm p-0 ms-1 text-success"
                onClick={handleSaveName}
                style={{ border: 'none', background: 'none' }}
              >
                <i className="fas fa-check" style={{ fontSize: '0.75rem' }}></i>
              </button>
              <button
                className="btn btn-sm p-0 ms-1 text-muted"
                onClick={handleCancelEditName}
                style={{ border: 'none', background: 'none' }}
              >
                <i className="fas fa-times" style={{ fontSize: '0.75rem' }}></i>
              </button>
            </div>
          ) : (
            <>
              <span className="text-truncate" title={status.remoteId || ''}>
                {status.remoteId || <span className="text-muted fst-italic">
                  <FormattedMessage id="cloudWorkspaces.notLinked" defaultMessage="Not linked" />
                </span>}
              </span>
              {status.remoteId && (
                <CustomTooltip
                  placement="top"
                  tooltipText={intl.formatMessage({ id: 'cloudWorkspaces.editCloudName', defaultMessage: 'Edit cloud name' })}
                >
                  <button
                    className="btn btn-sm p-0 ms-1 text-muted"
                    onClick={handleStartEditName}
                    style={{ border: 'none', background: 'none' }}
                  >
                    <i className="fas fa-pencil-alt" style={{ fontSize: '0.65rem' }}></i>
                  </button>
                </CustomTooltip>
              )}
            </>
          )}
        </div>

        {/* Status indicators */}
        {status.remoteId && (
          <div className="d-flex flex-wrap gap-2 mb-2" style={{ fontSize: '0.7rem' }}>
            <span className="text-muted">
              <i className="fas fa-cloud-upload-alt me-1"></i>
              <FormattedMessage id="cloudWorkspaces.lastSaved" defaultMessage="Saved" />: {formatRelativeTime(status.lastSaved)}
            </span>
            <span className="text-muted">
              <i className="fas fa-archive me-1"></i>
              <FormattedMessage id="cloudWorkspaces.lastBackup" defaultMessage="Backup" />: {formatRelativeTime(status.lastBackup)}
            </span>
          </div>
        )}

        {/* Error display */}
        {error && (
          <div className="alert alert-danger py-1 px-2 mb-2 small">
            <i className="fas fa-exclamation-triangle me-1"></i>
            {error}
          </div>
        )}

        {/* Action buttons */}
        <div className="d-flex gap-1">
          <CustomTooltip
            placement="top"
            tooltipText={intl.formatMessage({ id: 'cloudWorkspaces.saveToCloudTip', defaultMessage: 'Save current state to cloud' })}
          >
            <button
              className="btn btn-sm btn-outline-primary flex-grow-1"
              onClick={handleSaveToCloud}
              disabled={status.isSaving || status.isBackingUp || status.isRestoring}
              style={{ fontSize: '0.75rem', padding: '0.25rem 0.5rem' }}
            >
              {status.isSaving ? (
                <i className="fas fa-spinner fa-spin me-1"></i>
              ) : (
                <i className="fas fa-cloud-upload-alt me-1"></i>
              )}
              <FormattedMessage id="cloudWorkspaces.saveToCloud" defaultMessage="Save" />
            </button>
          </CustomTooltip>
          
          <CustomTooltip
            placement="top"
            tooltipText={intl.formatMessage({ id: 'cloudWorkspaces.createBackupTip', defaultMessage: 'Create a timestamped backup' })}
          >
            <button
              className="btn btn-sm btn-outline-secondary flex-grow-1"
              onClick={handleCreateBackup}
              disabled={status.isSaving || status.isBackingUp || status.isRestoring}
              style={{ fontSize: '0.75rem', padding: '0.25rem 0.5rem' }}
            >
              {status.isBackingUp ? (
                <i className="fas fa-spinner fa-spin me-1"></i>
              ) : (
                <i className="fas fa-archive me-1"></i>
              )}
              <FormattedMessage id="cloudWorkspaces.createBackup" defaultMessage="Backup" />
            </button>
          </CustomTooltip>
          
          {/* Restore button - only show if there's a saved state */}
          {status.lastSaved && (
            <CustomTooltip
              placement="top"
              tooltipText={intl.formatMessage({ id: 'cloudWorkspaces.restoreAutosaveTip', defaultMessage: 'Restore from last cloud save' })}
            >
              <button
                className="btn btn-sm btn-outline-success flex-grow-1"
                onClick={handleRestoreAutosave}
                disabled={status.isSaving || status.isBackingUp || status.isRestoring}
                style={{ fontSize: '0.75rem', padding: '0.25rem 0.5rem' }}
              >
                {status.isRestoring ? (
                  <i className="fas fa-spinner fa-spin me-1"></i>
                ) : (
                  <i className="fas fa-download me-1"></i>
                )}
                <FormattedMessage id="cloudWorkspaces.restoreAutosave" defaultMessage="Restore" />
              </button>
            </CustomTooltip>
          )}
        </div>

        {/* Autosave indicator */}
        {status.autosaveEnabled && (
          <div className="mt-1 text-center" style={{ fontSize: '0.65rem' }}>
            <span className="text-success">
              <i className="fas fa-check-circle me-1"></i>
              <FormattedMessage id="cloudWorkspaces.autosaveOn" defaultMessage="Autosave enabled" />
            </span>
          </div>
        )}
      </div>
    </div>
  )
}
