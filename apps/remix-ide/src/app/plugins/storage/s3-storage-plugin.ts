/**
 * S3 Storage Plugin for Remix IDE
 * Provides cloud storage functionality using S3-compatible storage via presigned URLs
 * 
 * This plugin:
 * - Uses the auth plugin to get access tokens
 * - Talks to the storage API to get presigned URLs
 * - Uploads/downloads files directly to/from S3
 * - Provides an abstraction layer for future storage providers
 */

import { Plugin } from '@remixproject/engine'
import { 
  ApiClient,
  StorageConfig,
  StorageFile,
  StorageFilesResponse,
  StorageListOptions
} from '@remix-api'
import { endpointUrls } from '@remix-endpoints-helper'

import { 
  IStorageProvider, 
  UploadOptions, 
  DownloadOptions,
  StorageEvents,
  getMimeType,
  joinPath
} from './types'
import { S3StorageProvider } from './s3-provider'
import { 
  generateWorkspaceId, 
  isValidWorkspaceId, 
  RemixConfig, 
  RemoteWorkspaceConfig 
} from './workspace-id'
import JSZip from 'jszip'

const REMIX_CONFIG_FILE = 'remix.config.json'

// Folders/patterns to exclude from workspace backup
const EXCLUDED_PATTERNS = [
  '.deps',           // npm dependencies cached by Remix
  'artifacts',       // compiled contract artifacts
  '.git',            // git folder
  'node_modules',    // node modules (shouldn't exist but just in case)
  '.cache',          // cache folders
]

const profile = {
  name: 's3Storage',
  displayName: 'Cloud Storage',
  description: 'Cloud storage service for Remix IDE files using S3',
  methods: [
    'upload',
    'download',
    'downloadBinary',
    'delete',
    'list',
    'exists',
    'getMetadata',
    'getConfig',
    'isHealthy',
    'getProviderName',
    'getWorkspaceRemoteId',
    'ensureWorkspaceRemoteId',
    'backupWorkspace',
    'restoreWorkspace'
  ],
  events: [
    'fileUploaded',
    'fileDeleted',
    'fileDownloaded',
    'uploadProgress',
    'downloadProgress',
    'error',
    'configLoaded',
    'backupCompleted',
    'restoreCompleted'
  ]
}

export class S3StoragePlugin extends Plugin {
  private provider: IStorageProvider | null = null
  private apiClient: ApiClient | null = null
  private config: StorageConfig | null = null
  
  constructor() {
    super(profile)
  }
  
  async onActivation(): Promise<void> {
    console.log('[S3StoragePlugin] Activated')
    
    // Initialize API client and provider
    await this.initializeProvider()
    
    // Listen for auth state changes
    this.on('auth', 'authStateChanged', async (state: { isAuthenticated: boolean }) => {
      if (state.isAuthenticated) {
        await this.initializeProvider()
        await this.loadConfig()
      } else {
        // Clear config on logout
        this.config = null
      }
    })
    
    // EXPERIMENT: Listen for file saves and upload to S3
    this.on('fileManager', 'fileSaved', async (path: string) => {
      await this.handleFileSaved(path)
    })
  }
  
