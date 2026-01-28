/**
 * OAuth popup-based login flow
 * Handles opening popups and waiting for auth results
 */

import { AuthResult, PopupLoginOptions } from './types'

/**
 * Open a popup window for OAuth login
 */
export function openAuthPopup(url: string, name: string = 'RemixLogin'): Window | null {
  return window.open(
    url,
    name,
    'width=500,height=600,menubar=no,toolbar=no,location=no,status=no'
  )
}

/**
 * Wait for auth result from popup via postMessage
 */
export function waitForPopupResult(
  popup: Window,
  expectedOrigin: string,
  timeoutMs: number = 5 * 60 * 1000
): Promise<AuthResult> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      cleanup()
      reject(new Error('Login timeout'))
    }, timeoutMs)

    // Poll to detect if popup is closed
    const pollInterval = setInterval(() => {
      if (popup && popup.closed) {
        cleanup()
        reject(new Error('Login cancelled - popup was closed'))
      }
    }, 500)

    const handleMessage = (event: MessageEvent) => {
      // Verify origin
      if (event.origin !== expectedOrigin) {
        return
      }

      if (event.data.type === 'sso-auth-success') {
        cleanup()
        resolve({
          user: event.data.user,
          accessToken: event.data.accessToken,
          refreshToken: event.data.refreshToken
        })
      } else if (event.data.type === 'sso-auth-error') {
        cleanup()
        reject(new Error(event.data.error || 'Login failed'))
      }
    }

    const cleanup = () => {
      clearTimeout(timeout)
      clearInterval(pollInterval)
      window.removeEventListener('message', handleMessage)
      if (popup && !popup.closed) {
        popup.close()
      }
    }

    window.addEventListener('message', handleMessage)
  })
}

/**
 * Complete OAuth popup login flow
 */
export async function performPopupLogin(options: PopupLoginOptions): Promise<AuthResult> {
  const { provider, ssoBaseUrl, origin, timeoutMs } = options
  
  const loginUrl = `${ssoBaseUrl}/test/login?mode=popup&origin=${encodeURIComponent(origin)}`
  
  const popup = openAuthPopup(loginUrl)
  if (!popup) {
    throw new Error('Popup was blocked. Please allow popups for this site.')
  }

  const expectedOrigin = new URL(ssoBaseUrl).origin
  return waitForPopupResult(popup, expectedOrigin, timeoutMs)
}

/**
 * OAuth popup-based account linking flow
 */
export async function performPopupAccountLink(options: PopupLoginOptions): Promise<AuthResult> {
  const { provider, ssoBaseUrl, origin, timeoutMs } = options
  
  const linkUrl = `${ssoBaseUrl}/link/${provider}?mode=popup&origin=${encodeURIComponent(origin)}`
  
  const popup = openAuthPopup(linkUrl, 'RemixLinkAccount')
  if (!popup) {
    throw new Error('Popup was blocked. Please allow popups for this site.')
  }

  const expectedOrigin = new URL(ssoBaseUrl).origin
  return waitForPopupResult(popup, expectedOrigin, timeoutMs)
}
