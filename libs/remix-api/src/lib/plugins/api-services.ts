/**
 * Typed SSO API service
 * Provides strongly-typed methods for all SSO/Auth endpoints
 */

import { IApiClient, ApiResponse } from './api-client'
import {
  Credits,
  LinkedAccount,
  AccountsResponse,
  LinkAccountRequest,
  LinkAccountResponse,
  GitHubLinkRequest,
  GitHubLinkResponse,
  SiweVerifyRequest,
  SiweVerifyResponse,
  VerifyResponse,
  ProvidersResponse,
  GenericSuccessResponse,
  CreditTransaction,
  RefreshTokenResponse,
  StorageHealthResponse,
  StorageConfig,
  PresignUploadRequest,
  PresignUploadResponse,
  PresignDownloadRequest,
  PresignDownloadResponse,
  StorageFile,
  StorageFilesResponse,
  StorageListOptions,
  WorkspacesResponse
} from './api-types'

/**
 * SSO API Service - All SSO/Auth endpoints with full TypeScript typing
 */
export class SSOApiService {
  constructor(private apiClient: IApiClient) {}
  
  // ==================== Authentication ====================
  
  /**
   * Verify current authentication status
   */
  async verify(): Promise<ApiResponse<VerifyResponse>> {
    return this.apiClient.get<VerifyResponse>('/verify')
  }
  
  /**
   * Logout current user
   */
  async logout(): Promise<ApiResponse<GenericSuccessResponse>> {
    return this.apiClient.post<GenericSuccessResponse>('/logout')
  }
  
  /**
   * Refresh access token using refresh token
   */
  async refreshToken(refreshToken: string): Promise<ApiResponse<RefreshTokenResponse>> {
    return this.apiClient.post<RefreshTokenResponse>('/refresh', { refresh_token: refreshToken })
  }
  
  /**
   * Get list of enabled auth providers
   */
  async getProviders(): Promise<ApiResponse<ProvidersResponse>> {
    return this.apiClient.get<ProvidersResponse>('/providers')
  }
  
  // ==================== SIWE ====================
  
  /**
   * Get nonce for SIWE message signing
   */
  async getSiweNonce(): Promise<ApiResponse<string>> {
    return this.apiClient.get<string>('/siwe/nonce')
  }
  
  /**
   * Verify SIWE signature and get JWT
   */
  async verifySiwe(request: SiweVerifyRequest): Promise<ApiResponse<SiweVerifyResponse>> {
    return this.apiClient.post<SiweVerifyResponse>('/siwe/verify', request)
  }
  
  // ==================== Linked Accounts ====================
  
  /**
   * Get all linked accounts for authenticated user
   */
  async getAccounts(): Promise<ApiResponse<AccountsResponse>> {
    return this.apiClient.get<AccountsResponse>('/accounts')
  }
  
  /**
   * Link a new provider account to current user
   */
  async linkAccount(provider: string, request: LinkAccountRequest): Promise<ApiResponse<LinkAccountResponse>> {
    return this.apiClient.post<LinkAccountResponse>(`/accounts/link/${provider}`, request)
  }
  
  /**
   * Unlink a provider account
   */
  async unlinkAccount(userId: number): Promise<ApiResponse<GenericSuccessResponse>> {
    return this.apiClient.delete<GenericSuccessResponse>(`/accounts/${userId}`)
  }
  
  /**
   * Link GitHub account (special endpoint)
   */
  async linkGitHub(request: GitHubLinkRequest): Promise<ApiResponse<GitHubLinkResponse>> {
    return this.apiClient.post<GitHubLinkResponse>('/github/link', request)
  }
  
  /**
   * Link SIWE account (special endpoint)
   */
  async linkSiwe(request: SiweVerifyRequest): Promise<ApiResponse<SiweVerifyResponse>> {
    return this.apiClient.post<SiweVerifyResponse>('/siwe/link', request)
  }
}

