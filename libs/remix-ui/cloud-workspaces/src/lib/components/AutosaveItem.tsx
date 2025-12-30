import React from 'react'
import { useIntl } from 'react-intl'
import { CustomTooltip } from '@remix-ui/helper'
import { AutosaveItemProps, formatSize, formatDate } from '../types'

/**
 * Parse workspace name from autosave filename
 * Filename format: "myproject-autosave.zip" or old "autosave-backup.zip"
 * Encrypted: any of the above with .enc suffix
 */
const parseAutosaveFilename = (filename: string): { workspaceName: string | null; isEncrypted: boolean } => {
  // Check if encrypted
  const isEncrypted = filename.endsWith('.enc')
  
  const name = filename.replace(/\.zip(\.enc)?$/i, '')
  
  // Old format
  if (name === 'autosave-backup') {
    return { workspaceName: null, isEncrypted }
  }
  
  // New format: "workspacename-autosave"
  if (name.endsWith('-autosave')) {
    return { workspaceName: name.replace(/-autosave$/, ''), isEncrypted }
  }
  
  return { workspaceName: null, isEncrypted }
}

export const AutosaveItem: React.FC<AutosaveItemProps> = ({
  autosave,
  onRestore,
  onDownload
}) => {
  const intl = useIntl()
  const { workspaceName, isEncrypted } = parseAutosaveFilename(autosave.filename)

  return (
    <div className="d-flex align-items-center py-1 px-2 border-bottom">
      <i className="fas fa-clock me-1 text-info" style={{ fontSize: '0.75rem' }}></i>
      {isEncrypted && (
        <CustomTooltip
          placement="top"
          tooltipText={intl.formatMessage({ id: 'cloudWorkspaces.encryptedAutosave', defaultMessage: 'Encrypted autosave' })}
        >
          <i className="fas fa-lock me-1 text-warning" style={{ fontSize: '0.65rem' }}></i>
        </CustomTooltip>
      )}
      <CustomTooltip
        placement="top"
        tooltipText={`${workspaceName || 'Autosave'} • ${formatDate(autosave.lastModified)}${isEncrypted ? ' 🔐' : ''}`}
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
        tooltipText={intl.formatMessage({ id: 'cloudWorkspaces.downloadToComputerTip', defaultMessage: 'Download to your computer' })}
      >
        <button
          className="btn btn-sm p-0 ms-1 text-primary"
          onClick={(e) => {
            e.stopPropagation()
            onDownload(autosave.folder, autosave.filename)
          }}
          style={{ border: 'none', background: 'none' }}
        >
          <i className="fas fa-file-download" style={{ fontSize: '0.8rem' }}></i>
        </button>
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
          <i className="fas fa-upload" style={{ fontSize: '0.8rem' }}></i>
        </button>
      </CustomTooltip>
    </div>
  )
}
