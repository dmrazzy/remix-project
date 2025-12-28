/**
 * Token management utilities
 * Handles token storage, parsing, and refresh scheduling
 */

import { TOKEN_STORAGE_KEYS } from './types'

/**
 * Parse JWT token to extract expiry time
 */
export function getTokenExpiryMs(token: string): number | null {
  try {
    const parts = token.split('.')
    if (parts.length !== 3) return null
    const payload = JSON.parse(atob(parts[1]))
    if (!payload.exp) return null
    return payload.exp * 1000
  } catch {
    return null
  }
}

/**
 * Check if a token is expired or about to expire
 */
export function isTokenExpired(token: string, bufferMs: number = 0): boolean {
  const expMs = getTokenExpiryMs(token)
  if (!expMs) return true
  return Date.now() + bufferMs >= expMs
}

/**
 * Token storage operations
 */
export const tokenStorage = {
  getAccessToken(): string | null {
    return localStorage.getItem(TOKEN_STORAGE_KEYS.ACCESS_TOKEN)
  },

  getRefreshToken(): string | null {
    return localStorage.getItem(TOKEN_STORAGE_KEYS.REFRESH_TOKEN)
  },

  getUser(): any | null {
    try {
      const userStr = localStorage.getItem(TOKEN_STORAGE_KEYS.USER)
      return userStr ? JSON.parse(userStr) : null
    } catch {
      return null
    }
  },

  setTokens(accessToken: string, refreshToken?: string): void {
    localStorage.setItem(TOKEN_STORAGE_KEYS.ACCESS_TOKEN, accessToken)
    if (refreshToken) {
      localStorage.setItem(TOKEN_STORAGE_KEYS.REFRESH_TOKEN, refreshToken)
    }
  },

  setUser(user: any): void {
    localStorage.setItem(TOKEN_STORAGE_KEYS.USER, JSON.stringify(user))
  },

  clear(): void {
    localStorage.removeItem(TOKEN_STORAGE_KEYS.ACCESS_TOKEN)
    localStorage.removeItem(TOKEN_STORAGE_KEYS.REFRESH_TOKEN)
    localStorage.removeItem(TOKEN_STORAGE_KEYS.USER)
  },

  hasRefreshToken(): boolean {
    return !!localStorage.getItem(TOKEN_STORAGE_KEYS.REFRESH_TOKEN)
  }
}

/**
 * Create a token refresh scheduler
 */
export function createRefreshScheduler(
  onRefresh: () => Promise<string | null>
): {
  schedule: (accessToken: string) => void
  clear: () => void
} {
  let timerId: number | null = null

  const clear = () => {
    if (timerId) {
      window.clearTimeout(timerId)
      timerId = null
    }
  }

  const schedule = (accessToken: string) => {
    const expMs = getTokenExpiryMs(accessToken)
    if (!expMs) return

    // Don't schedule if we don't have a refresh token
    if (!tokenStorage.hasRefreshToken()) return

    const now = Date.now()
    // Refresh 90s before expiry (min 5s)
    const delay = Math.max(expMs - now - 90_000, 5_000)

    clear()
    timerId = window.setTimeout(() => {
      onRefresh().catch(() => {/* handled in callback */})
    }, delay)
  }

  return { schedule, clear }
}
