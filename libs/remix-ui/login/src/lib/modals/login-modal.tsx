import React, { useEffect, useState, useRef } from 'react'
import { AuthProvider } from '@remix-api'
import { useAuth } from '../../../../app/src/lib/remix-app/context/auth-context'
import { endpointUrls } from '@remix-endpoints-helper'
import './login-modal.css'

interface LoginModalProps {
  onClose: () => void
}

interface ProviderConfig {
  id: AuthProvider
  label: string
  icon: JSX.Element
  description: string
  enabled: boolean
}

/** Mask email for display: user@example.com → us***@example.com */
const maskEmail = (email: string): string => {
  const atIdx = email.indexOf('@')
  if (atIdx <= 0) return email
  const local = email.slice(0, atIdx)
  const domain = email.slice(atIdx)
  const visible = local.slice(0, Math.min(2, local.length))
  return `${visible}***${domain}`
}

/** Format seconds as m:ss */
const formatTimer = (seconds: number): string => {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

export const LoginModal: React.FC<LoginModalProps> = ({ onClose }) => {
  const { login, loading, error, dispatch } = useAuth()
  const [providers, setProviders] = useState<ProviderConfig[]>([])
  const [loadingProviders, setLoadingProviders] = useState(true)

  // Email OTP flow
  const [otpStep, setOtpStep] = useState<'idle' | 'code'>('idle')
  const [emailValue, setEmailValue] = useState('')
  const [otpDigits, setOtpDigits] = useState<string[]>(['', '', '', '', '', ''])
  const [emailSending, setEmailSending] = useState(false)
  const [otpVerifying, setOtpVerifying] = useState(false)
  const [emailError, setEmailError] = useState<string | null>(null)
  const [sendCooldown, setSendCooldown] = useState(0)
  const [codeExpiresIn, setCodeExpiresIn] = useState(0)
  const [attemptsRemaining, setAttemptsRemaining] = useState<number | null>(null)

  const otpInputRefs = useRef<(HTMLInputElement | null)[]>([])
  const emailInputRef = useRef<HTMLInputElement>(null)
  const verifyingRef = useRef(false)

  // Check for invite token in URL
  const inviteToken = new URLSearchParams(window.location.search).get('invite_token') || undefined

  // Is email provider enabled?
  const emailEnabled = providers.some(p => p.id === 'email' && p.enabled)

  // --- Countdown timers ---
  useEffect(() => {
    if (sendCooldown <= 0) return
    const timer = setTimeout(() => setSendCooldown(c => c - 1), 1000)
    return () => clearTimeout(timer)
  }, [sendCooldown])

  useEffect(() => {
    if (codeExpiresIn <= 0) return
    const timer = setTimeout(() => setCodeExpiresIn(c => c - 1), 1000)
    return () => clearTimeout(timer)
  }, [codeExpiresIn])

  // --- Fetch providers ---
  useEffect(() => {
    const fetchSupportedProviders = async () => {
      try {
        const baseUrl = endpointUrls.sso
        const response = await fetch(`${baseUrl}/providers`, {
          method: 'GET',
          headers: { 'Accept': 'application/json' }
        })

        if (!response.ok) throw new Error(`Failed to fetch providers: ${response.status}`)

        const data = await response.json()
        console.log('[LoginModal] Supported providers from backend:', data)

        const allProviders: ProviderConfig[] = [
          { id: 'google', label: 'Google', icon: <i className="fab fa-google"></i>, description: 'Sign in with your Google account', enabled: data.providers?.includes('google') ?? false },
          { id: 'github', label: 'GitHub', icon: <i className="fab fa-github"></i>, description: 'Sign in with your GitHub account', enabled: true },
          { id: 'discord', label: 'Discord', icon: <i className="fab fa-discord"></i>, description: 'Sign in with your Discord account', enabled: data.providers?.includes('discord') ?? false },
          { id: 'siwe', label: 'Connect Ethereum Wallet', icon: <i className="fab fa-ethereum"></i>, description: 'Sign in with MetaMask, Coinbase Wallet, or any Ethereum wallet', enabled: data.providers?.includes('siwe') ?? false },
          { id: 'email', label: 'Email', icon: <i className="fas fa-envelope"></i>, description: 'Sign in with your email address', enabled: data.providers?.includes('email') ?? false },
          { id: 'apple', label: 'Apple', icon: <i className="fab fa-apple"></i>, description: 'Sign in with your Apple ID', enabled: data.providers?.includes('apple') ?? false },
          { id: 'coinbase', label: 'Coinbase', icon: <i className="fas fa-coins"></i>, description: 'Sign in with your Coinbase account', enabled: data.providers?.includes('coinbase') ?? false },
        ]

        setProviders(allProviders.filter(p => p.enabled))
        setLoadingProviders(false)
      } catch (err) {
        console.error('[LoginModal] Failed to fetch providers:', err)
        setProviders([
          { id: 'google', label: 'Google', icon: <i className="fab fa-google"></i>, description: 'Sign in with your Google account', enabled: true },
          { id: 'github', label: 'GitHub', icon: <i className="fab fa-github"></i>, description: 'Sign in with your GitHub account', enabled: true },
          { id: 'discord', label: 'Discord', icon: <i className="fab fa-discord"></i>, description: 'Sign in with your Discord account', enabled: true },
          { id: 'siwe', label: 'Ethereum Wallet', icon: <i className="fab fa-ethereum"></i>, description: 'Sign in with MetaMask, Coinbase Wallet, or any Ethereum wallet', enabled: true },
          { id: 'email', label: 'Email', icon: <i className="fas fa-envelope"></i>, description: 'Sign in with your email address', enabled: true },
        ])
        setLoadingProviders(false)
      }
    }

    fetchSupportedProviders()
    return () => {
      dispatch({ type: 'CLEAR_ERROR' })
    }
  }, [dispatch])

  // --- OAuth login handler ---
  const handleLogin = async (provider: AuthProvider) => {
    try {
      await login(provider)
    } catch (err) {
      console.error('[LoginModal] Login failed:', err)
    }
  }

  // --- Send verification code ---
  const handleSendCode = async () => {
    const email = emailValue.trim()
    if (!email || emailSending || sendCooldown > 0) return

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email)) {
      setEmailError('Please enter a valid email address')
      return
    }

    setEmailSending(true)
    setEmailError(null)
    setAttemptsRemaining(null)

    try {
      const response = await fetch(`${endpointUrls.sso}/email/send-code`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({
          email,
          ...(inviteToken && { invite_token: inviteToken })
        })
      })

      const data = await response.json().catch(() => ({}))

      if (response.status === 429) {
        setSendCooldown(data.retry_after || 60)
        setEmailError('Please wait before requesting another code')
        return
      }

      if (!response.ok) {
        throw new Error(data.error || 'Failed to send verification code')
      }

      // Success — transition to OTP view
      setOtpStep('code')
      setCodeExpiresIn(data.expires_in || 600)
      setSendCooldown(60)
      setOtpDigits(['', '', '', '', '', ''])
      setEmailError(null)
      setTimeout(() => otpInputRefs.current[0]?.focus(), 100)
    } catch (err: any) {
      setEmailError(err.message || 'Failed to send verification code')
    } finally {
      setEmailSending(false)
    }
  }

  // --- Verify OTP code ---
  const handleVerifyCode = async (code?: string) => {
    if (verifyingRef.current) return
    const otpCode = code || otpDigits.join('')
    if (otpCode.length !== 6) return

    verifyingRef.current = true
    setOtpVerifying(true)
    setEmailError(null)

    try {
      const response = await fetch(`${endpointUrls.sso}/email/verify-code`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          email: emailValue.trim(),
          code: otpCode,
          ...(inviteToken && { invite_token: inviteToken })
        })
      })

      const data = await response.json().catch(() => ({}))

      if (response.status === 429) {
        setEmailError('Too many attempts. Please request a new code.')
        setOtpDigits(['', '', '', '', '', ''])
        setAttemptsRemaining(0)
        return
      }

      if (response.status === 403) {
        if (data.error === 'REGISTRATION_CLOSED') {
          setEmailError('Registration is currently closed. Only existing users can sign in.')
        } else if (data.error === 'ACCOUNT_BLOCKED') {
          setEmailError('Your account has been blocked.')
        } else {
          setEmailError(data.message || data.error || 'Access denied')
        }
        return
      }

      if (!response.ok) {
        if (data.attempts_remaining !== undefined) {
          setAttemptsRemaining(data.attempts_remaining)
        }
        if (data.error?.includes('expired') || data.error?.includes('No valid code')) {
          setEmailError('Code expired — please request a new one.')
          setCodeExpiresIn(0)
        } else {
          setEmailError(data.error || 'Invalid verification code')
        }
        setOtpDigits(['', '', '', '', '', ''])
        setTimeout(() => otpInputRefs.current[0]?.focus(), 100)
        return
      }

      // Success — store tokens and update auth state
      if (data.token && data.user) {
        localStorage.setItem('remix_access_token', data.token)
        if (data.refreshToken) {
          localStorage.setItem('remix_refresh_token', data.refreshToken)
        }
        localStorage.setItem('remix_user', JSON.stringify(data.user))

        dispatch({
          type: 'AUTH_SUCCESS',
          payload: { user: data.user, token: data.token }
        })
        console.log('[LoginModal] Email OTP login successful')
      } else {
        throw new Error('Invalid response from server')
      }
    } catch (err: any) {
      setEmailError(err.message || 'Verification failed')
    } finally {
      verifyingRef.current = false
      setOtpVerifying(false)
    }
  }

  // --- OTP digit input handlers ---
  const handleOtpDigitChange = (index: number, value: string) => {
    if (!/^\d*$/.test(value)) return

    const newDigits = [...otpDigits]
    newDigits[index] = value.slice(-1)
    setOtpDigits(newDigits)

    // Auto-advance to next input
    if (value && index < 5) {
      otpInputRefs.current[index + 1]?.focus()
    }

    // Auto-submit when all 6 digits filled
    const fullCode = newDigits.join('')
    if (fullCode.length === 6) {
      handleVerifyCode(fullCode)
    }
  }

  const handleOtpKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !otpDigits[index] && index > 0) {
      otpInputRefs.current[index - 1]?.focus()
    }
    if (e.key === 'Enter') {
      handleVerifyCode()
    }
  }

  const handleOtpPaste = (e: React.ClipboardEvent) => {
    e.preventDefault()
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6)
    if (!pasted) return

    const newDigits = Array(6).fill('').map((_, i) => pasted[i] || '')
    setOtpDigits(newDigits)

    const focusIdx = Math.min(pasted.length, 5)
    otpInputRefs.current[focusIdx]?.focus()

    if (pasted.length === 6) {
      handleVerifyCode(pasted)
    }
  }

  const handleResendCode = () => {
    if (sendCooldown > 0) return
    setOtpDigits(['', '', '', '', '', ''])
    setAttemptsRemaining(null)
    setEmailError(null)
    handleSendCode()
  }

  const handleBackToProviders = () => {
    setOtpStep('idle')
    setEmailValue('')
    setOtpDigits(['', '', '', '', '', ''])
    setEmailError(null)
    setAttemptsRemaining(null)
    setCodeExpiresIn(0)
    setSendCooldown(0)
    dispatch({ type: 'CLEAR_ERROR' })
  }

  const handleChangeEmail = () => {
    setOtpStep('idle')
    setOtpDigits(['', '', '', '', '', ''])
    setEmailError(null)
    setAttemptsRemaining(null)
    setCodeExpiresIn(0)
    setTimeout(() => emailInputRef.current?.focus(), 100)
  }

  // --- Providers excluding email (rendered as buttons) and SIWE (rendered separately) ---
  const oauthProviders = providers.filter(p => p.id !== 'siwe' && p.id !== 'email')
  const siweProvider = providers.find(p => p.id === 'siwe')

  return (
    <div
      className="modal d-flex align-items-center justify-content-center login-modal-backdrop"
      onClick={onClose}
    >
      <div
        className="modal-dialog modal-dialog-centered login-modal-dialog"
        role="document"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-content d-flex flex-row overflow-hidden login-modal-content">
          {/* Left Section - 40% width */}
          <div className="d-flex flex-column justify-content-center align-items-center position-relative login-modal-left-section">
            <div className="position-absolute top-0 start-0 end-0 bottom-0 login-modal-gradient-overlay" />
            <div className="text-start w-100 position-relative login-modal-content-wrapper">
              <ul className="list-unstyled p-0 m-0">
                <li className="mb-4 d-flex align-items-center">
                  <i className="fas fa-check-circle me-3 flex-shrink-0 login-modal-list-icon"></i>
                  <span className="login-modal-list-text">Save progress</span>
                </li>
                <li className="mb-4 d-flex align-items-center">
                  <i className="fas fa-check-circle me-3 flex-shrink-0 login-modal-list-icon"></i>
                  <span className="login-modal-list-text">Unlock additional features</span>
                </li>
                <li className="mb-4 d-flex align-items-center">
                  <i className="fas fa-check-circle me-3 flex-shrink-0 login-modal-list-icon"></i>
                  <span className="login-modal-list-text">Securely recover ETH address</span>
                </li>
              </ul>
            </div>
          </div>

          {/* Right Section - 60% width */}
          <div className="d-flex flex-column login-modal-right-section">
            <div className="modal-header border-0 flex-column align-items-start">
              <div className="d-flex w-100 align-items-center mb-2">
                {otpStep === 'code' ? (
                  <button
                    className="btn btn-link p-0 me-2 text-dark text-decoration-none"
                    onClick={handleBackToProviders}
                    title="Back to sign in options"
                  >
                    <i className="fas fa-arrow-left"></i>
                  </button>
                ) : null}
                <h5 className="modal-title mb-0">Remix IDE</h5>
                <div className="close ms-auto login-modal-close-btn fs-5" data-id="loginModal" onClick={onClose}>
                  <i className="fas fa-times text-dark"></i>
                </div>
              </div>
              <p className="text-muted mb-0 fs-small-medium">
                {otpStep === 'code'
                  ? 'Enter the verification code we sent to your email'
                  : 'Log in or register to unlock our wide range of features'
                }
              </p>
            </div>

            <div className="modal-body flex-grow-1">
              {loadingProviders ? (
                <div className="text-center py-5">
                  <div className="spinner-border text-primary" role="status">
                    <span className="visually-hidden">Loading providers...</span>
                  </div>
                  <p className="text-muted mt-3">Loading authentication methods...</p>
                </div>
              ) : providers.length === 0 ? (
                <div className="alert alert-warning" role="alert">
                  No authentication providers are currently available. Please try again later.
                </div>

              ) : otpStep === 'code' ? (
                /* ──────────────── OTP Verification View ──────────────── */
                <div className="d-flex flex-column align-items-center">
                  {/* Envelope icon */}
                  <div className="login-modal-otp-icon-wrap mb-3">
                    <i className="fas fa-envelope-open-text login-modal-otp-icon"></i>
                  </div>

                  <h6 className="fw-semibold mb-1">Check your email</h6>
                  <p className="text-muted fs-small-medium mb-4 text-center">
                    We sent a 6-digit code to <span className="fw-semibold text-dark">{maskEmail(emailValue)}</span>
                  </p>

                  {/* Error / status messages */}
                  {emailError && (
                    <div className="alert alert-danger py-2 px-3 fs-small-medium w-100 mb-3" role="alert">
                      {emailError}
                    </div>
                  )}

                  {attemptsRemaining !== null && attemptsRemaining > 0 && !emailError?.includes('expired') && (
                    <div className="text-warning fs-small mb-2">
                      {attemptsRemaining} attempt{attemptsRemaining !== 1 ? 's' : ''} remaining
                    </div>
                  )}

                  {/* 6-digit OTP inputs */}
                  <div className="d-flex gap-2 mb-3 login-modal-otp-group" onPaste={handleOtpPaste}>
                    {otpDigits.map((digit, i) => (
                      <input
                        key={i}
                        ref={(el) => { otpInputRefs.current[i] = el }}
                        type="text"
                        inputMode="numeric"
                        autoComplete="one-time-code"
                        className={`login-modal-otp-digit ${digit ? 'has-value' : ''}`}
                        maxLength={1}
                        value={digit}
                        onChange={(e) => handleOtpDigitChange(i, e.target.value)}
                        onKeyDown={(e) => handleOtpKeyDown(i, e)}
                        onFocus={(e) => e.target.select()}
                        autoFocus={i === 0}
                        disabled={otpVerifying}
                      />
                    ))}
                  </div>

                  {/* Code expiry timer */}
                  {codeExpiresIn > 0 && (
                    <p className={`fs-small mb-3 ${codeExpiresIn <= 60 ? 'text-warning' : 'text-muted'}`}>
                      <i className="fas fa-clock me-1"></i>
                      Code expires in {formatTimer(codeExpiresIn)}
                    </p>
                  )}
                  {codeExpiresIn === 0 && otpStep === 'code' && (
                    <p className="fs-small text-danger mb-3">
                      <i className="fas fa-exclamation-circle me-1"></i>
                      Code expired
                    </p>
                  )}

                  {/* Verify button (fallback for manual submit) */}
                  <button
                    className="btn btn-primary w-100 d-flex align-items-center justify-content-center py-2 mb-3"
                    onClick={() => handleVerifyCode()}
                    disabled={otpVerifying || otpDigits.join('').length !== 6}
                  >
                    {otpVerifying ? (
                      <>
                        <div className="spinner-border spinner-border-sm text-white me-2" role="status">
                          <span className="visually-hidden">Verifying...</span>
                        </div>
                        <span className="fw-medium fs-medium">Verifying...</span>
                      </>
                    ) : (
                      <span className="fw-medium fs-medium">Verify Code</span>
                    )}
                  </button>

                  {/* Resend / change email */}
                  <div className="d-flex flex-column align-items-center gap-2">
                    <p className="text-muted fs-small mb-0">
                      Didn't receive it?{' '}
                      {sendCooldown > 0 ? (
                        <span className="text-muted">Resend in {sendCooldown}s</span>
                      ) : (
                        <button
                          className="btn btn-link p-0 fs-small text-decoration-none fw-medium"
                          onClick={handleResendCode}
                          disabled={emailSending}
                        >
                          {emailSending ? 'Sending...' : 'Resend code'}
                        </button>
                      )}
                    </p>
                    <button
                      className="btn btn-link p-0 fs-small text-decoration-none text-muted"
                      onClick={handleChangeEmail}
                    >
                      Use a different email
                    </button>
                  </div>
                </div>

              ) : (
                /* ──────────────── Providers View ──────────────── */
                <div>
                  {error && (
                    <div className="alert alert-danger" role="alert">
                      <strong>Error:</strong> {error}
                    </div>
                  )}

                  {/* Ethereum Wallet — Primary CTA */}
                  {siweProvider && (
                    <button
                      className="btn btn-primary w-100 d-flex align-items-center justify-content-center py-2 mb-3"
                      onClick={() => handleLogin(siweProvider.id)}
                      disabled={loading || !siweProvider.enabled}
                    >
                      <span className="me-1 login-modal-provider-icon fs-medium">
                        {siweProvider.icon}
                      </span>
                      <span className="fw-medium fs-medium">{siweProvider.label}</span>
                      {loading && (
                        <div className="spinner-border spinner-border-sm text-white ms-2" role="status">
                          <span className="visually-hidden">Loading...</span>
                        </div>
                      )}
                    </button>
                  )}

                  {/* Divider */}
                  {oauthProviders.length > 0 && (
                    <div className="d-flex align-items-center my-4">
                      <hr className="flex-grow-1" />
                      <span className="px-3 text-muted">or</span>
                      <hr className="flex-grow-1" />
                    </div>
                  )}

                  {/* OAuth provider buttons */}
                  <div className="d-flex flex-column gap-2">
                    {oauthProviders.map((provider) => (
                      <button
                        key={provider.id}
                        className="btn btn-light border-0 w-100 d-flex align-items-center justify-content-center py-2 no-hover-effect"
                        onClick={() => handleLogin(provider.id)}
                        disabled={loading || !provider.enabled}
                      >
                        <span className="me-2 login-modal-provider-icon fs-medium">
                          {provider.icon}
                        </span>
                        <span className="fs-medium">Continue with {provider.label}</span>
                        {loading && (
                          <div className="spinner-border spinner-border-sm text-primary ms-2" role="status">
                            <span className="visually-hidden">Loading...</span>
                          </div>
                        )}
                      </button>
                    ))}
                  </div>

                  {/* ── Email OTP inline section ── */}
                  {emailEnabled && (
                    <>
                      <div className="d-flex align-items-center my-4">
                        <hr className="flex-grow-1" />
                        <span className="px-3 text-muted fs-small-medium">or continue with email</span>
                        <hr className="flex-grow-1" />
                      </div>

                      {emailError && (
                        <div className="alert alert-danger py-2 px-3 fs-small-medium mb-3" role="alert">
                          {emailError}
                        </div>
                      )}

                      <div className="login-modal-email-row">
                        <div className="login-modal-email-input-wrap">
                          <i className="fas fa-envelope login-modal-email-field-icon"></i>
                          <input
                            ref={emailInputRef}
                            type="email"
                            className="form-control login-modal-email-input"
                            placeholder="you@example.com"
                            value={emailValue}
                            onChange={(e) => { setEmailValue(e.target.value); setEmailError(null) }}
                            onKeyDown={(e) => e.key === 'Enter' && handleSendCode()}
                            disabled={emailSending}
                          />
                        </div>
                        <button
                          className="btn btn-primary login-modal-send-code-btn"
                          onClick={handleSendCode}
                          disabled={emailSending || !emailValue.trim() || sendCooldown > 0}
                        >
                          {emailSending ? (
                            <div className="spinner-border spinner-border-sm text-white" role="status">
                              <span className="visually-hidden">Sending...</span>
                            </div>
                          ) : sendCooldown > 0 ? (
                            <span className="fs-small">{sendCooldown}s</span>
                          ) : (
                            <>
                              Send Code <i className="fas fa-arrow-right ms-1"></i>
                            </>
                          )}
                        </button>
                      </div>

                      <p className="text-muted fs-small mt-2 mb-0 text-center">
                        <i className="fas fa-lock me-1"></i>
                        No password needed — we'll email you a one-time code
                      </p>
                    </>
                  )}
                </div>
              )}
            </div>

            {/* Terms and Conditions Bar */}
            <div className="login-modal-terms-bar">
              <p className="text-muted mb-0 fs-small">
                By continuing, you agree to our{' '}
                <a href="https://remix.live/termsandconditions" target="_blank" rel="noopener noreferrer">
                  Terms and Conditions
                </a>
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
