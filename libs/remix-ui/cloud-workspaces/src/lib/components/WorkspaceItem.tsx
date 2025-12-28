import React from 'react'
import { FormattedMessage } from 'react-intl'
import { WorkspaceItemProps } from '../types'
import { BackupItem } from './BackupItem'
import { AutosaveItem } from './AutosaveItem'

/**
 * Get display name for a workspace - uses workspaceName from metadata if available
 */
const getWorkspaceDisplayName = (workspace: WorkspaceItemProps['workspace']): { primary: string; secondary: string | null } => {
  const workspaceName = workspace.workspaceName
  if (workspaceName && workspaceName !== 'unknown') {
    return { 
      primary: workspaceName, 
      secondary: workspace.id 
    }
  }
  // Fallback to just showing the remote ID
  return { 
    primary: workspace.id, 
    secondary: null 
  }
}

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
  const { primary, secondary } = getWorkspaceDisplayName(workspace)
  
  // Content is only visible when both expanded AND selected
  const isContentVisible = isExpanded && isSelected
  
  return (
    <div className="workspace-item">
      {/* Workspace Header */}
      <div
        className="d-flex align-items-center px-2 py-1 border-bottom cursor-pointer"
        onClick={() => onToggleExpand(workspace.id)}
        style={{ minHeight: '32px' }}
      >
        <i 
          className={`fas fa-chevron-${isContentVisible ? 'down' : 'right'} me-1`} 
          style={{ fontSize: '0.7rem', width: '10px' }}
        ></i>
        <i className="fas fa-folder me-1 text-muted"></i>
        <div 
          className="d-flex flex-column flex-grow-1 text-truncate" 
          style={{ maxWidth: 'calc(100% - 80px)', lineHeight: 1.2 }}
        >
          <span 
            className="text-truncate" 
            title={secondary ? `${primary} (${secondary})` : primary}
          >
            {primary}
          </span>
          {secondary && (
            <span 
              className="text-muted text-truncate" 
              style={{ fontSize: '0.65rem' }}
              title={secondary}
            >
              {secondary}
            </span>
          )}
        </div>
        <small className="text-muted ms-1" style={{ fontSize: '0.7rem', whiteSpace: 'nowrap' }}>
          {workspace.backupCount}
        </small>
      </div>

      {/* Backups List (when expanded and selected) */}
      {isContentVisible && (
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
