/**
 * SIWE (Sign-In with Ethereum) authentication
 * Handles wallet-based authentication and account linking
 */

import { AuthResult, SIWEMessageParams } from './types'
import { getAddress } from 'ethers'

/**
 * Get the Ethereum provider from window
 */
function getEthereumProvider(): any {
  const ethereum = (window as any).ethereum
  if (!ethereum) {
    throw new Error('No wallet detected. Please install MetaMask or another Web3 wallet.')
  }
  return ethereum
}

/**
 * Convert address to EIP-55 checksum format
 */
export function toChecksumAddress(address: string): string {
  try {
    return getAddress(address.toLowerCase())
  } catch (error) {
    console.warn('[SIWE] Failed to checksum address, using original:', error)
    return address
  }
}

/**
 * Request wallet accounts and return the checksummed address
 */
export async function requestWalletAddress(): Promise<string> {
  const ethereum = getEthereumProvider()
  
  console.log('[SIWE] Requesting wallet accounts...')
  const accounts = await ethereum.request({ method: 'eth_requestAccounts' })
  
  if (!accounts || accounts.length === 0) {
    throw new Error('No wallet accounts available')
  }

  const rawAddress = accounts[0].toLowerCase()
  const address = toChecksumAddress(rawAddress)
  console.log('[SIWE] Using checksummed address:', address)
  
  return address
}

/**
 * Get the current chain ID from the wallet
 */
export async function getChainId(): Promise<number> {
  const ethereum = getEthereumProvider()
  const chainId = await ethereum.request({ method: 'eth_chainId' })
  const chainIdNumber = parseInt(chainId, 16)
  console.log('[SIWE] Chain ID:', chainIdNumber)
  return chainIdNumber
}

/**
 * Fetch nonce from the SIWE backend
 */
export async function fetchNonce(ssoBaseUrl: string): Promise<string> {
  console.log('[SIWE] Fetching nonce from backend...')
  const response = await fetch(`${ssoBaseUrl}/siwe/nonce`, {
    credentials: 'include'
  })

  if (!response.ok) {
    throw new Error('Failed to fetch nonce from server')
  }

  const nonce = await response.text()
  console.log('[SIWE] Got nonce:', nonce.substring(0, 10) + '...')
  return nonce
}

/**
 * Create a SIWE message string
 */
export function createSIWEMessage(params: SIWEMessageParams): string {
  const { domain, address, statement, uri, version, chainId, nonce, issuedAt } = params
  
  return `${domain} wants you to sign in with your Ethereum account:
${address}

${statement}

URI: ${uri}
Version: ${version}
Chain ID: ${chainId}
Nonce: ${nonce}
Issued At: ${issuedAt}`
}

/**
 * Request a signature from the wallet
 */
export async function requestSignature(message: string, address: string): Promise<string> {
  const ethereum = getEthereumProvider()
  
  console.log('[SIWE] Requesting signature from wallet...')
  const signature = await ethereum.request({
    method: 'personal_sign',
    params: [message, address]
  })

  console.log('[SIWE] Got signature:', signature.substring(0, 20) + '...')
  return signature
}

/**
 * Verify SIWE signature with backend
 */
export async function verifySIWESignature(
  ssoBaseUrl: string,
  message: string,
  signature: string
): Promise<{ token: string; refresh_token?: string; user?: any }> {
  console.log('[SIWE] Verifying signature with backend...')
  
  const response = await fetch(`${ssoBaseUrl}/siwe/verify`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ message, signature })
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Verification failed' }))
    throw new Error(error.error || error.message || 'SIWE verification failed')
  }

  const result = await response.json()
  console.log('[SIWE] Verification successful!')
  console.log('[SIWE] Response has refresh_token:', !!result.refresh_token)
  console.log('[SIWE] Response has refreshToken:', !!result.refreshToken)
  
  // Normalize the refresh token field (backend might use either format)
  return {
    token: result.token,
    refresh_token: result.refresh_token || result.refreshToken,
    user: result.user
  }
}

/**
 * Link SIWE account to existing user
 */
export async function linkSIWEToAccount(
  ssoBaseUrl: string,
  accessToken: string,
  siweToken: string
): Promise<void> {
  console.log('[SIWE] Linking account...')
  
  const response = await fetch(`${ssoBaseUrl}/accounts/link/siwe`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`
    },
    body: JSON.stringify({ siweToken })
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Link failed' }))
    throw new Error(error.error || error.message || 'Failed to link SIWE account')
  }

  console.log('[SIWE] Account linked successfully!')
}

/**
 * Complete SIWE login flow
 */
export async function performSIWELogin(ssoBaseUrl: string): Promise<AuthResult> {
  // Get wallet info
  const address = await requestWalletAddress()
  const chainId = await getChainId()
  
  // Get nonce from backend
  const nonce = await fetchNonce(ssoBaseUrl)
  
  // Create SIWE message
  const message = createSIWEMessage({
    domain: window.location.host,
    address,
    statement: 'Sign in to Remix IDE with your Ethereum account',
    uri: window.location.origin,
    version: '1',
    chainId,
    nonce,
    issuedAt: new Date().toISOString()
  })

  console.log('[SIWE] Message to sign:', message)

  // Request signature
  const signature = await requestSignature(message, address)

  // Verify with backend
  const result = await verifySIWESignature(ssoBaseUrl, message, signature)

  return {
    user: result.user,
    accessToken: result.token,
    refreshToken: result.refresh_token
  }
}

/**
 * Complete SIWE account linking flow
 */
export async function performSIWEAccountLink(
  ssoBaseUrl: string,
  accessToken: string
): Promise<void> {
  // Get wallet info
  const address = await requestWalletAddress()
  const chainId = await getChainId()
  
  // Get nonce from backend
  const nonce = await fetchNonce(ssoBaseUrl)
  
  // Create SIWE message
  const message = createSIWEMessage({
    domain: window.location.host,
    address,
    statement: 'Link your Ethereum wallet to your Remix IDE account',
    uri: window.location.origin,
    version: '1',
    chainId,
    nonce,
    issuedAt: new Date().toISOString()
  })

  console.log('[SIWE Link] Message to sign:', message)

  // Request signature
  const signature = await requestSignature(message, address)

  // Verify signature first
  const verifyResult = await verifySIWESignature(ssoBaseUrl, message, signature)

  // Link to existing account
  await linkSIWEToAccount(ssoBaseUrl, accessToken, verifyResult.token)
}