  /**
   * Handle file saved event - upload to S3 as experiment
   */
  private async handleFileSaved(path: string): Promise<void> {
    try {
      // Check if user is authenticated
      const user = await this.call('auth', 'getUser')
      if (!user) {
        console.log('[S3StoragePlugin] User not authenticated, skipping S3 upload')
        return
      }
      
      // Only sync .sol files for now as experiment
      if (!path.endsWith('.sol')) {
        console.log('[S3StoragePlugin] Skipping non-Solidity file:', path)
        return
      }
      
      // Get or create workspace remote ID
      const workspaceRemoteId = await this.ensureWorkspaceRemoteId()
      if (!workspaceRemoteId) {
        console.log('[S3StoragePlugin] Could not get workspace remote ID, skipping upload')
        return
      }
      
      // Get file content from fileManager
      const content = await this.call('fileManager', 'readFile', path)
      if (!content) {
        console.log('[S3StoragePlugin] No content for file:', path)
        return
      }
      
      // Build the remote path: workspaceRemoteId/path
      const remotePath = joinPath(workspaceRemoteId, path.replace(/^\//, ''))
      
      console.log(`[S3StoragePlugin] 🚀 Uploading to S3: ${remotePath}`)
      
      // Upload to S3
      const key = await this.upload(path.replace(/^\//, ''), content, { folder: workspaceRemoteId })
      
      console.log(`[S3StoragePlugin] ✅ Uploaded to S3: ${key}`)
      
      // Show notification to user
      await this.call('notification', 'toast', `☁️ Synced to cloud: ${path}`)
      
    } catch (error) {
      console.error('[S3StoragePlugin] Failed to upload on save:', error)
      // Don't show error to user for now - this is experimental
    }
  }
  
  // ==================== Workspace Remote ID Management ====================
  
  /**
   * Get the current remix.config.json content
   */
  private async getRemixConfig(): Promise<RemixConfig | null> {
    try {
      const exists = await this.call('fileManager', 'exists', REMIX_CONFIG_FILE)
      if (!exists) {
        return null
      }
      
      const content = await this.call('fileManager', 'readFile', REMIX_CONFIG_FILE)
      return JSON.parse(content)
    } catch (error) {
      console.error('[S3StoragePlugin] Failed to read remix.config.json:', error)
      return null
    }
  }
  
  /**
   * Save remix.config.json
   */
  private async saveRemixConfig(config: RemixConfig): Promise<void> {
    await this.call('fileManager', 'writeFile', REMIX_CONFIG_FILE, JSON.stringify(config, null, 2))
  }
  
  /**
   * Get the workspace remote ID from remix.config.json
   * Returns null if not configured
   */
  async getWorkspaceRemoteId(): Promise<string | null> {
    const config = await this.getRemixConfig()
    return config?.['remote-workspace']?.remoteId || null
  }
  
  /**
   * Ensure the workspace has a remote ID, creating one if needed
   * @returns The workspace remote ID
   */
  async ensureWorkspaceRemoteId(): Promise<string> {
    // Check if we already have a remote ID
    let config = await this.getRemixConfig()
    
    if (config?.['remote-workspace']?.remoteId) {
      const existingId = config['remote-workspace'].remoteId
      // Accept any existing ID (don't validate format - user might have set their own)
      if (existingId && typeof existingId === 'string' && existingId.trim().length > 0) {
        console.log('[S3StoragePlugin] Using existing workspace remote ID:', existingId)
        return existingId
      }
    }
    
    // Generate a new remote ID
    const newRemoteId = generateWorkspaceId()
    console.log('[S3StoragePlugin] Generated new workspace remote ID:', newRemoteId)
    
    // Create or update config
    if (!config) {
      config = {}
    }
    
    config['remote-workspace'] = {
      remoteId: newRemoteId,
      createdAt: new Date().toISOString()
    }
    
    // Save the config
    await this.saveRemixConfig(config)
    
    await this.call('notification', 'toast', `🔗 Workspace linked to cloud: ${newRemoteId}`)
    
    return newRemoteId
  }
  
  onDeactivation(): void {
    console.log('[S3StoragePlugin] Deactivated')
    this.off('auth', 'authStateChanged')
    this.off('fileManager', 'fileSaved')
  }
  
  /**
   * Initialize the storage provider
   */
  private async initializeProvider(): Promise<void> {
    // Create API client for storage endpoint
    this.apiClient = new ApiClient(endpointUrls.storage)
    
    // Set up token refresh callback via auth plugin
    this.apiClient.setTokenRefreshCallback(async () => {
      try {
        // Get fresh token from auth plugin
        const token = await this.call('auth', 'getToken')
        return token
      } catch (error) {
        console.error('[S3StoragePlugin] Token refresh failed:', error)
        return null
      }
    })
    
    // Create S3 provider with token getter
    this.provider = new S3StorageProvider(
      this.apiClient,
      async () => {
        try {
          return await this.call('auth', 'getToken')
        } catch {
          return null
        }
      }
    )
    
    console.log('[S3StoragePlugin] Provider initialized:', this.provider.name)
  }
  
  /**
   * Load storage configuration
   */
  private async loadConfig(): Promise<void> {
    if (!this.provider) {
      console.warn('[S3StoragePlugin] Provider not initialized')
      return
    }
    
    try {
      this.config = await this.provider.getConfig()
      if (this.config) {
        this.emit('configLoaded', this.config)
        console.log('[S3StoragePlugin] Config loaded:', this.config)
      }
    } catch (error) {
      console.error('[S3StoragePlugin] Failed to load config:', error)
    }
  }
  
  /**
   * Ensure provider is initialized
   */
  private ensureProvider(): IStorageProvider {
    if (!this.provider) {
      throw new Error('Storage provider not initialized. Please log in first.')
    }
    return this.provider
  }
  
  /**
   * Get the current storage provider name
   */
  async getProviderName(): Promise<string> {
    return this.provider?.name || 'none'
  }
  
  /**
   * Check if the storage service is healthy
   */
  async isHealthy(): Promise<boolean> {
    try {
      const provider = this.ensureProvider()
      return await provider.isHealthy()
    } catch (error) {
      return false
    }
  }
  
  /**
   * Get storage configuration (limits, allowed types)
   */
  async getConfig(): Promise<StorageConfig | null> {
    // Return cached config if available
    if (this.config) {
      return this.config
    }
    
    try {
      const provider = this.ensureProvider()
      this.config = await provider.getConfig()
      return this.config
    } catch (error) {
      this.emitError('getConfig', '', error as Error)
      return null
    }
  }
  
  /**
   * Upload a file to cloud storage
   * 
   * @param filename - Name of the file
   * @param content - File content as string or Uint8Array
   * @param options - Upload options (folder, contentType, onProgress)
   * @returns The storage key/path of the uploaded file
   * 
   * @example
   * // Upload a Solidity file to contracts folder
   * const key = await s3Storage.upload('MyContract.sol', sourceCode, { folder: 'contracts' })
   * 
   * @example
   * // Upload with explicit content type
   * const key = await s3Storage.upload('data.json', jsonString, { 
   *   folder: 'artifacts',
   *   contentType: 'application/json' 
   * })
   */
  async upload(
    filename: string, 
    content: string | Uint8Array, 
    options: UploadOptions = {}
  ): Promise<string> {
    const provider = this.ensureProvider()
    const fullPath = joinPath(options.folder, filename)
    const contentType = options.contentType || getMimeType(filename)
    
    try {
      console.log(`[S3StoragePlugin] Uploading: ${fullPath}`)
      
      const key = await provider.upload(fullPath, content, contentType)
      
      // Calculate size for event
      const size = typeof content === 'string' 
        ? new Blob([content]).size 
        : content.length
      
      this.emit('fileUploaded', { path: fullPath, size })
      console.log(`[S3StoragePlugin] Upload complete: ${key}`)
      
      return key
    } catch (error) {
      this.emitError('upload', fullPath, error as Error)
      throw error
    }
  }
  
  /**
   * Download a file from cloud storage as text
   * 
   * @param filename - Name of the file
   * @param folder - Optional folder path
   * @returns File content as string
   * 
   * @example
   * const content = await s3Storage.download('MyContract.sol', 'contracts')
   */
  async download(filename: string, folder?: string): Promise<string> {
    const provider = this.ensureProvider()
    const fullPath = joinPath(folder, filename)
    
    try {
      console.log(`[S3StoragePlugin] Downloading: ${fullPath}`)
      
      const content = await provider.download(fullPath)
      
      this.emit('fileDownloaded', { path: fullPath })
      console.log(`[S3StoragePlugin] Download complete: ${fullPath}`)
      
      return content
    } catch (error) {
      this.emitError('download', fullPath, error as Error)
      throw error
    }
  }
  
  /**
   * Download a file from cloud storage as binary
   * 
   * @param filename - Name of the file
   * @param folder - Optional folder path
   * @returns File content as Uint8Array
   */
  async downloadBinary(filename: string, folder?: string): Promise<Uint8Array> {
    const provider = this.ensureProvider()
    const fullPath = joinPath(folder, filename)
    
    try {
      console.log(`[S3StoragePlugin] Downloading binary: ${fullPath}`)
      
      const content = await provider.downloadBinary(fullPath)
      
      this.emit('fileDownloaded', { path: fullPath })
      
      return content
    } catch (error) {
      this.emitError('downloadBinary', fullPath, error as Error)
      throw error
    }
  }
  
  /**
   * Delete a file from cloud storage
   * 
   * @param filename - Name of the file
   * @param folder - Optional folder path
   * 
   * @example
   * await s3Storage.delete('MyContract.sol', 'contracts')
   */
  async delete(filename: string, folder?: string): Promise<void> {
    const provider = this.ensureProvider()
    const fullPath = joinPath(folder, filename)
    
    try {
      console.log(`[S3StoragePlugin] Deleting: ${fullPath}`)
      
      await provider.delete(fullPath)
      
      this.emit('fileDeleted', { path: fullPath })
      console.log(`[S3StoragePlugin] Delete complete: ${fullPath}`)
    } catch (error) {
      this.emitError('delete', fullPath, error as Error)
      throw error
    }
  }
  
  /**
   * List files in cloud storage
   * 
   * @param options - List options (folder, limit, cursor)
   * @returns List of files with metadata
   * 
   * @example
   * // List all files
   * const { files, totalCount } = await s3Storage.list()
   * 
   * @example
   * // List files in a specific folder
   * const { files } = await s3Storage.list({ folder: 'contracts' })
   * 
   * @example
   * // Paginated list
   * const { files, nextCursor } = await s3Storage.list({ limit: 10 })
   * if (nextCursor) {
   *   const nextPage = await s3Storage.list({ limit: 10, cursor: nextCursor })
   * }
   */
  async list(options?: StorageListOptions): Promise<StorageFilesResponse> {
    const provider = this.ensureProvider()
    
    try {
      return await provider.list(options)
    } catch (error) {
      this.emitError('list', options?.folder || '', error as Error)
      throw error
    }
  }
  
  /**
   * Check if a file exists in cloud storage
   * 
   * @param filename - Name of the file
   * @param folder - Optional folder path
   * @returns true if file exists
   */
  async exists(filename: string, folder?: string): Promise<boolean> {
    const provider = this.ensureProvider()
    const fullPath = joinPath(folder, filename)
    
    try {
      return await provider.exists(fullPath)
    } catch (error) {
      // If we get an error checking existence, assume it doesn't exist
      return false
    }
  }
  
  /**
   * Get metadata for a specific file
   * 
   * @param filename - Name of the file
   * @param folder - Optional folder path
   * @returns File metadata or null if not found
   */
  async getMetadata(filename: string, folder?: string): Promise<StorageFile | null> {
    const provider = this.ensureProvider()
    const fullPath = joinPath(folder, filename)
    
    try {
      return await provider.getMetadata(fullPath)
    } catch (error) {
      this.emitError('getMetadata', fullPath, error as Error)
      return null
    }
  }
  
  // ==================== Workspace Backup & Restore ====================
  
  /**
   * Check if a path should be excluded from backup
   */
  private shouldExclude(path: string): boolean {
    const normalizedPath = path.replace(/^\//, '').toLowerCase()
    
    for (const pattern of EXCLUDED_PATTERNS) {
      if (normalizedPath.startsWith(pattern.toLowerCase()) || 
          normalizedPath.includes('/' + pattern.toLowerCase())) {
        return true
      }
    }
    
    return false
  }
  
  /**
   * Recursively collect all files in the workspace
   */
  private async collectWorkspaceFiles(
    basePath: string = ''
  ): Promise<Array<{ path: string; content: string }>> {
    const files: Array<{ path: string; content: string }> = []
    
    try {
      const entries = await this.call('fileManager', 'readdir', basePath || '/')
      
      for (const [entryPath, info] of Object.entries(entries)) {
        // Skip excluded patterns
        if (this.shouldExclude(entryPath)) {
          console.log(`[S3StoragePlugin] Skipping excluded path: ${entryPath}`)
          continue
        }
        
        const entryInfo = info as { isDirectory: boolean }
        
        if (entryInfo.isDirectory) {
          // Recursively collect files from subdirectory
          const subFiles = await this.collectWorkspaceFiles(entryPath)
          files.push(...subFiles)
        } else {
          // Read file content
          try {
            const content = await this.call('fileManager', 'readFile', entryPath)
            files.push({ path: entryPath, content })
          } catch (err) {
            console.warn(`[S3StoragePlugin] Could not read file: ${entryPath}`, err)
          }
        }
      }
    } catch (err) {
      console.error(`[S3StoragePlugin] Error reading directory: ${basePath}`, err)
    }
    
    return files
  }
  
  /**
   * Backup the entire workspace to S3 as a compressed zip
   * 
   * @returns The S3 key of the uploaded backup
   * 
   * @example
   * const backupKey = await s3Storage.backupWorkspace()
   * console.log('Backup saved to:', backupKey)
   */
  async backupWorkspace(): Promise<string> {
    const provider = this.ensureProvider()
    
    // Check if user is authenticated
    const user = await this.call('auth', 'getUser')
    if (!user) {
      throw new Error('You must be logged in to backup your workspace')
    }
    
    // Get or create workspace remote ID
    const workspaceRemoteId = await this.ensureWorkspaceRemoteId()
    
    console.log(`[S3StoragePlugin] 📦 Starting workspace backup for: ${workspaceRemoteId}`)
    
    // Collect all files
    const files = await this.collectWorkspaceFiles()
    
    console.log(`[S3StoragePlugin] Found ${files.length} files to backup`)
    
    if (files.length === 0) {
      throw new Error('No files found in workspace to backup')
    }
    
    // Create zip file
    const zip = new JSZip()
    
    // Add metadata
    const metadata = {
      workspaceRemoteId,
      createdAt: new Date().toISOString(),
      fileCount: files.length,
      version: '1.0'
    }
    zip.file('_backup_metadata.json', JSON.stringify(metadata, null, 2))
    
    // Add all files to zip
    for (const file of files) {
      // Remove leading slash for zip paths
      const zipPath = file.path.replace(/^\//, '')
      zip.file(zipPath, file.content)
    }
    
    // Generate compressed blob
    console.log('[S3StoragePlugin] Compressing workspace...')
    const blob = await zip.generateAsync({ 
      type: 'blob',
      compression: 'DEFLATE',
      compressionOptions: { level: 6 }
    })
    
    console.log(`[S3StoragePlugin] Compressed size: ${(blob.size / 1024).toFixed(2)} KB`)
    
    // Convert blob to Uint8Array for upload
    const arrayBuffer = await blob.arrayBuffer()
    const content = new Uint8Array(arrayBuffer)
    
    // Upload to S3
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
    const backupFilename = `backup-${timestamp}.zip`
    const backupPath = `${workspaceRemoteId}/backups/${backupFilename}`
    
    console.log(`[S3StoragePlugin] 🚀 Uploading backup: ${backupPath}`)
    
    const key = await this.upload(backupFilename, content, { 
      folder: `${workspaceRemoteId}/backups`,
      contentType: 'application/zip'
    })
    
    console.log(`[S3StoragePlugin] ✅ Backup complete: ${key}`)
    
    this.emit('backupCompleted', { 
      key, 
      fileCount: files.length, 
      size: blob.size,
      workspaceRemoteId 
    })
    
    await this.call('notification', 'toast', `☁️ Workspace backed up (${files.length} files, ${(blob.size / 1024).toFixed(1)} KB)`)
    
    return key
  }
  
  /**
   * Restore workspace from a backup zip
   * 
   * @param backupKey - The S3 key of the backup to restore (optional, uses latest if not provided)
   * 
   * @example
   * await s3Storage.restoreWorkspace()  // Restores latest backup
   * await s3Storage.restoreWorkspace('backups/backup-2025-12-26.zip')
   */
  async restoreWorkspace(backupKey?: string): Promise<void> {
    const provider = this.ensureProvider()
    
    // Check if user is authenticated
    const user = await this.call('auth', 'getUser')
    if (!user) {
      throw new Error('You must be logged in to restore your workspace')
    }
    
    const workspaceRemoteId = await this.getWorkspaceRemoteId()
    if (!workspaceRemoteId) {
      throw new Error('No workspace remote ID found. This workspace has no cloud backups.')
    }
    
    // Variables to track the backup path
    let backupFolder: string
    let backupFilename: string
    
    // If no backup key provided, list backups and get the latest
    if (!backupKey) {
      const backups = await this.list({ folder: `${workspaceRemoteId}/backups` })
      if (!backups.files || backups.files.length === 0) {
        throw new Error('No backups found for this workspace')
      }
      
      // Sort by date (newest first) and get the latest
      const sortedBackups = backups.files.sort((a, b) => 
        new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime()
      )
      
      // Use folder and filename from the API response, not the key
      const latestBackup = sortedBackups[0]
      backupFolder = latestBackup.folder
      backupFilename = latestBackup.filename
    } else {
      // Parse the provided backup key into folder and filename
      const lastSlashIndex = backupKey.lastIndexOf('/')
      if (lastSlashIndex === -1) {
        backupFolder = `${workspaceRemoteId}/backups`
        backupFilename = backupKey
      } else {
        backupFolder = backupKey.substring(0, lastSlashIndex)
        backupFilename = backupKey.substring(lastSlashIndex + 1)
      }
    }
    
    console.log(`[S3StoragePlugin] 📥 Downloading backup: ${backupFolder}/${backupFilename}`)
    
    // Download the backup using folder and filename
    const content = await this.downloadBinary(backupFilename, backupFolder)
    
    console.log(`[S3StoragePlugin] Downloaded ${(content.length / 1024).toFixed(2)} KB`)
    
    // Unzip
    const zip = await JSZip.loadAsync(content)
    
    // Read metadata
    const metadataFile = zip.file('_backup_metadata.json')
    if (metadataFile) {
      const metadataStr = await metadataFile.async('string')
      const metadata = JSON.parse(metadataStr)
      console.log('[S3StoragePlugin] Backup metadata:', metadata)
    }
    
    // Extract and write files
    let restoredCount = 0
    const filePromises: Promise<void>[] = []
    
    zip.forEach((relativePath, zipEntry) => {
      // Skip metadata and directories
      if (relativePath === '_backup_metadata.json' || zipEntry.dir) {
        return
      }
      
      filePromises.push((async () => {
        try {
          const content = await zipEntry.async('string')
          await this.call('fileManager', 'writeFile', relativePath, content)
          restoredCount++
        } catch (err) {
          console.warn(`[S3StoragePlugin] Failed to restore file: ${relativePath}`, err)
        }
      })())
    })
    
    await Promise.all(filePromises)
    
    console.log(`[S3StoragePlugin] ✅ Restored ${restoredCount} files`)
    
    this.emit('restoreCompleted', { 
      backupPath: `${backupFolder}/${backupFilename}`, 
      fileCount: restoredCount,
      workspaceRemoteId 
    })
    
    await this.call('notification', 'toast', `☁️ Workspace restored (${restoredCount} files)`)
  }
  
  /**
   * Emit an error event
   */
  private emitError(operation: string, path: string, error: Error): void {
    console.error(`[S3StoragePlugin] ${operation} error for ${path}:`, error)
    this.emit('error', { operation, path, error })
  }
}
