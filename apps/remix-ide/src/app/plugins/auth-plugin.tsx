/**
 * Auth Plugin for Remix IDE
 * Handles SSO authentication, SIWE wallet login, and credits management
 * 
 * Refactored to use modular helpers in ./auth/
 */

import { Plugin } from '@remixproject/engine'
import { 
  AuthUser, 
  AuthProvider as AuthProviderType, 
  ApiClient, 
  SSOApiService, 
  CreditsApiService, 
  Credits 
} from '@remix-api'
import { endpointUrls } from '@remix-endpoints-helper'

// Import auth helpers
import {
  tokenStorage,
  createRefreshScheduler,
  performPopupLogin,
  performSIWELogin,
  performSIWEAccountLink
} from './auth'

const profile = {
  name: 'auth',
  displayName: 'Authentication',
  description: 'Handles SSO authentication and credits',
  methods: [
    'login', 
    'logout', 
    'getUser', 
    'getToken', 
    'getCredits', 
    'refreshCredits', 
    'linkAccount', 
    'getLinkedAccounts', 
    'unlinkAccount', 
    'getApiClient', 
    'getSSOApi', 
    'getCreditsApi', 
    'isAuthenticated'
  ],
  events: ['authStateChanged', 'creditsUpdated', 'accountLinked']
}

export class AuthPlugin extends Plugin {
  private apiClient: ApiClient
  private ssoApi: SSOApiService
  private creditsApi: CreditsApiService
  private creditsClient: ApiClient
  private refreshScheduler: ReturnType<typeof createRefreshScheduler>

  constructor() {
    super(profile)

    // Initialize API clients
    this.apiClient = new ApiClient(endpointUrls.sso)
    this.ssoApi = new SSOApiService(this.apiClient)

    // Credits API uses different base URL
    this.creditsClient = new ApiClient(endpointUrls.credits)
    this.creditsApi = new CreditsApiService(this.creditsClient)

    // Set up token refresh callback for auto-renewal
    this.apiClient.setTokenRefreshCallback(() => this.refreshAccessToken())
    this.creditsClient.setTokenRefreshCallback(() => this.refreshAccessToken())

    // Create refresh scheduler
    this.refreshScheduler = createRefreshScheduler(() => this.refreshAccessToken())
  }

  // ==================== Lifecycle ====================

  onActivation(): void {
    console.log('[AuthPlugin] Activated')
    this.restoreSession()
  }

  /**
   * Restore session from localStorage on page load
   */
  private async restoreSession(): Promise<void> {
    const token = tokenStorage.getAccessToken()
    const user = tokenStorage.getUser()
    
    if (!token || !user) return

    try {
      // If we have a refresh token, proactively refresh on page load
      if (tokenStorage.hasRefreshToken()) {
        const newToken = await this.refreshAccessToken()
        this.emitAuthState(true, user, newToken || token)
      } else {
        this.emitAuthState(true, user, token)
        this.refreshScheduler.schedule(token)
      }
      
      // Auto-refresh credits
      this.refreshCredits().catch(console.error)
    } catch (e) {
      console.error('[AuthPlugin] Failed to restore session:', e)
    }
  }

  // ==================== Auth State ====================

  private emitAuthState(isAuthenticated: boolean, user?: AuthUser | null, token?: string | null): void {
    this.emit('authStateChanged', { isAuthenticated, user, token })
  }

  /**
   * Handle successful authentication result
   * Works the same for all providers (OAuth, SIWE, etc.)
   */
  private handleAuthSuccess(
    user: AuthUser, 
    accessToken: string, 
    refreshToken?: string
  ): void {
    console.log('[AuthPlugin] handleAuthSuccess called')
    console.log('[AuthPlugin] Has refresh token:', !!refreshToken)
    
    // Store tokens
    tokenStorage.setTokens(accessToken, refreshToken)
    tokenStorage.setUser(user)

    // Schedule proactive refresh (works the same for all auth methods)
    if (refreshToken) {
      console.log('[AuthPlugin] Scheduling token refresh')
      this.refreshScheduler.schedule(accessToken)
    } else {
      console.warn('[AuthPlugin] No refresh token - token will expire without refresh')
    }

    // Emit auth state
    this.emitAuthState(true, user, accessToken)

    // Fetch credits
    this.refreshCredits().catch(console.error)

    console.log('[AuthPlugin] Login successful')
  }

