import { WorkspaceSummary, StorageFile } from 'libs/remix-api/src/lib/plugins/api-types'

// Per-workspace backup data structure
export interface WorkspaceBackupData {
  backups: StorageFile[]
  autosave: StorageFile | null
  loading: boolean
  error: string | null
  loaded: boolean
}

export interface CloudWorkspacesProps {
  plugin: any
  workspaces: WorkspaceSummary[]
  selectedWorkspace: string | null
  workspaceBackups: Record<string, WorkspaceBackupData>
  loading: boolean
  error: string | null
  isAuthenticated: boolean
  onSelectWorkspace: (workspaceId: string) => void
  onRestoreBackup: (folder: string, filename: string) => void
  onDeleteBackup: (folder: string, filename: string) => void
  onRefresh: () => void
}

export interface BackupItemProps {
  backup: StorageFile
  onRestore: (folder: string, filename: string) => void
  onDelete: (folder: string, filename: string) => void
  onDownload: (folder: string, filename: string) => void
}

export interface AutosaveItemProps {
  autosave: StorageFile
  onRestore: (folder: string, filename: string) => void
  onDownload: (folder: string, filename: string) => void
}

export interface WorkspaceItemProps {
  workspace: WorkspaceSummary
  isExpanded: boolean
  isSelected: boolean
  backups: StorageFile[]
  autosave: StorageFile | null
  loading: boolean
  onToggleExpand: (workspaceId: string) => void
  onRestore: (folder: string, filename: string) => void
  onDelete: (folder: string, filename: string) => void
  onDownload: (folder: string, filename: string) => void
}

export interface DeleteConfirmModalProps {
  filename: string
  onConfirm: () => void
  onCancel: () => void
}

// Utility functions
export const formatDate = (dateStr: string | null): string => {
  if (!dateStr) return ''
  const date = new Date(dateStr)
  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}

export const formatSize = (bytes: number): string => {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
}
