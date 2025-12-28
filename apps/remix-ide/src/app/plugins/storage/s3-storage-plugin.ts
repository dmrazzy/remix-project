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
  StorageListOptions,
  StorageApiService
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
    'listWorkspaces',
    'exists',
    'getMetadata',
    'getConfig',
    'isHealthy',
    'getProviderName',
    'getWorkspaceRemoteId',
    'setWorkspaceRemoteId',
    'ensureWorkspaceRemoteId',
    'checkWorkspaceOwnership',
    'getWorkspaceOwnership',
    'linkWorkspaceToCurrentUser',
    'backupWorkspace',
    'restoreWorkspace',
    'restoreBackupToNewWorkspace',
    'saveToCloud',
    'getLastSaveTime',
    'getLastBackupTime',
    'isAutosaveEnabled',
    'setAutosaveEnabled',
    'startAutosave',
    'stopAutosave'
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
    'saveCompleted',
    'restoreCompleted',
    'autosaveChanged'
  ]
}

export class S3StoragePlugin extends Plugin {
  private provider: IStorageProvider | null = null
  private apiClient: ApiClient | null = null
  private storageApi: StorageApiService | null = null
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
        // Start autosave if enabled
        await this.startAutosaveIfEnabled()
      } else {
        // Clear config on logout
        this.config = null
        this.stopAutosave()
      }
    })
    
    // Start autosave on activation if user is already logged in and setting is enabled
    await this.startAutosaveIfEnabled()
  }
  
  // ==================== Autosave Functionality ====================
  
  private autosaveIntervalId: ReturnType<typeof setInterval> | null = null
  private static readonly AUTOSAVE_BACKUP_NAME = 'autosave-backup.zip'
  private static readonly DEFAULT_AUTOSAVE_INTERVAL = 1 * 60 * 1000 // 5 minutes
  
  /**
   * Check if autosave is enabled in settings
   */
  async isAutosaveEnabled(): Promise<boolean> {
    try {
      const enabled = await this.call('settings', 'get', 'settings/cloud-storage/autosave')
      return enabled === true
    } catch {
      return false
    }
  }
  
  /**
   * Set autosave enabled/disabled
   */
  async setAutosaveEnabled(enabled: boolean): Promise<void> {
    await this.call('settings', 'set', 'settings/cloud-storage/autosave', enabled)
    if (enabled) {
      await this.startAutosave()
    } else {
      this.stopAutosave()
    }
    this.emit('autosaveChanged', { enabled })
  }
  
  /**
   * Start autosave if enabled and user is authenticated
   */
  private async startAutosaveIfEnabled(): Promise<void> {
    try {
      const isAuth = await this.call('auth', 'isAuthenticated')
      if (!isAuth) {
        return
      }
      
      const enabled = await this.isAutosaveEnabled()
      if (enabled) {
        await this.startAutosave()
      }
    } catch (e) {
      console.error('[S3StoragePlugin] Failed to check autosave settings:', e)
    }
  }
  
  /**
   * Start the autosave interval
   */
  async startAutosave(): Promise<void> {
    // Stop any existing interval
    this.stopAutosave()
    
    console.log('[S3StoragePlugin] 🔄 Starting autosave (every 5 minutes)')
    
    // Run immediately, then on interval
    await this.runAutosave()
    
    this.autosaveIntervalId = setInterval(async () => {
      await this.runAutosave()
    }, S3StoragePlugin.DEFAULT_AUTOSAVE_INTERVAL)
  }
  
  /**
   * Stop the autosave interval
   */
  stopAutosave(): void {
    if (this.autosaveIntervalId) {
      clearInterval(this.autosaveIntervalId)
      this.autosaveIntervalId = null
      console.log('[S3StoragePlugin] ⏹️ Autosave stopped')
    }
  }
  
  /**
   * Run a single autosave backup
   */
  private async runAutosave(): Promise<void> {
    try {
      // Check if user is still authenticated
      const isAuth = await this.call('auth', 'isAuthenticated')
      if (!isAuth) {
        this.stopAutosave()
        return
      }
      
      const workspaceRemoteId = await this.getWorkspaceRemoteId()
      if (!workspaceRemoteId) {
        console.log('[S3StoragePlugin] No workspace remote ID, skipping autosave')
        return
      }
      
      // Get workspace name for filename
      let workspaceName = 'workspace'
      try {
        const currentWorkspace = await this.call('filePanel', 'getCurrentWorkspace')
        workspaceName = currentWorkspace?.name || 'workspace'
      } catch (e) {
        console.warn('[S3StoragePlugin] Could not get workspace name:', e)
      }
      
      console.log('[S3StoragePlugin] 💾 Running autosave backup...')
      
      // Create backup with workspace name in filename (overwrites previous autosave)
      const sanitizedName = workspaceName.replace(/[^a-zA-Z0-9-_]/g, '-')
      const backupKey = await this.createBackup(
        `${sanitizedName}-autosave.zip`,
        `${workspaceRemoteId}/autosave`
      )
      
      // Update last save time
      await this.updateLastSaveTime()
      this.emit('saveCompleted', { workspaceRemoteId })
      
      console.log(`[S3StoragePlugin] ✅ Autosave completed: ${backupKey}`)
      
    } catch (error) {
      console.error('[S3StoragePlugin] Autosave failed:', error)
      // Don't show error to user - autosave is background task
    }
  }
  
  /**
   * Create a backup with a specific filename
   * This is a helper used by both backupWorkspace and autosave
   */
  private async createBackup(filename: string, folder: string): Promise<string> {
    const provider = this.ensureProvider()
    
    // Get current workspace name for metadata
    let workspaceName = 'unknown'
    try {
      const currentWorkspace = await this.call('filePanel', 'getCurrentWorkspace')
      workspaceName = currentWorkspace?.name || 'unknown'
    } catch (e) {
      console.warn('[S3StoragePlugin] Could not get workspace name:', e)
    }
    
    // Get all files in workspace (excluding .deps, artifacts, etc.)
    const files = await this.collectWorkspaceFiles()
    
    // Create zip with compression
    const zip = new JSZip()
    
    const workspaceRemoteId = await this.getWorkspaceRemoteId()
    
    // Add metadata inside the zip (for when zip is downloaded/inspected)
    const zipMetadata = {
      createdAt: new Date().toISOString(),
      fileCount: files.length,
      workspaceRemoteId,
      workspaceName,
      isAutosave: folder.includes('autosave')
    }
    
    // Add all files to zip
    for (const file of files) {
      // Remove leading slash for zip path
      const zipPath = file.path.replace(/^\//, '')
      zip.file(zipPath, file.content)
    }
    
    // Add metadata file inside zip
    zip.file('_backup_metadata.json', JSON.stringify(zipMetadata, null, 2))
    
    // Generate compressed zip
    const zipContent = await zip.generateAsync({
      type: 'uint8array',
      compression: 'DEFLATE',
      compressionOptions: { level: 6 }
    })
    
    // Upload to S3 - filename already includes workspace name
    const fullPath = joinPath(folder, filename)
    const key = await provider.upload(fullPath, zipContent, 'application/zip')
    
    return key
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
    
    // Get current user ID to associate with this workspace
    let userId: string | undefined
    try {
      const user = await this.call('auth', 'getUser')
      userId = user?.sub
    } catch (e) {
      console.warn('[S3StoragePlugin] Could not get user ID:', e)
    }
    
    // Create or update config
    if (!config) {
      config = {}
    }
    
    config['remote-workspace'] = {
      remoteId: newRemoteId,
      userId,
      createdAt: new Date().toISOString()
    }
    
    // Save the config
    await this.saveRemixConfig(config)
    
    await this.call('notification', 'toast', `🔗 Workspace linked to cloud: ${newRemoteId}`)
    
    return newRemoteId
  }

  /**
   * Set a custom remote ID for the workspace
   * @param workspaceName - The local workspace name (not used if we're in the active workspace)
   * @param remoteId - The new remote ID to set
   */
  async setWorkspaceRemoteId(workspaceName: string, remoteId: string): Promise<void> {
    if (!remoteId || typeof remoteId !== 'string' || !remoteId.trim()) {
      throw new Error('Invalid remote ID')
    }
    
    const sanitizedId = remoteId.trim().toLowerCase().replace(/[^a-z0-9-]/g, '-')
    
    // Get current user ID
    let userId: string | undefined
    try {
      const user = await this.call('auth', 'getUser')
      userId = user?.sub
    } catch (e) {
      console.warn('[S3StoragePlugin] Could not get user ID:', e)
    }
    
    let config = await this.getRemixConfig()
    if (!config) {
      config = {}
    }
    
    const existingConfig = config['remote-workspace'] as RemoteWorkspaceConfig | undefined
    config['remote-workspace'] = {
      ...existingConfig,
      remoteId: sanitizedId,
      userId,
      createdAt: existingConfig?.createdAt || new Date().toISOString()
    }
    
    await this.saveRemixConfig(config)
    console.log('[S3StoragePlugin] Updated workspace remote ID to:', sanitizedId)
  }

  /**
   * Check if the current user owns the workspace cloud link
   * @returns Object with ownership status and details
   */
  async checkWorkspaceOwnership(): Promise<{ isOwner: boolean; hasRemoteId: boolean; userId?: string }> {
    const config = await this.getRemixConfig()
    const remoteConfig = config?.['remote-workspace']
    
    if (!remoteConfig?.remoteId) {
      return { isOwner: true, hasRemoteId: false } // No remote ID = user can link it
    }
    
    // If no userId stored (legacy), consider it owned by current user
    if (!remoteConfig.userId) {
      return { isOwner: true, hasRemoteId: true }
    }
    
    // Check if current user matches
    try {
      const user = await this.call('auth', 'getUser')
      const currentUserId = user?.sub
      
      if (!currentUserId) {
        // Not logged in - can't determine ownership
        return { isOwner: false, hasRemoteId: true, userId: remoteConfig.userId }
      }
      
      const isOwner = currentUserId === remoteConfig.userId
      return { isOwner, hasRemoteId: true, userId: remoteConfig.userId }
    } catch (e) {
      console.warn('[S3StoragePlugin] Could not check ownership:', e)
      return { isOwner: false, hasRemoteId: true, userId: remoteConfig.userId }
    }
  }

  /**
   * Get workspace ownership details for UI display
   */
  async getWorkspaceOwnership(): Promise<{ 
    remoteId: string | null
    ownedByCurrentUser: boolean
    linkedToAnotherUser: boolean
    canSave: boolean
  }> {
    const ownership = await this.checkWorkspaceOwnership()
    
    return {
      remoteId: ownership.hasRemoteId ? (await this.getWorkspaceRemoteId()) : null,
      ownedByCurrentUser: ownership.isOwner && ownership.hasRemoteId,
      linkedToAnotherUser: !ownership.isOwner && ownership.hasRemoteId,
      canSave: ownership.isOwner // Can only save if owner or not linked
    }
  }

  /**
   * Link (or re-link) the workspace to the current user's cloud
   * Creates a new remote ID and associates it with the current user
   */
  async linkWorkspaceToCurrentUser(): Promise<string> {
    // Get current user
    const user = await this.call('auth', 'getUser')
    if (!user?.sub) {
      throw new Error('You must be logged in to link a workspace')
    }
    
    // Generate a new remote ID
    const newRemoteId = generateWorkspaceId()
    console.log('[S3StoragePlugin] Linking workspace to current user with new ID:', newRemoteId)
    
    let config = await this.getRemixConfig()
    if (!config) {
      config = {}
    }
    
    // Create fresh config for this user (don't carry over old timestamps)
    config['remote-workspace'] = {
      remoteId: newRemoteId,
      userId: user.sub,
      createdAt: new Date().toISOString()
    }
    
    await this.saveRemixConfig(config)
    
    await this.call('notification', 'toast', `🔗 Workspace linked to your cloud: ${newRemoteId}`)
    
    return newRemoteId
  }

  /**
   * Get the last save time for the current workspace
   */
  async getLastSaveTime(workspaceName?: string): Promise<string | null> {
    const config = await this.getRemixConfig()
    return config?.['remote-workspace']?.lastSaveAt || null
  }

  /**
   * Get the last backup time for the current workspace
   */
  async getLastBackupTime(workspaceName?: string): Promise<string | null> {
    const config = await this.getRemixConfig()
    return config?.['remote-workspace']?.lastBackupAt || null
  }

  /**
   * Update the last save time in config
   */
  private async updateLastSaveTime(): Promise<void> {
    let config = await this.getRemixConfig()
    if (!config || !config['remote-workspace']) return
    
    config['remote-workspace'].lastSaveAt = new Date().toISOString()
    await this.saveRemixConfig(config)
  }

  /**
   * Update the last backup time in config
   */
  private async updateLastBackupTime(): Promise<void> {
    let config = await this.getRemixConfig()
    if (!config || !config['remote-workspace']) return
    
    config['remote-workspace'].lastBackupAt = new Date().toISOString()
    await this.saveRemixConfig(config)
  }

  /**
   * Save the current workspace to cloud (immediate save to autosave slot)
   * This is a manual trigger for the autosave functionality
   */
  async saveToCloud(): Promise<void> {
    console.log('[S3StoragePlugin] Manual save to cloud triggered')
    
    // Check ownership first
    const ownership = await this.checkWorkspaceOwnership()
    if (!ownership.isOwner && ownership.hasRemoteId) {
      throw new Error("This workspace is linked to another user's cloud storage. Use 'Link to my account' to create your own cloud link.")
    }
    
    const workspaceRemoteId = await this.ensureWorkspaceRemoteId()
    if (!workspaceRemoteId) {
      throw new Error('No workspace remote ID configured')
    }
    
    // Get workspace name for filename
    let workspaceName = 'workspace'
    try {
      const currentWorkspace = await this.call('filePanel', 'getCurrentWorkspace')
      workspaceName = currentWorkspace?.name || 'workspace'
    } catch (e) {
      console.warn('[S3StoragePlugin] Could not get workspace name:', e)
    }

    await this.call('notification', 'toast', '☁️ Saving to cloud...')
    
    // Use the same createBackup logic but save to autosave slot
    const folder = `${workspaceRemoteId}/autosave`
    const sanitizedName = workspaceName.replace(/[^a-zA-Z0-9-_]/g, '-')
    const filename = `${sanitizedName}-autosave.zip`
    
    await this.createBackup(filename, folder)
    await this.updateLastSaveTime()
    
    console.log('[S3Storage] Emitting saveCompleted event', { workspaceRemoteId })
    this.emit('saveCompleted', { workspaceRemoteId })
    await this.call('notification', 'toast', '✅ Saved to cloud')
  }
  
  onDeactivation(): void {
    console.log('[S3StoragePlugin] Deactivated')
    this.off('auth', 'authStateChanged')
    this.stopAutosave()
  }
  
  /**
   * Initialize the storage provider
   */
  private async initializeProvider(): Promise<void> {
    // Create API client for storage endpoint
    this.apiClient = new ApiClient(endpointUrls.storage)
    
    // Create storage API service
    this.storageApi = new StorageApiService(this.apiClient)
    
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
   * List all remote workspaces for the current user with backup info
   * 
   * @returns List of workspaces with their backup counts and last backup dates
   * 
   * @example
   * const result = await s3Storage.listWorkspaces()
   * // { workspaces: [{ id: 'sage-lotus-uq4m', backupCount: 3, lastBackup: '2025-12-26...', totalSize: 26652 }] }
   */
  async listWorkspaces(): Promise<{ workspaces: { id: string; backupCount: number; lastBackup: string | null; totalSize: number }[] }> {
    this.ensureProvider()
    
    // Ensure storageApi is initialized
    if (!this.storageApi) {
      throw new Error('Storage API not initialized. Please log in first.')
    }
    
    // Check if user is authenticated
    const user = await this.call('auth', 'getUser')
    if (!user) {
      throw new Error('You must be logged in to list workspaces')
    }
    
    try {
      const response = await this.storageApi.getWorkspaces()
      
      if (!response.ok || !response.data) {
        throw new Error(response.error || 'Failed to list workspaces')
      }
      
      return response.data
    } catch (error) {
      this.emitError('listWorkspaces', '', error as Error)
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
    
    // Check ownership first
    const ownership = await this.checkWorkspaceOwnership()
    if (!ownership.isOwner && ownership.hasRemoteId) {
      throw new Error("This workspace is linked to another user's cloud storage. Use 'Link to my account' to create your own cloud link.")
    }
    
    // Get or create workspace remote ID
    const workspaceRemoteId = await this.ensureWorkspaceRemoteId()
    
    // Get workspace name for filename
    let workspaceName = 'workspace'
    try {
      const currentWorkspace = await this.call('filePanel', 'getCurrentWorkspace')
      workspaceName = currentWorkspace?.name || 'workspace'
    } catch (e) {
      console.warn('[S3StoragePlugin] Could not get workspace name:', e)
    }
    
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
    
    // Upload to S3 with workspace name in filename
    const sanitizedName = workspaceName.replace(/[^a-zA-Z0-9-_]/g, '-')
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
    const backupFilename = `${sanitizedName}-${timestamp}.zip`
    const backupPath = `${workspaceRemoteId}/backups/${backupFilename}`
    
    console.log(`[S3StoragePlugin] 🚀 Uploading backup: ${backupPath}`)
    
    const key = await this.upload(backupFilename, content, { 
      folder: `${workspaceRemoteId}/backups`,
      contentType: 'application/zip'
    })
    
    console.log(`[S3StoragePlugin] ✅ Backup complete: ${key}`)
    
    // Update the last backup time in config
    await this.updateLastBackupTime()
    
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
   * Restore a backup to a NEW workspace
   * Creates a new workspace and restores the backup content to it
   * @param backupPath - Full path like "workspace-id/backups/backup-123.zip" or "workspace-id/autosave/autosave-backup.zip"
   */
  async restoreBackupToNewWorkspace(backupPath: string): Promise<void> {
    const provider = this.ensureProvider()
    
    // Check if user is authenticated
    const user = await this.call('auth', 'getUser')
    if (!user) {
      throw new Error('You must be logged in to restore a backup')
    }
    
    // Parse the backup path into folder and filename
    const lastSlashIndex = backupPath.lastIndexOf('/')
    if (lastSlashIndex === -1) {
      throw new Error('Invalid backup path format')
    }
    
    const backupFolder = backupPath.substring(0, lastSlashIndex)
    const backupFilename = backupPath.substring(lastSlashIndex + 1)
    
    // Extract the remote workspace ID from the path (first segment)
    const remoteWorkspaceId = backupPath.split('/')[0]
    
    console.log(`[S3StoragePlugin] 📥 Downloading backup for new workspace: ${backupPath}`)
    
    // Download the backup using folder and filename
    const content = await this.downloadBinary(backupFilename, backupFolder)
    
    console.log(`[S3StoragePlugin] Downloaded ${(content.length / 1024).toFixed(2)} KB`)
    
    // Unzip to get metadata for workspace name
    const zip = await JSZip.loadAsync(content)
    
    // Read metadata to get original workspace name
    let originalWorkspaceName = 'restored-workspace'
    const metadataFile = zip.file('_backup_metadata.json')
    if (metadataFile) {
      try {
        const metadataStr = await metadataFile.async('string')
        const metadata = JSON.parse(metadataStr)
        if (metadata.workspaceName) {
          originalWorkspaceName = metadata.workspaceName
        }
      } catch (e) {
        console.warn('[S3StoragePlugin] Could not parse backup metadata:', e)
      }
    }
    
    // Generate a unique name for the new workspace
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
    const newWorkspaceName = `${originalWorkspaceName}-restored-${timestamp}`
    
    // Create the new workspace (blank template, no need for git)
    await this.call('filePanel', 'createWorkspace', newWorkspaceName, 'blank')
    
    console.log(`[S3StoragePlugin] Created new workspace: ${newWorkspaceName}`)
    
    // Extract and write files to the new workspace
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
    
    // Link the new workspace to the same remote ID so future saves sync
    await this.setWorkspaceRemoteId(newWorkspaceName, remoteWorkspaceId)
    
    console.log(`[S3StoragePlugin] ✅ Restored ${restoredCount} files to new workspace: ${newWorkspaceName}`)
    
    this.emit('restoreCompleted', { 
      backupPath, 
      fileCount: restoredCount,
      workspaceRemoteId: remoteWorkspaceId,
      newWorkspaceName 
    })
    
    await this.call('notification', 'toast', `☁️ Restored to new workspace: ${newWorkspaceName} (${restoredCount} files)`)
  }
  
  /**
   * Emit an error event
   */
  private emitError(operation: string, path: string, error: Error): void {
    console.error(`[S3StoragePlugin] ${operation} error for ${path}:`, error)
    this.emit('error', { operation, path, error })
  }
}
