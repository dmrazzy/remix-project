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

const REMIX_CONFIG_FILE = 'remix.config.json'

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
    'ensureWorkspaceRemoteId'
  ],
  events: [
    'fileUploaded',
    'fileDeleted',
    'fileDownloaded',
    'uploadProgress',
    'downloadProgress',
    'error',
    'configLoaded'
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
  
  /**
   * Emit an error event
   */
  private emitError(operation: string, path: string, error: Error): void {
    console.error(`[S3StoragePlugin] ${operation} error for ${path}:`, error)
    this.emit('error', { operation, path, error })
  }
}
