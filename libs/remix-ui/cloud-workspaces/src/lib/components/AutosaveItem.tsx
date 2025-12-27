import React from 'react'
import { useIntl } from 'react-intl'
import { AutosaveItemProps, formatSize, formatDate } from '../types'

export const AutosaveItem: React.FC<AutosaveItemProps> = ({
  autosave,
  onRestore
}) => {
  const intl = useIntl()

  return (
    <div className="d-flex align-items-center py-1 px-2 border-bottom">
      <i className="fas fa-clock me-1 text-info" style={{ fontSize: '0.75rem' }}></i>
      <div className="flex-grow-1 text-truncate" style={{ minWidth: 0 }}>
        <span className="small text-info">autosave</span>
        <span className="text-muted ms-1" style={{ fontSize: '0.7rem' }}>
          {formatSize(autosave.size)} · {formatDate(autosave.lastModified)}
        </span>
      </div>
      <button
        className="btn btn-sm p-0 ms-1 text-success"
        onClick={(e) => {
          e.stopPropagation()
          onRestore(autosave.folder, autosave.filename)
        }}
        title={intl.formatMessage({ id: 'cloudWorkspaces.restoreAutosave', defaultMessage: 'Restore' })}
        style={{ border: 'none', background: 'none' }}
      >
        <i className="fas fa-download" style={{ fontSize: '0.8rem' }}></i>
      </button>
    </div>
  )
}
