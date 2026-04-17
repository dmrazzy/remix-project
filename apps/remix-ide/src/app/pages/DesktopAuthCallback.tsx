import React, { useEffect, useState, useRef } from 'react'
import '../components/styles/preload.css'

const logo = (
  <svg id="Ebene_2" data-name="Ebene 2" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 105 100">
    <path d="M91.84,35a.09.09,0,0,1-.1-.07,41,41,0,0,0-79.48,0,.09.09,0,0,1-.1.07C9.45,35,1,35.35,1,42.53c0,8.56,1,16,6,20.32,2.16,1.85,5.81,2.3,9.27,2.22a44.4,44.4,0,0,0,6.45-.68.09.09,0,0,0,.06-.15A34.81,34.81,0,0,1,17,45c0-.1,0-.21,0-.31a35,35,0,0,1,70,0c0,.1,0,.21,0,.31a34.81,34.81,0,0,1-5.78,19.24.09.09,0,0,0,.06.15,44.4,44.4,0,0,0,6.45.68c3.46.08,7.11-.37,9.27-2.22,5-4.27,6-11.76,6-20.32C103,35.35,94.55,35,91.84,35Z" />
    <path d="M52,74,25.4,65.13a.1.1,0,0,0-.1.17L51.93,91.93a.1.1,0,0,0,.14,0L78.7,65.3a.1.1,0,0,0-.1-.17L52,74A.06.06,0,0,1,52,74Z" />
    <path d="M75.68,46.9,82,45a.09.09,0,0,0,.08-.09,29.91,29.91,0,0,0-.87-6.94.11.11,0,0,0-.09-.08l-6.43-.58a.1.1,0,0,1-.06-.18l4.78-4.18a.13.13,0,0,0,0-.12,30.19,30.19,0,0,0-3.65-6.07.09.09,0,0,0-.11,0l-5.91,2a.1.1,0,0,1-.12-.14L72.19,23a.11.11,0,0,0,0-.12,29.86,29.86,0,0,0-5.84-4.13.09.09,0,0,0-.11,0l-4.47,4.13a.1.1,0,0,1-.17-.07l.09-6a.1.1,0,0,0-.07-.1,30.54,30.54,0,0,0-7-1.47.1.1,0,0,0-.1.07l-2.38,5.54a.1.1,0,0,1-.18,0l-2.37-5.54a.11.11,0,0,0-.11-.06,30,30,0,0,0-7,1.48.12.12,0,0,0-.07.1l.08,6.05a.09.09,0,0,1-.16.07L37.8,18.76a.11.11,0,0,0-.12,0,29.75,29.75,0,0,0-5.83,4.13.11.11,0,0,0,0,.12l2.59,5.6a.11.11,0,0,1-.13.14l-5.9-2a.11.11,0,0,0-.12,0,30.23,30.23,0,0,0-3.62,6.08.11.11,0,0,0,0,.12l4.79,4.19a.1.1,0,0,1-.06.17L23,37.91a.1.1,0,0,0-.09.07A29.9,29.9,0,0,0,22,44.92a.1.1,0,0,0,.07.1L28.4,47a.1.1,0,0,1,0,.18l-5.84,3.26a.16.16,0,0,0,0,.11,30.17,30.17,0,0,0,2.1,6.76c.32.71.67,1.4,1,2.08a.1.1,0,0,0,.06,0L52,68.16H52l26.34-8.78a.1.1,0,0,0,.06-.05,30.48,30.48,0,0,0,3.11-8.88.1.1,0,0,0-.05-.11l-5.83-3.26A.1.1,0,0,1,75.68,46.9Z" />
  </svg>
)

/**
 * Extract the desktop_auth state from the URL hash.
 * URL format: https://remix.ethereum.org/#desktop_auth=<state>
 */
function extractDesktopAuthState(): string | null {
  const hash = window.location.hash.slice(1) // strip #
  const params = new URLSearchParams(hash)
  return params.get('desktop_auth')
}

type AuthStatus = 'checking' | 'not_logged_in' | 'ready' | 'sending' | 'success' | 'error'