  // ==================== Public API: Authentication ====================

  async login(provider: AuthProviderType): Promise<void> {
    try {
      console.log('[AuthPlugin] Starting login for:', provider)

      if (provider === 'siwe') {
        const result = await performSIWELogin(endpointUrls.sso)
        console.log('[AuthPlugin] SIWE login result:', {
          hasUser: !!result.user,
          hasAccessToken: !!result.accessToken,
          hasRefreshToken: !!result.refreshToken
        })
        this.handleAuthSuccess(result.user, result.accessToken, result.refreshToken)
      } else {
        const result = await performPopupLogin({
          provider,
          ssoBaseUrl: endpointUrls.sso,
          origin: window.location.origin
        })
        this.handleAuthSuccess(result.user, result.accessToken, result.refreshToken)
      }
    } catch (error) {
      console.error('[AuthPlugin] Login failed:', error)
      throw error
    }
  }

  async logout(): Promise<void> {
    try {
      // Call backend logout endpoint
      await fetch(`${endpointUrls.sso}/logout`, {
        method: 'POST',
        credentials: 'include'
      })

      // Clear tokens and scheduler
      this.refreshScheduler.clear()
      tokenStorage.clear()

      // Emit auth state change
      this.emitAuthState(false, null, null)

      console.log('[AuthPlugin] Logout successful')
    } catch (error) {
      console.error('[AuthPlugin] Logout failed:', error)
    }
  }

  async isAuthenticated(): Promise<boolean> {
    return !!tokenStorage.getAccessToken()
  }

  async getUser(): Promise<AuthUser | null> {
    return tokenStorage.getUser()
  }

  async getToken(): Promise<string | null> {
    const token = tokenStorage.getAccessToken()

    // Update API clients with current token
    if (token) {
      this.apiClient.setToken(token)
      this.creditsClient.setToken(token)
    }

    return token
  }

  // ==================== Token Refresh ====================

  private async refreshAccessToken(): Promise<string | null> {
    try {
      const refreshToken = tokenStorage.getRefreshToken()
      if (!refreshToken) {
        console.warn('[AuthPlugin] No refresh token available')
        return null
      }

      console.log('[AuthPlugin] Refreshing access token...')

      const response = await this.ssoApi.refreshToken(refreshToken)

      if (response.ok && response.data) {
        const newAccessToken = response.data.access_token

        // Update storage
        tokenStorage.setTokens(newAccessToken, response.data.refresh_token)

        // Update API clients
        this.apiClient.setToken(newAccessToken)
        this.creditsClient.setToken(newAccessToken)

        console.log('[AuthPlugin] Access token refreshed successfully')

        // Reschedule next proactive refresh
        this.refreshScheduler.schedule(newAccessToken)
        return newAccessToken
      }

      console.warn('[AuthPlugin] Token refresh failed:', response.error)

      // If refresh failed with 401, logout
      if (response.status === 401) {
        await this.logout()
      }

      return null
    } catch (error) {
      console.error('[AuthPlugin] Token refresh error:', error)
      return null
    }
  }

  // ==================== Account Linking ====================

  async linkAccount(provider: AuthProviderType): Promise<void> {
    try {
      console.log('[AuthPlugin] Starting account linking for:', provider)

      const currentToken = await this.getToken()
      const currentUser = tokenStorage.getUser()

      if (!currentToken || !currentUser) {
        throw new Error('You must be logged in to link additional accounts')
      }

      if (provider === 'siwe') {
        await performSIWEAccountLink(endpointUrls.sso, currentToken)
        this.emit('accountLinked', { provider })
        return
      }

      // OAuth providers - open popup for linking
      const result = await this.performOAuthAccountLink(provider, currentToken)
      
      // Restore original session
      tokenStorage.setTokens(currentToken)
      tokenStorage.setUser(currentUser)

      this.emit('accountLinked', { provider })
      console.log('[AuthPlugin] Account linked successfully!')

    } catch (error) {
      console.error('[AuthPlugin] Account linking failed:', error)
      throw error
    }
  }

