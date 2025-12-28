import React from 'react'
import { useIntl } from 'react-intl'
import { CustomTooltip } from '@remix-ui/helper'
import { AutosaveItemProps, formatSize, formatDate } from '../types'

/**
 * Parse workspace name from autosave filename
 * Filename format: "myproject-autosave.zip" or old "autosave-backup.zip"
 */
const parseAutosaveFilename = (filename: string): string | null => {
  const name = filename.replace(/\.zip$/i, '')
  
  // Old format
  if (name === 'autosave-backup') {
    return null
  }
  
  // New format: "workspacename-autosave"
  if (name.endsWith('-autosave')) {
    return name.replace(/-autosave$/, '')
  }
  
  return null
}

export const AutosaveItem: React.FC<AutosaveItemProps> = ({
  autosave,
  onRestore
}) => {
  const intl = useIntl()
  const workspaceName = parseAutosaveFilename(autosave.filename)

  return (
    <div className="d-flex align-items-center py-1 px-2 border-bottom">
      <i className="fas fa-clock me-1 text-info" style={{ fontSize: '0.75rem' }}></i>
      <CustomTooltip
        placement="top"
        tooltipText={`${workspaceName || 'Autosave'} • ${formatDate(autosave.lastModified)}`}
      >
        <div className="flex-grow-1 text-truncate" style={{ minWidth: 0, cursor: 'default' }}>
          <span className="small text-info">autosave</span>
          {workspaceName && (
            <span className="text-muted ms-1" style={{ fontSize: '0.7rem' }}>
              ({workspaceName})
            </span>
          )}
          <span className="text-muted ms-1" style={{ fontSize: '0.7rem' }}>
            {formatSize(autosave.size)} · {formatDate(autosave.lastModified)}
          </span>
        </div>
      </CustomTooltip>
      <CustomTooltip
        placement="top"
        tooltipText={intl.formatMessage({ id: 'cloudWorkspaces.restoreAutosaveTip', defaultMessage: 'Restore from this autosave' })}
      >
        <button
          className="btn btn-sm p-0 ms-1 text-success"
          onClick={(e) => {
            e.stopPropagation()
            onRestore(autosave.folder, autosave.filename)
          }}
          style={{ border: 'none', background: 'none' }}
        >
          <i className="fas fa-download" style={{ fontSize: '0.8rem' }}></i>
        </button>
      </CustomTooltip>
    </div>
  )
}