export const DesktopAuthCallback: React.FC = () => {
  const [status, setStatus] = useState<AuthStatus>('checking')
  const [error, setError] = useState<string>('')
  const [userName, setUserName] = useState<string>('')
  const hasRun = useRef(false)
  const stateRef = useRef<string | null>(null)

  useEffect(() => {
    if (hasRun.current) return
    hasRun.current = true

    const state = extractDesktopAuthState()
    if (!state) {
      setStatus('error')
      setError('Invalid authentication request - missing state parameter.')
      return
    }

    stateRef.current = state

    // Check if user is already logged in (has tokens in localStorage)
    const accessToken = localStorage.getItem('remix_access_token')
    const refreshToken = localStorage.getItem('remix_refresh_token')
    const userStr = localStorage.getItem('remix_user')

    if (accessToken && refreshToken && userStr) {
      try {
        const user = JSON.parse(userStr)
        setUserName(user.name || user.email || 'User')
        setStatus('ready')
      } catch {
        setStatus('not_logged_in')
      }
    } else {
      setStatus('not_logged_in')
    }
  }, [])

  const handleAuthorize = () => {
    const state = stateRef.current
    if (!state) return

    const accessToken = localStorage.getItem('remix_access_token')
    const refreshToken = localStorage.getItem('remix_refresh_token')
    const userStr = localStorage.getItem('remix_user')

    if (!accessToken || !refreshToken || !userStr) {
      setStatus('error')
      setError('Session expired. Please refresh and try again.')
      return
    }

    setStatus('sending')

    // Base64url encode the user data for safe URL transport
    const userBase64 = btoa(userStr)
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '')

    // Build the remix:// callback URL
    const callbackUrl = `remix://auth/sso-callback?state=${encodeURIComponent(state)}&access_token=${encodeURIComponent(accessToken)}&refresh_token=${encodeURIComponent(refreshToken)}&user=${encodeURIComponent(userBase64)}`

    // Navigate to the custom protocol URL to send tokens to desktop
    window.location.href = callbackUrl

    // After a brief delay, show success (we can't detect if the protocol handler worked)
    setTimeout(() => {
      setStatus('success')
    }, 1000)
  }

  const handleLoginFirst = () => {
    // Remove the desktop_auth hash and reload so the normal Remix IDE loads
    // Store the state so we can use it after login
    const state = stateRef.current
    if (state) {
      sessionStorage.setItem('remix_desktop_auth_state', state)
    }
    // Navigate to remix without the desktop_auth hash - the user can sign in normally
    window.location.hash = ''
    window.location.reload()
  }

  return (
    <div className="preload-container" style={{ background: '#1a1a2e', minHeight: '100vh' }}>
      <div className="preload-logo pb-4" style={{ maxWidth: '500px', margin: '0 auto', textAlign: 'center' }}>
        <div style={{ width: '80px', margin: '0 auto 20px', fill: '#81A1C1' }}>
          {logo}
        </div>

        <h2 style={{ color: '#e0e0e0', marginBottom: '8px', fontSize: '1.5rem' }}>
          Remix Desktop Login
        </h2>

        {status === 'checking' && (
          <div style={{ color: '#999' }}>
            <i className="fas fa-spinner fa-spin fa-2x" style={{ marginBottom: '16px' }}></i>
            <p>Checking authentication status...</p>
          </div>
        )}

        {status === 'not_logged_in' && (
          <div>
            <p style={{ color: '#ccc', marginBottom: '24px', lineHeight: '1.6' }}>
              You need to sign in to Remix before authorizing the desktop app.
            </p>
            <p style={{ color: '#999', marginBottom: '24px', fontSize: '0.9rem' }}>
              Click below to open Remix IDE where you can sign in, then return to authorize the desktop app.
            </p>
            <button
              onClick={handleLoginFirst}
              style={{
                background: '#5B8AF0',
                color: 'white',
                border: 'none',
                padding: '12px 32px',
                borderRadius: '6px',
                fontSize: '1rem',
                cursor: 'pointer',
                fontWeight: 500,
              }}
            >
              Open Remix IDE to Sign In
            </button>
          </div>
        )}

        {status === 'ready' && (
          <div>
            <p style={{ color: '#ccc', marginBottom: '16px', lineHeight: '1.6' }}>
              Authorize <strong>Remix Desktop</strong> to use your account?
            </p>
            <div style={{
              background: '#2a2a4a',
              borderRadius: '8px',
              padding: '16px',
              marginBottom: '24px',
              border: '1px solid #3a3a5a'
            }}>
              <p style={{ color: '#e0e0e0', margin: 0, fontSize: '1.1rem' }}>
                Signed in as <strong>{userName}</strong>
              </p>
              <p style={{ color: '#999', margin: '8px 0 0', fontSize: '0.85rem' }}>
                This will share your authentication session with Remix Desktop.
              </p>
            </div>
            <button
              onClick={handleAuthorize}
              style={{
                background: '#4CAF50',
                color: 'white',
                border: 'none',
                padding: '12px 32px',
                borderRadius: '6px',
                fontSize: '1rem',
                cursor: 'pointer',
                fontWeight: 500,
                marginRight: '12px',
              }}
            >
              Authorize Desktop
            </button>
            <button
              onClick={() => window.close()}
              style={{
                background: 'transparent',
                color: '#999',
                border: '1px solid #555',
                padding: '12px 32px',
                borderRadius: '6px',
                fontSize: '1rem',
                cursor: 'pointer',
              }}
            >
              Cancel
            </button>
          </div>
        )}

        {status === 'sending' && (
          <div style={{ color: '#999' }}>
            <i className="fas fa-spinner fa-spin fa-2x" style={{ marginBottom: '16px' }}></i>
            <p>Sending credentials to Remix Desktop...</p>
          </div>
        )}

        {status === 'success' && (
          <div>
            <div style={{ color: '#4CAF50', marginBottom: '16px' }}>
              <i className="fas fa-check-circle fa-3x"></i>
            </div>
            <p style={{ color: '#ccc', marginBottom: '8px' }}>
              Authentication sent to Remix Desktop!
            </p>
            <p style={{ color: '#999', fontSize: '0.9rem' }}>
              You can close this tab and return to the desktop app.
            </p>
          </div>
        )}

        {status === 'error' && (
          <div>
            <div style={{ color: '#f44336', marginBottom: '16px' }}>
              <i className="fas fa-exclamation-circle fa-3x"></i>
            </div>
            <p style={{ color: '#f44336' }}>{error}</p>
          </div>
        )}
      </div>
    </div>
  )
}
