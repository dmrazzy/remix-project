/**
 * Typed API definitions for SSO/Auth endpoints
 * All types match the backend API contract
 */

import { AuthUser, AuthProvider } from './sso-api'

// ==================== Credits ====================

export interface Credits {
  balance: number
  free_credits: number
  paid_credits: number
}

export interface CreditTransaction {
  id: number
  group_id: number
  user_id: number
  amount: number
  type: 'credit' | 'debit'
  reason: string
  metadata: Record<string, unknown> | null
  created_at: string
}

// ==================== Linked Accounts ====================

export interface LinkedAccount {
  id: number
  provider: AuthProvider
  provider_user_id: string
  name: string | null
  picture: string | null
  isPrimary: boolean
  isLinked: boolean
  created_at: string
  last_login_at: string | null
}

export interface AccountsResponse {
  primary: LinkedAccount | null
  accounts: LinkedAccount[]
}

// ==================== Link Account ====================

export interface LinkAccountRequest {
  user_id: number
}

export interface LinkAccountResponse {
  ok: boolean
  message: string
  primary: number
}

// ==================== GitHub Link ====================

export interface GitHubLinkRequest {
  access_token: string
}

export interface GitHubLinkResponse {
  ok: boolean
  message: string
  github_user: {
    id: number
    login: string
    name: string | null
    avatar_url: string | null
  }
}

// ==================== SIWE ====================

export interface SiweVerifyRequest {
  message: string
  signature: string
}

export interface SiweVerifyResponse {
  token: string
  user: {
    id: number
    address: string
    chainId: number
  }
}

// ==================== Auth Verification ====================

export interface VerifyResponse {
  authenticated: boolean
  user?: {
    id: number
    email: string | null
    name: string | null
  }
}

// ==================== Providers ====================

export interface ProvidersResponse {
  providers: AuthProvider[]
}

// ==================== Generic Success ====================

export interface GenericSuccessResponse {
  ok: boolean
  message: string
}

// ==================== Token Refresh ====================

export interface RefreshTokenResponse {
  access_token: string
  refresh_token?: string
}

// ==================== Storage ====================

/**
 * Storage health check response
 */
export interface StorageHealthResponse {
  ok: boolean
  provider: string
  message?: string
}

/**
 * Storage configuration (limits and allowed types)
 */
export interface StorageConfig {
  maxFileSize: number
  maxTotalStorage: number
  allowedMimeTypes: string[]
  allowedExtensions: string[]
}

/**
 * Request for presigned upload URL
 */
export interface PresignUploadRequest {
  filename: string
  folder?: string
  contentType: string
  fileSize?: number
  /** Optional metadata to store with the file (e.g., workspaceName, userId) */
  metadata?: Record<string, string>
}

/**
 * Response with presigned upload URL
 */
export interface PresignUploadResponse {
  url: string
  headers: Record<string, string>
  expiresAt: string
  key: string
}

/**
 * Request for presigned download URL
 */
export interface PresignDownloadRequest {
  filename: string
  folder?: string
}

/**
 * Response with presigned download URL
 */
export interface PresignDownloadResponse {
  url: string
  expiresAt: string
}

/**
 * File metadata stored in the system
 */
export interface StorageFile {
  filename: string
  folder: string
  key: string
  contentType: string
  size: number
  uploadedAt: string
  lastModified: string
  etag?: string
  /** S3 object metadata (workspaceName, userId, etc.) */
  metadata?: Record<string, string>
}

/**
 * List of user's files
 */
export interface StorageFilesResponse {
  files: StorageFile[]
  totalSize: number
  totalCount: number
  nextCursor?: string
}

/**
 * File list request options
 */
export interface StorageListOptions {
  folder?: string
  limit?: number
  cursor?: string
}

/**
 * Summary of a remote workspace
 */
export interface WorkspaceSummary {
  id: string
  backupCount: number
  lastBackup: string | null
  totalSize: number
  /** Original workspace name from the most recent backup metadata */
  workspaceName?: string
  /** User ID who owns this remote workspace */
  userId?: string
}

/**
 * List of user's remote workspaces
 */
export interface WorkspacesResponse {
  workspaces: WorkspaceSummary[]
}
