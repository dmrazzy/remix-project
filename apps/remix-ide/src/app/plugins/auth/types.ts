/**
 * Auth module types and interfaces
 */

import { AuthUser } from '@remix-api'

/**
 * Result of a successful authentication
 */
export interface AuthResult {
  user: AuthUser
  accessToken: string
  refreshToken?: string
}

/**
 * Token storage keys
 */
export const TOKEN_STORAGE_KEYS = {
  ACCESS_TOKEN: 'remix_access_token',
  REFRESH_TOKEN: 'remix_refresh_token',
  USER: 'remix_user'
} as const

/**
 * Auth state change event payload
 */
export interface AuthStateChangedPayload {
  isAuthenticated: boolean
  user?: AuthUser
  token?: string
}

/**
 * Popup login options
 */
export interface PopupLoginOptions {
  provider: string
  ssoBaseUrl: string
  origin: string
  timeoutMs?: number
}

/**
 * SIWE message parameters
 */
export interface SIWEMessageParams {
  domain: string
  address: string
  statement: string
  uri: string
  version: string
  chainId: number
  nonce: string
  issuedAt: string
}
