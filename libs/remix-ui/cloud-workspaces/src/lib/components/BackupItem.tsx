import React from 'react'
import { useIntl } from 'react-intl'
import { BackupItemProps, formatSize } from '../types'

export const BackupItem: React.FC<BackupItemProps> = ({
  backup,
  onRestore,
  onDelete
}) => {
  const intl = useIntl()

  return (
    <div className="d-flex align-items-center py-1 px-2 border-bottom">
      <i className="fas fa-archive me-1 text-muted" style={{ fontSize: '0.75rem' }}></i>
      <div className="flex-grow-1 text-truncate" style={{ minWidth: 0 }}>
        <span className="small text-truncate" title={backup.filename}>
          {backup.filename.replace('backup-', '').replace('.zip', '')}
        </span>
        <span className="text-muted ms-1" style={{ fontSize: '0.7rem' }}>
          {formatSize(backup.size)}
        </span>
      </div>
      <button
        className="btn btn-sm p-0 ms-1 text-success"
        onClick={(e) => {
          e.stopPropagation()
          onRestore(backup.folder, backup.filename)
        }}
        title={intl.formatMessage({ id: 'cloudWorkspaces.restore', defaultMessage: 'Restore' })}
        style={{ border: 'none', background: 'none' }}
      >
        <i className="fas fa-download" style={{ fontSize: '0.8rem' }}></i>
      </button>
      <button
        className="btn btn-sm p-0 ms-1 text-danger"
        onClick={(e) => {
          e.stopPropagation()
          onDelete(backup.folder, backup.filename)
        }}
        title={intl.formatMessage({ id: 'cloudWorkspaces.delete', defaultMessage: 'Delete' })}
        style={{ border: 'none', background: 'none' }}
      >
        <i className="fas fa-trash" style={{ fontSize: '0.8rem' }}></i>
      </button>
    </div>
  )
}
