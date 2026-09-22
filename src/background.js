/**
 * QVault background vault engine.
 *
 * It owns the extension token, the 5-minute unlock session and the decrypted
 * items so both the popup and the in-page cards can use them. The master
 * password lives in chrome.storage.session (memory only, cleared when the
 * browser closes) for the duration of the session, never on disk.
 */

import {
  decryptEnvelope,
  encryptData,
  parseCredentialPayload,
  serializeEncryptedPayload,
  MASTER_VERIFIER_TEXT,
} from './shared/crypto.js'
import {
  MESSAGES,
  SESSION_TTL_MS,
  DEFAULT_SERVER,
  TOKEN_PATTERN,
  TOKEN_STORAGE_KEY,
  SERVER_STORAGE_KEY,
  LEGACY_TOKEN_STORAGE_KEY,
  SESSION_STORAGE_KEY,
} from './shared/protocol.js'

const PENDING_TTL_MS = 2 * 60 * 1000

let pendingCredential = null
let pendingTimer = null

let sessionPassword = null
let sessionExpiresAt = 0
let sessionTimer = null
let cachedItems = null

/* ---------------------------------------------------------------- helpers */

function hostnameFromUrl(value) {
  try {
    return new URL(value).hostname.replace(/^www\./, '').toLowerCase()
  } catch {
    return ''
  }
}

