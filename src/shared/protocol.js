/** Message names shared by the background, the popup and the content script. */
export const MESSAGES = {
  GET_STATE: 'QVAULT_GET_STATE',
  SET_TOKEN: 'QVAULT_SET_TOKEN',
  PAIR: 'QVAULT_PAIR',
  UNLOCK: 'QVAULT_UNLOCK',
  LOCK: 'QVAULT_LOCK',
  DISCONNECT: 'QVAULT_DISCONNECT',
  LIST: 'QVAULT_LIST',
  MATCHES_FOR_HOST: 'QVAULT_MATCHES_FOR_HOST',
  SAVE: 'QVAULT_SAVE',
  CAPTURE_CREDENTIAL: 'QVAULT_CAPTURE_CREDENTIAL',
  TAKE_PENDING: 'QVAULT_TAKE_PENDING',
  CLEAR_PENDING: 'QVAULT_CLEAR_PENDING',
  FILL: 'QVAULT_FILL',
  PAGE_CONTEXT: 'QVAULT_PAGE_CONTEXT',
  SESSION_CHANGED: 'QVAULT_SESSION_CHANGED',
  OPEN_POPUP: 'QVAULT_OPEN_POPUP',
}

export const SESSION_TTL_MS = 5 * 60 * 1000
export const SERVERS = {
  production: 'https://qvault.hqmerchant.xyz',
  local: 'http://localhost:3000',
}
export const DEFAULT_SERVER = SERVERS.production
export const TOKEN_PATTERN = /^blx_[A-Za-z0-9_-]{40,64}$/
export const TOKEN_STORAGE_KEY = 'qvaultExtensionToken'
export const SERVER_STORAGE_KEY = 'qvaultExtensionServer'
export const LEGACY_TOKEN_STORAGE_KEY = 'bitlockExtensionToken'
export const SESSION_STORAGE_KEY = 'qvaultUnlockedSession'
