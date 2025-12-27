import React from 'react'
import { FormattedMessage } from 'react-intl'
import { WorkspaceItemProps } from '../types'
import { BackupItem } from './BackupItem'
import { AutosaveItem } from './AutosaveItem'

export const WorkspaceItem: React.FC<WorkspaceItemProps> = ({
  workspace,
  isExpanded,
  isSelected,
  backups,
  autosave,
  loading,
  onToggleExpand,
  onRestore,
  onDelete
}) => {
  return (
    <div className="workspace-item">
      {/* Workspace Header */}
      <div
        className="d-flex align-items-center px-2 py-1 border-bottom cursor-pointer"
        onClick={() => onToggleExpand(workspace.id)}
        style={{ minHeight: '32px' }}
      >
        <i 
          className={`fas fa-chevron-${isExpanded ? 'down' : 'right'} me-1`} 
          style={{ fontSize: '0.7rem', width: '10px' }}
        ></i>
        <i className="fas fa-folder me-1 text-muted"></i>
        <span 
          className="text-truncate flex-grow-1" 
          style={{ maxWidth: 'calc(100% - 80px)' }}
          title={workspace.id}
        >
          {workspace.id}
        </span>
        <small className="text-muted ms-1" style={{ fontSize: '0.7rem', whiteSpace: 'nowrap' }}>
          {workspace.backupCount}
        </small>
      </div>

      {/* Backups List (when expanded) */}
      {isExpanded && isSelected && (
        <div className="backup-list" style={{ paddingLeft: '20px' }}>
          {loading ? (
            <div className="py-1 px-2 text-center">
              <i className="fas fa-spinner fa-spin small"></i>
            </div>
          ) : (backups.length === 0 && !autosave) ? (
            <div className="py-1 px-2 text-muted small">
              <FormattedMessage id="cloudWorkspaces.noBackups" defaultMessage="No backups" />
            </div>
          ) : (
            <>
              {autosave && (
                <AutosaveItem autosave={autosave} onRestore={onRestore} />
              )}
              {backups.map((backup, index) => (
                <BackupItem 
                  key={backup.key || index}
                  backup={backup} 
                  onRestore={onRestore} 
                  onDelete={onDelete} 
                />
              ))}
            </>
          )}
        </div>
      )}
    </div>
  )
}
