import React from 'react'
import { FormattedMessage, useIntl } from 'react-intl'
import { StorageFile } from 'libs/remix-api/src/lib/plugins/api-types'
import { BackupItem } from './BackupItem'
import { AutosaveItem } from './AutosaveItem'
import { useCloudWorkspaces } from '../context'

export interface CurrentCloudWorkspaceFilesProps {
  backups: StorageFile[]
  autosave: StorageFile | null
  loading: boolean
  onRestore: (folder: string, filename: string) => void
  onDelete: (folder: string, filename: string) => void
  onDownload: (folder: string, filename: string) => void
}

export const CurrentCloudWorkspaceFiles: React.FC<CurrentCloudWorkspaceFilesProps> = ({
  backups,
  autosave,
  loading,
  onRestore,
  onDelete,
  onDownload
}) => {
  const intl = useIntl()
  const { currentWorkspaceStatus } = useCloudWorkspaces()

  // Only show if there's a connected remote workspace
  if (!currentWorkspaceStatus.remoteId) {
    return null
  }

  return (
    <div className="current-cloud-files-section border-bottom">
      {/* Section Header */}
      <div className="d-flex justify-content-between align-items-center px-2 py-1 border-bottom bg-light">
        <span className="text-muted small fw-bold">
          <i className="fas fa-history me-1"></i>
          <FormattedMessage id="cloudWorkspaces.savedVersions" defaultMessage="Saved Versions" />
        </span>
      </div>

      {/* Files List */}
      <div className="current-cloud-files-list" style={{ maxHeight: '200px', overflowY: 'auto' }}>
        {loading ? (
          <div className="py-2 px-2 text-center">
            <i className="fas fa-spinner fa-spin small"></i>
            <span className="ms-2 text-muted small">
              <FormattedMessage id="cloudWorkspaces.loading" defaultMessage="Loading..." />
            </span>
          </div>
        ) : (backups.length === 0 && !autosave) ? (
          <div className="py-2 px-3 text-muted small">
            <FormattedMessage id="cloudWorkspaces.noSavedVersions" defaultMessage="No saved versions yet. Use Save or Backup above." />
          </div>
        ) : (
          <div style={{ paddingLeft: '8px' }}>
            {autosave && (
              <AutosaveItem 
                autosave={autosave} 
                onRestore={onRestore} 
                onDownload={onDownload} 
              />
            )}
            {[...backups].reverse().map((backup, index) => (
              <BackupItem 
                key={backup.key || index}
                backup={backup} 
                onRestore={onRestore} 
                onDelete={onDelete}
                onDownload={onDownload}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
