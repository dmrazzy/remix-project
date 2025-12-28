/**
 * Auth module exports
 */

// Types
export * from './types'

// Token management
export {
  getTokenExpiryMs,
  isTokenExpired,
  tokenStorage,
  createRefreshScheduler
} from './token-manager'

// OAuth popup
export {
  openAuthPopup,
  waitForPopupResult,
  performPopupLogin,
  performPopupAccountLink
} from './oauth-popup'

// SIWE authentication
export {
  toChecksumAddress,
  requestWalletAddress,
  getChainId,
  fetchNonce,
  createSIWEMessage,
  requestSignature,
  verifySIWESignature,
  linkSIWEToAccount,
  performSIWELogin,
  performSIWEAccountLink
} from './siwe-auth'