function sanitizeCredential(value) {
  if (!value || typeof value !== 'object') return null
  const username = String(value.username || '').slice(0, 512)
  const password = String(value.password || '').slice(0, 4096)
  const url = String(value.url || '').slice(0, 2048)
  const hostname = String(value.hostname || '').slice(0, 255)
  const label = String(value.label || hostname || 'Identifiant').slice(0, 200)
  if (!password || !/^https?:\/\//i.test(url)) return null
  return { username, password, url, hostname, label, createdAt: Date.now() }
}

async function getConfig() {
  const stored = await chrome.storage.local.get([TOKEN_STORAGE_KEY, SERVER_STORAGE_KEY])
  const token = typeof stored[TOKEN_STORAGE_KEY] === 'string' ? stored[TOKEN_STORAGE_KEY] : ''
  const apiUrl = stored[SERVER_STORAGE_KEY] === 'http://localhost:3000'
    ? 'http://localhost:3000'
    : DEFAULT_SERVER
  return { token, apiUrl }
}

function broadcastSessionChanged() {
  chrome.runtime.sendMessage({ type: MESSAGES.SESSION_CHANGED }).catch(() => {})
}

async function apiRequest(path, options = {}) {
  const { token, apiUrl } = await getConfig()
  if (!token) throw new Error('Extension non connectée.')
  const headers = new Headers(options.headers || {})
  headers.set('Authorization', `Bearer ${token}`)
  if (options.body) headers.set('Content-Type', 'application/json')

  let response
  try {
    response = await fetch(`${apiUrl}${path}`, { ...options, headers, cache: 'no-store' })
  } catch {
    throw new Error('QVault est inaccessible. Vérifiez le serveur sélectionné et votre connexion.')
  }

  const data = await response.json().catch(() => ({}))
  if (response.status === 401) {
    await chrome.storage.local.remove([TOKEN_STORAGE_KEY, LEGACY_TOKEN_STORAGE_KEY])
    await clearSession()
    broadcastSessionChanged()
    throw new Error(data.message || 'Jeton d’extension invalide ou expiré.')
  }
  if (!response.ok) throw new Error(data.message || `Erreur QVault (${response.status})`)
  return data
}

/* ---------------------------------------------------------------- session */

function scheduleSessionExpiry() {
  if (sessionTimer) clearTimeout(sessionTimer)
  const delay = Math.max(1000, sessionExpiresAt - Date.now())
  sessionTimer = setTimeout(() => { clearSession() }, delay)
}

async function persistSession() {
  await chrome.storage.session
    .set({ [SESSION_STORAGE_KEY]: { masterPassword: sessionPassword, expiresAt: sessionExpiresAt } })
    .catch(() => {})
}

async function restoreSession() {
  if (sessionPassword) return true
  const stored = await chrome.storage.session.get(SESSION_STORAGE_KEY).catch(() => ({}))
  const value = stored?.[SESSION_STORAGE_KEY]
  if (value && typeof value.masterPassword === 'string' && Number(value.expiresAt) > Date.now()) {
    sessionPassword = value.masterPassword
    sessionExpiresAt = Number(value.expiresAt)
    scheduleSessionExpiry()
    return true
  }
  return false
}

async function clearSession() {
  sessionPassword = null
  sessionExpiresAt = 0
  cachedItems = null
  if (sessionTimer) { clearTimeout(sessionTimer); sessionTimer = null }
  await chrome.storage.session.remove(SESSION_STORAGE_KEY).catch(() => {})
}

/** Extend the session on activity, or lock it when it has expired. */
async function touchSession() {
  if (!(await restoreSession())) return false
  if (Date.now() > sessionExpiresAt) {
    await clearSession()
    return false
  }
  sessionExpiresAt = Date.now() + SESSION_TTL_MS
  await persistSession()
  scheduleSessionExpiry()
  return true
}

/* ------------------------------------------------------------------ items */

async function ensureItems() {
  if (cachedItems) return cachedItems
  const data = await apiRequest('/api/extension/passwords')
  const raw = Array.isArray(data.items) ? data.items : []
  const decrypted = []
  for (const item of raw) {
    try {
      const plaintext = await decryptEnvelope(item.payload, item.iv, sessionPassword)
      const parsed = parseCredentialPayload(plaintext)
      decrypted.push({
        id: item.id,
        label: item.label,
        url: item.url,
        favorite: Boolean(item.favorite),
        updatedAt: item.updated_at,
        username: parsed.username,
        password: parsed.password,
      })
    } catch {
      // Corrupt or differently encrypted items stay hidden from autofill.
    }
  }
  cachedItems = decrypted
  return decrypted
}

function matchItems(items, hostname) {
  const target = String(hostname || '').replace(/^www\./, '').toLowerCase()
  if (!target) return []
  return items.filter((item) => {
    const itemHost = hostnameFromUrl(item.url)
    return itemHost && (itemHost === target || itemHost.endsWith(`.${target}`) || target.endsWith(`.${itemHost}`))
  })
}

async function verifyMasterPassword(masterPassword) {
  const state = await apiRequest('/api/extension/unlock')
  if (state?.configured && state.verifier) {
    const plaintext = await decryptEnvelope(state.verifier.payload, state.verifier.iv, masterPassword)
    if (plaintext !== MASTER_VERIFIER_TEXT) throw new Error('Mot de passe maître incorrect.')
    return true
  }
  if (state?.probe) {
    await decryptEnvelope(state.probe.payload, state.probe.iv, masterPassword)
    return true
  }
  throw new Error('Configurez d’abord le mot de passe maître dans QVault.')
}

/* ---------------------------------------------------------- pending capture */

function clearPendingCredential() {
  pendingCredential = null
  if (pendingTimer) clearTimeout(pendingTimer)
  pendingTimer = null
  chrome.action.setBadgeText({ text: '' }).catch(() => {})
}

function queuePendingCredential(value) {
  const credential = sanitizeCredential(value)
  if (!credential) return false
  pendingCredential = credential
  if (pendingTimer) clearTimeout(pendingTimer)
  pendingTimer = setTimeout(clearPendingCredential, PENDING_TTL_MS)
  chrome.action.setBadgeBackgroundColor({ color: '#2b7fff' }).catch(() => {})
  chrome.action.setBadgeText({ text: '1' }).catch(() => {})
  return true
}

/* ----------------------------------------------------------------- router */

async function handle(message) {
  switch (message.type) {
    case MESSAGES.GET_STATE: {
      const { token, apiUrl } = await getConfig()
      const unlocked = await restoreSession()
      return { connected: TOKEN_PATTERN.test(token), unlocked, apiUrl }
    }

    case MESSAGES.SET_TOKEN: {
      const token = String(message.token || '').trim()
      if (!TOKEN_PATTERN.test(token)) throw new Error('Jeton invalide.')
      const apiUrl = message.apiUrl === 'http://localhost:3000' ? 'http://localhost:3000' : DEFAULT_SERVER
      await chrome.storage.local.set({ [TOKEN_STORAGE_KEY]: token, [SERVER_STORAGE_KEY]: apiUrl })
      try {
        await apiRequest('/api/extension/passwords')
      } catch (error) {
        await chrome.storage.local.remove([TOKEN_STORAGE_KEY])
        throw error
      }
      return { ok: true }
    }

    case MESSAGES.PAIR: {
      const code = String(message.code || '').trim()
      if (!/^\d{6}$/.test(code)) throw new Error('Code d’appairage invalide.')
      const apiUrl = message.apiUrl === 'http://localhost:3000' ? 'http://localhost:3000' : DEFAULT_SERVER
      let response
      try {
        response = await fetch(`${apiUrl}/api/extension/pair`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code }),
          cache: 'no-store',
        })
      } catch {
        throw new Error('QVault est inaccessible. Vérifiez le serveur sélectionné.')
      }
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.message || 'Appairage impossible.')
      const token = String(data.token || '')
      if (!TOKEN_PATTERN.test(token)) throw new Error('Réponse d’appairage invalide.')
      await chrome.storage.local.set({ [TOKEN_STORAGE_KEY]: token, [SERVER_STORAGE_KEY]: apiUrl })
      return { ok: true }
    }

    case MESSAGES.UNLOCK: {
      const masterPassword = String(message.masterPassword || '')
      if (!masterPassword) throw new Error('Mot de passe maître requis.')
      await verifyMasterPassword(masterPassword)
      sessionPassword = masterPassword
      sessionExpiresAt = Date.now() + SESSION_TTL_MS
      cachedItems = null
      await persistSession()
      scheduleSessionExpiry()
      await ensureItems()
      broadcastSessionChanged()
      return { ok: true }
    }

    case MESSAGES.LOCK: {
      await clearSession()
      broadcastSessionChanged()
      return { ok: true }
    }

    case MESSAGES.DISCONNECT: {
      await clearSession()
      await chrome.storage.local.remove([TOKEN_STORAGE_KEY, LEGACY_TOKEN_STORAGE_KEY])
      clearPendingCredential()
      broadcastSessionChanged()
      return { ok: true }
    }

    case MESSAGES.LIST: {
      if (!(await touchSession())) return { locked: true, items: [] }
      const items = await ensureItems()
      return { locked: false, items }
    }

    case MESSAGES.MATCHES_FOR_HOST: {
      if (!(await touchSession())) return { locked: true, items: [] }
      const items = await ensureItems()
      return { locked: false, items: matchItems(items, message.hostname) }
    }

    case MESSAGES.SAVE: {
      if (!(await touchSession())) return { locked: true }
      const label = String(message.label || '').slice(0, 200)
      const url = String(message.url || '').slice(0, 2048)
      const username = String(message.username || '').slice(0, 512)
      const password = String(message.password || '')
      if (!label || !password) throw new Error('Nom du site et mot de passe requis.')

      const encrypted = await encryptData(JSON.stringify({
        schema: 'qvault.credentials/v1',
        username,
        password,
      }), sessionPassword)

      const body = JSON.stringify({
        label,
        url,
        username,
        payload: serializeEncryptedPayload(encrypted),
        iv: encrypted.iv,
      })

      if (typeof message.id === 'string' && message.id) {
        await apiRequest(`/api/extension/passwords/${encodeURIComponent(message.id)}`, { method: 'PUT', body })
      } else {
        await apiRequest('/api/extension/passwords', { method: 'POST', body })
      }

      cachedItems = null
      await ensureItems()
      broadcastSessionChanged()
      return { ok: true }
    }

    case MESSAGES.CAPTURE_CREDENTIAL: {
      const queued = queuePendingCredential(message.credential)
      if (queued) {
        chrome.action.openPopup().catch(() => {})
      }
      return { ok: queued }
    }

    case MESSAGES.TAKE_PENDING: {
      const credential = pendingCredential
      clearPendingCredential()
      return { credential }
    }

    case MESSAGES.CLEAR_PENDING: {
      clearPendingCredential()
      return { ok: true }
    }

    case MESSAGES.OPEN_POPUP: {
      await chrome.action.openPopup().catch(() => {})
      return { ok: true }
    }

    default:
      return { ok: false, error: 'Type de message inconnu.' }
  }
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message || typeof message.type !== 'string') return undefined
  handle(message)
    .then(sendResponse)
    .catch((error) => sendResponse({ ok: false, error: String(error?.message || error) }))
  return true
})

chrome.runtime.onInstalled.addListener(() => {
  clearPendingCredential()
  clearSession()
})