/**
 * Credits API Service - All credit-related endpoints with full TypeScript typing
 */
export class CreditsApiService {
  constructor(private apiClient: IApiClient) {}
  
  /**
   * Get current credit balance
   */
  async getBalance(): Promise<ApiResponse<Credits>> {
    return this.apiClient.get<Credits>('/balance')
  }
  
  /**
   * Get credit transaction history
   */
  async getTransactions(limit?: number, offset?: number): Promise<ApiResponse<{ transactions: CreditTransaction[], total: number }>> {
    const params = new URLSearchParams()
    if (limit !== undefined) params.set('limit', limit.toString())
    if (offset !== undefined) params.set('offset', offset.toString())
    
    const query = params.toString()
    return this.apiClient.get(`/transactions${query ? '?' + query : ''}`)
  }
}

/**
 * Storage API Service - All storage-related endpoints with full TypeScript typing
 * Provides an abstraction layer for cloud storage operations (S3, etc.)
 */
export class StorageApiService {
  constructor(private apiClient: IApiClient) {}
  
  /**
   * Get the underlying API client
   */
  getApiClient(): IApiClient {
    return this.apiClient
  }
  
  // ==================== Health & Config ====================
  
  /**
   * Check storage service health
   */
  async health(): Promise<ApiResponse<StorageHealthResponse>> {
    return this.apiClient.get<StorageHealthResponse>('/health')
  }
  
  /**
   * Get storage configuration (limits, allowed types)
   */
  async getConfig(): Promise<ApiResponse<StorageConfig>> {
    return this.apiClient.get<StorageConfig>('/config')
  }
  
  // ==================== Presigned URLs ====================
  
  /**
   * Get a presigned URL for uploading a file
   * @param request - Upload request with filename, folder, and content type
   * @returns Presigned URL and headers to use for direct S3 upload
   */
  async getUploadUrl(request: PresignUploadRequest): Promise<ApiResponse<PresignUploadResponse>> {
    return this.apiClient.post<PresignUploadResponse>('/presign/upload', request)
  }
  
  /**
   * Get a presigned URL for downloading a file
   * @param request - Download request with filename and optional folder
   * @returns Presigned URL for direct S3 download
   */
  async getDownloadUrl(request: PresignDownloadRequest): Promise<ApiResponse<PresignDownloadResponse>> {
    return this.apiClient.post<PresignDownloadResponse>('/presign/download', request)
  }
  
  // ==================== File Management ====================
  
  /**
   * List user's files
   * @param options - Optional filtering and pagination
   */
  async listFiles(options?: StorageListOptions): Promise<ApiResponse<StorageFilesResponse>> {
    const params = new URLSearchParams()
    if (options?.folder) params.set('folder', options.folder)
    if (options?.limit !== undefined) params.set('limit', options.limit.toString())
    if (options?.cursor) params.set('cursor', options.cursor)
    
    const query = params.toString()
    return this.apiClient.get<StorageFilesResponse>(`/files${query ? '?' + query : ''}`)
  }
  
  /**
   * Get metadata for a specific file
   * @param filename - The filename (can include folder path)
   */
  async getFileMetadata(filename: string): Promise<ApiResponse<StorageFile>> {
    return this.apiClient.get<StorageFile>(`/files/${encodeURIComponent(filename)}`)
  }
  
  /**
   * Delete a file
   * @param filename - The filename to delete (can include folder path)
   */
  async deleteFile(filename: string): Promise<ApiResponse<GenericSuccessResponse>> {
    return this.apiClient.delete<GenericSuccessResponse>(`/files/${encodeURIComponent(filename)}`)
  }

  /**
   * Get list of user's remote workspaces with backup info
   */
  async getWorkspaces(): Promise<ApiResponse<WorkspacesResponse>> {
    return this.apiClient.get<WorkspacesResponse>('/workspaces')
  }
}
