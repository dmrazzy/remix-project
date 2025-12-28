import React from 'react'
import { useIntl } from 'react-intl'
import { CustomTooltip } from '@remix-ui/helper'
import { BackupItemProps, formatSize, formatDate } from '../types'

/**
 * Parse workspace name and timestamp from backup filename
 * Filename formats:
 * - New: "myproject-2025-12-27T18-11-29.zip" or "myproject-autosave.zip"
 * - Old: "backup-2025-12-27T18-11-29-248Z.zip" or "2025-12-27T18-11-29-248Z.zip"
 */
const parseBackupFilename = (filename: string): { workspaceName: string; isAutosave: boolean } => {
  // Remove .zip extension
  const name = filename.replace(/\.zip$/i, '')
  
  // Check if it's an autosave
  const isAutosave = name.endsWith('-autosave') || name === 'autosave-backup'
  
  // Old format: starts with "backup-" followed by timestamp
  if (name.startsWith('backup-') || /^\d{4}-\d{2}-\d{2}T/.test(name)) {
    return { workspaceName: 'unknown', isAutosave }
  }
  
  // New format: "workspacename-timestamp" or "workspacename-autosave"
  // Find the last occurrence of a timestamp pattern or "-autosave"
  const timestampMatch = name.match(/^(.+?)-(?:\d{4}-\d{2}-\d{2}T|autosave$)/)
  if (timestampMatch) {
    return { workspaceName: timestampMatch[1], isAutosave }
  }
  
  // Couldn't parse, return the whole name
  return { workspaceName: name, isAutosave }
}

export const BackupItem: React.FC<BackupItemProps> = ({
  backup,
  onRestore,
  onDelete
}) => {
  const intl = useIntl()
  const { workspaceName } = parseBackupFilename(backup.filename)
  const backupDate = formatDate(backup.lastModified)

  return (
    <div className="d-flex align-items-center py-1 px-2 border-bottom">
      <i className="fas fa-archive me-1 text-muted" style={{ fontSize: '0.75rem' }}></i>
      <CustomTooltip
        placement="top"
        tooltipText={`${workspaceName} • ${backupDate}`}
      >
        <div className="flex-grow-1 text-truncate" style={{ minWidth: 0, cursor: 'default' }}>
          <span className="small">
            {workspaceName}
          </span>
          <span className="text-muted ms-1" style={{ fontSize: '0.7rem' }}>
            {formatSize(backup.size)} · {backupDate}
          </span>
        </div>
      </CustomTooltip>
      <CustomTooltip
        placement="top"
        tooltipText={intl.formatMessage({ id: 'cloudWorkspaces.restoreBackupTip', defaultMessage: 'Restore this backup to your workspace' })}
      >
        <button
          className="btn btn-sm p-0 ms-1 text-success"
          onClick={(e) => {
            e.stopPropagation()
            onRestore(backup.folder, backup.filename)
          }}
          style={{ border: 'none', background: 'none' }}
        >
          <i className="fas fa-download" style={{ fontSize: '0.8rem' }}></i>
        </button>
      </CustomTooltip>
      <CustomTooltip
        placement="top"
        tooltipText={intl.formatMessage({ id: 'cloudWorkspaces.deleteBackupTip', defaultMessage: 'Delete this backup permanently' })}
      >
        <button
          className="btn btn-sm p-0 ms-1 text-danger"
          onClick={(e) => {
            e.stopPropagation()
            onDelete(backup.folder, backup.filename)
          }}
          style={{ border: 'none', background: 'none' }}
        >
          <i className="fas fa-trash" style={{ fontSize: '0.8rem' }}></i>
        </button>
      </CustomTooltip>
    </div>
  )
}