  private async performOAuthAccountLink(
    provider: AuthProviderType, 
    currentToken: string
  ): Promise<void> {
    const popup = window.open(
      `${endpointUrls.sso}/login/${provider}?mode=popup&link=true&origin=${encodeURIComponent(window.location.origin)}`,
      'RemixLinkAccount',
      'width=500,height=600,menubar=no,toolbar=no,location=no,status=no'
    )

    if (!popup) {
      throw new Error('Popup was blocked. Please allow popups for this site.')
    }

    const result = await this.waitForPopupMessage(popup)

    // Call backend to link the accounts
    const linkResponse = await fetch(`${endpointUrls.sso}/accounts/link/${provider}`, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${currentToken}`
      },
      body: JSON.stringify({
        user_id: result.user.sub
      })
    })

    if (!linkResponse.ok) {
      const error = await linkResponse.json().catch(() => ({ error: 'Failed to link account' }))
      throw new Error(error.error || 'Account linking failed')
    }
  }

  private waitForPopupMessage(popup: Window): Promise<{ user: AuthUser; accessToken: string }> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        cleanup()
        reject(new Error('Account linking timeout'))
      }, 5 * 60 * 1000)

      const pollInterval = setInterval(() => {
        if (popup && popup.closed) {
          cleanup()
          reject(new Error('Account linking cancelled - popup was closed'))
        }
      }, 500)

      const handleMessage = (event: MessageEvent) => {
        if (event.origin !== new URL(endpointUrls.sso).origin) return

        if (event.data.type === 'sso-auth-success') {
          cleanup()
          resolve({ user: event.data.user, accessToken: event.data.accessToken })
        } else if (event.data.type === 'sso-auth-error') {
          cleanup()
          reject(new Error(event.data.error || 'Account linking failed'))
        }
      }

      const cleanup = () => {
        clearTimeout(timeout)
        clearInterval(pollInterval)
        window.removeEventListener('message', handleMessage)
        if (popup && !popup.closed) popup.close()
      }

      window.addEventListener('message', handleMessage)
    })
  }

  // ==================== Linked Accounts Management ====================

  async getLinkedAccounts() {
    try {
      await this.getToken()
      const response = await this.ssoApi.getAccounts()

      if (response.ok && response.data) {
        return response.data
      }

      if (response.error) {
        console.error('[AuthPlugin] Failed to get linked accounts:', response.error)
      }

      return null
    } catch (error) {
      console.error('[AuthPlugin] Failed to get linked accounts:', error)
      return null
    }
  }

  async unlinkAccount(userId: number) {
    try {
      await this.getToken()
      const response = await this.ssoApi.unlinkAccount(userId)

      if (response.ok) {
        return response.data
      }

      throw new Error(response.error || 'Failed to unlink account')
    } catch (error) {
      console.error('[AuthPlugin] Failed to unlink account:', error)
      throw error
    }
  }

  // ==================== Credits ====================

  async getCredits(): Promise<Credits | null> {
    try {
      await this.getToken()
      
      const response = await this.creditsApi.getBalance()

      if (response.ok && response.data) {
        return response.data
      }

      if (response.status === 401) {
        console.warn('[AuthPlugin] Not authenticated for credits')
      } else if (response.error) {
        console.error('[AuthPlugin] Credits API error:', response.error)
      }

      return null
    } catch (error) {
      console.error('[AuthPlugin] Failed to fetch credits:', error)
      return null
    }
  }

  async refreshCredits(): Promise<Credits | null> {
    const credits = await this.getCredits()
    if (credits) {
      this.emit('creditsUpdated', credits)
    }
    return credits
  }

  // ==================== API Clients (for other plugins) ====================

  async getApiClient(): Promise<ApiClient> {
    return this.apiClient
  }

  async getSSOApi(): Promise<SSOApiService> {
    return this.ssoApi
  }

  async getCreditsApi(): Promise<CreditsApiService> {
    return this.creditsApi
  }
}
