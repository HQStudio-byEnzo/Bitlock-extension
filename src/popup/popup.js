const SERVERS = {
  production: 'https://qvault.hqmerchant.xyz',
  local: 'http://localhost:3000',
}
const DEFAULT_SERVER = SERVERS.production
// Frozen crypto marker: existing master verifiers were encrypted with this
// exact string, so it must never change.
const MASTER_VERIFIER_TEXT = 'bitlock://master-verifier/v1'
const LEGACY_PBKDF2_ITERATIONS = 100000
const PBKDF2_ITERATIONS = 600000
const ENCRYPTED_PAYLOAD_VERSION = 'v2'
const TOKEN_PATTERN = /^blx_[A-Za-z0-9_-]{40,64}$/
const TOKEN_STORAGE_KEY = 'qvaultExtensionToken'
const SERVER_STORAGE_KEY = 'qvaultExtensionServer'
const LEGACY_TOKEN_STORAGE_KEY = 'bitlockExtensionToken'

const elements = {
  connectView: document.getElementById('connect-view'),
  unlockView: document.getElementById('unlock-view'),
  vaultView: document.getElementById('vault-view'),
  addView: document.getElementById('add-view'),
  serverSelect: document.getElementById('server-select'),
  connectForm: document.getElementById('connect-form'),
  connectButton: document.getElementById('connect-btn'),
  tokenInput: document.getElementById('token-input'),
  pairCodeInput: document.getElementById('pair-code-input'),
  connectTokenButton: document.getElementById('connect-token-btn'),
  toggleTokenButton: document.getElementById('toggle-token-btn'),
  unlockForm: document.getElementById('unlock-form'),
  unlockButton: document.getElementById('unlock-submit-btn'),
  masterPasswordInput: document.getElementById('master-password-input'),
  lockButton: document.getElementById('lock-btn'),
  disconnectButton: document.getElementById('disconnect-btn'),
  openAddButton: document.getElementById('open-add-btn'),
  closeAddButton: document.getElementById('close-add-btn'),
  addForm: document.getElementById('add-form'),
  addSignal: document.getElementById('add-signal'),
  addTitle: document.getElementById('add-title'),
  addLabel: document.getElementById('add-label'),
  addUrl: document.getElementById('add-url'),
  addUsername: document.getElementById('add-username'),
  addPassword: document.getElementById('add-password'),
  generatePasswordButton: document.getElementById('generate-password-btn'),
  saveButton: document.getElementById('save-btn'),
  searchInput: document.getElementById('search-input'),
  siteSection: document.getElementById('site-section'),
  siteList: document.getElementById('site-list'),
  siteCount: document.getElementById('site-count'),
  allList: document.getElementById('all-list'),
  allCount: document.getElementById('all-count'),
  status: document.getElementById('status'),
  settingsLink: document.getElementById('settings-link'),
  brandLink: document.getElementById('brand-link'),
}

const state = {
  token: '',
  apiUrl: DEFAULT_SERVER,
  rawItems: [],
  items: [],
  masterPassword: '',
  activeTab: null,
  pageContext: null,
  statusTimer: null,
}

document.addEventListener('DOMContentLoaded', initialize)

elements.connectForm.addEventListener('submit', pairExtension)
elements.connectTokenButton.addEventListener('click', connectExtension)
elements.serverSelect.addEventListener('change', () => setServer(elements.serverSelect.value))
elements.unlockForm.addEventListener('submit', unlockVault)
elements.addForm.addEventListener('submit', saveCredential)
elements.lockButton.addEventListener('click', lockVault)
elements.disconnectButton.addEventListener('click', disconnectExtension)
elements.openAddButton.addEventListener('click', () => openAddView())
elements.closeAddButton.addEventListener('click', closeAddView)
elements.generatePasswordButton.addEventListener('click', generateIntoPasswordField)
elements.searchInput.addEventListener('input', renderCredentials)
elements.toggleTokenButton.addEventListener('click', toggleTokenVisibility)

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && !elements.addView.classList.contains('hidden')) {
    closeAddView()
  }
})

async function initialize() {
  await readActivePage()
  const stored = await chrome.storage.local.get([
    TOKEN_STORAGE_KEY,
    SERVER_STORAGE_KEY,
    LEGACY_TOKEN_STORAGE_KEY,
  ])
  setServer(stored[SERVER_STORAGE_KEY])

  let token = typeof stored[TOKEN_STORAGE_KEY] === 'string' ? stored[TOKEN_STORAGE_KEY] : ''
  if (!TOKEN_PATTERN.test(token) && typeof stored[LEGACY_TOKEN_STORAGE_KEY] === 'string') {
    token = stored[LEGACY_TOKEN_STORAGE_KEY]
    if (TOKEN_PATTERN.test(token)) await chrome.storage.local.set({ [TOKEN_STORAGE_KEY]: token })
  }
  await chrome.storage.local.remove([LEGACY_TOKEN_STORAGE_KEY])

  if (!TOKEN_PATTERN.test(token)) {
    showView('connect')
    return
  }

  state.token = token
  try {
    await refreshEncryptedItems()
    showView('unlock')
  } catch (error) {
    await chrome.storage.local.remove([TOKEN_STORAGE_KEY])
    state.token = ''
    showView('connect')
    showStatus(messageFromError(error, 'Le jeton enregistré n’est plus valide.'), 'error')
  }
}

function setServer(value) {
  state.apiUrl = value === SERVERS.local ? SERVERS.local : DEFAULT_SERVER
  elements.serverSelect.value = state.apiUrl
  elements.brandLink.href = `${state.apiUrl}/`
  elements.settingsLink.href = `${state.apiUrl}/dashboard/settings`
}

async function apiRequest(path, options = {}) {
  const headers = new Headers(options.headers || {})
  if (state.token) headers.set('Authorization', `Bearer ${state.token}`)
  if (options.body) headers.set('Content-Type', 'application/json')

  let response
  try {
    response = await fetch(`${state.apiUrl}${path}`, {
      ...options,
      headers,
      cache: 'no-store',
    })
  } catch {
    throw new Error('QVault est inaccessible. Vérifiez le serveur sélectionné et votre connexion.')
  }

  const data = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(data.message || `Erreur QVault (${response.status})`)
  }
  return data
}

async function pairExtension(event) {
  event.preventDefault()
  clearFieldError(elements.pairCodeInput)
  const code = elements.pairCodeInput.value.trim()

  if (!/^\d{6}$/.test(code)) {
    setFieldError(elements.pairCodeInput)
    showStatus('Saisissez le code à 6 chiffres affiché dans QVault.', 'error')
    return
  }

  setServer(elements.serverSelect.value)
  setLoading(elements.connectButton, true)
  state.token = ''
  try {
    const data = await apiRequest('/api/extension/pair', {
      method: 'POST',
      body: JSON.stringify({ code }),
    })
    const token = typeof data.token === 'string' ? data.token : ''
    if (!TOKEN_PATTERN.test(token)) throw new Error('Réponse d’appairage invalide.')

    state.token = token
    await refreshEncryptedItems()
    await chrome.storage.local.set({
      [TOKEN_STORAGE_KEY]: token,
      [SERVER_STORAGE_KEY]: state.apiUrl,
    })
    elements.pairCodeInput.value = ''
    showView('unlock')
    showStatus('Extension associée.', 'success')
  } catch (error) {
    state.token = ''
    setFieldError(elements.pairCodeInput)
    showStatus(messageFromError(error, 'Appairage impossible.'), 'error')
  } finally {
    setLoading(elements.connectButton, false)
  }
}

async function connectExtension(event) {
  event.preventDefault()
  clearFieldError(elements.tokenInput)
  const token = elements.tokenInput.value.trim()

  if (!TOKEN_PATTERN.test(token)) {
    setFieldError(elements.tokenInput)
    showStatus('Ce jeton QVault est invalide.', 'error')
    return
  }

  setServer(elements.serverSelect.value)
  setLoading(elements.connectButton, true)
  state.token = token
  try {
    await refreshEncryptedItems()
    await chrome.storage.local.set({
      [TOKEN_STORAGE_KEY]: token,
      [SERVER_STORAGE_KEY]: state.apiUrl,
    })
    elements.tokenInput.value = ''
    showView('unlock')
    showStatus('Extension connectée.', 'success')
  } catch (error) {
    state.token = ''
    setFieldError(elements.tokenInput)
    showStatus(messageFromError(error, 'Connexion impossible.'), 'error')
  } finally {
    setLoading(elements.connectButton, false)
  }
}

async function unlockVault(event) {
  event.preventDefault()
  clearFieldError(elements.masterPasswordInput)
  const masterPassword = elements.masterPasswordInput.value

  if (!masterPassword) {
    setFieldError(elements.masterPasswordInput)
    showStatus('Saisissez votre mot de passe maître.', 'error')
    return
  }

  setLoading(elements.unlockButton, true)
  try {
    const unlockState = await apiRequest('/api/extension/unlock')
    await verifyMasterPassword(unlockState, masterPassword)

    const decrypted = []
    let invalidCount = 0
    for (const item of state.rawItems) {
      try {
        const plaintext = await decryptEnvelope(item.payload, item.iv, masterPassword)
        decrypted.push({
          ...item,
          ...parseCredentialPayload(plaintext),
        })
      } catch {
        invalidCount += 1
      }
    }

    state.masterPassword = masterPassword
    state.items = decrypted
    elements.masterPasswordInput.value = ''
    showView('vault')
    renderCredentials()
    await consumePendingCredential()

    if (invalidCount) {
      showStatus(`${invalidCount} élément(s) n’ont pas pu être déchiffrés.`, 'error')
    } else {
      showStatus('Coffre déverrouillé.', 'success')
    }
  } catch (error) {
    state.masterPassword = ''
    state.items = []
    setFieldError(elements.masterPasswordInput)
    showStatus(messageFromError(error, 'Mot de passe maître incorrect.'), 'error')
  } finally {
    setLoading(elements.unlockButton, false)
  }
}

async function verifyMasterPassword(unlockState, masterPassword) {
  if (unlockState?.configured && unlockState.verifier) {
    const plaintext = await decryptEnvelope(
      unlockState.verifier.payload,
      unlockState.verifier.iv,
      masterPassword,
    )
    if (plaintext !== MASTER_VERIFIER_TEXT) throw new Error('Mot de passe maître incorrect.')
    return
  }

  if (unlockState?.probe) {
    await decryptEnvelope(unlockState.probe.payload, unlockState.probe.iv, masterPassword)
    return
  }

  throw new Error('Configurez d’abord le mot de passe maître dans QVault.')
}

async function refreshEncryptedItems() {
  const data = await apiRequest('/api/extension/passwords')
  state.rawItems = Array.isArray(data.items) ? data.items : []
}

function lockVault() {
  state.masterPassword = ''
  state.items = []
  elements.searchInput.value = ''
  showView('unlock')
  showStatus('Coffre verrouillé.', 'success')
}

async function disconnectExtension() {
  state.token = ''
  state.masterPassword = ''
  state.rawItems = []
  state.items = []
  await chrome.storage.local.remove([TOKEN_STORAGE_KEY, LEGACY_TOKEN_STORAGE_KEY])
  await chrome.runtime.sendMessage({ type: 'QVAULT_CLEAR_PENDING' }).catch(() => {})
  showView('connect')
  showStatus('Extension déconnectée.', 'success')
}

function showView(name) {
  const map = {
    connect: elements.connectView,
    unlock: elements.unlockView,
    vault: elements.vaultView,
    add: elements.addView,
  }
  Object.values(map).forEach(view => view.classList.add('hidden'))
  map[name].classList.remove('hidden')

  const connected = name !== 'connect'
  const unlocked = name === 'vault' || name === 'add'
  elements.disconnectButton.classList.toggle('hidden', !connected)
  elements.lockButton.classList.toggle('hidden', !unlocked)
}

async function readActivePage() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
    state.activeTab = tab || null
    if (!tab?.id || !/^https?:/i.test(tab.url || '')) return

    try {
      state.pageContext = await chrome.tabs.sendMessage(tab.id, {
        type: 'QVAULT_PAGE_CONTEXT',
      })
    } catch {
      const url = new URL(tab.url)
      state.pageContext = {
        hostname: url.hostname.replace(/^www\./, ''),
        url: tab.url,
        hasPasswordField: false,
      }
    }
  } catch {
    state.activeTab = null
    state.pageContext = null
  }
}

function renderCredentials() {
  const query = elements.searchInput.value.trim().toLowerCase()
  const filtered = state.items.filter((item) => {
    if (!query) return true
    return [item.label, item.username, hostnameFromUrl(item.url)]
      .some(value => String(value || '').toLowerCase().includes(query))
  })

  const siteItems = filtered.filter(item => domainsMatch(
    hostnameFromUrl(item.url),
    state.pageContext?.hostname || '',
  ))

  elements.siteSection.classList.toggle('hidden', siteItems.length === 0)
  elements.siteCount.textContent = String(siteItems.length)
  elements.allCount.textContent = String(filtered.length)
  renderCredentialList(elements.siteList, siteItems, true)
  renderCredentialList(elements.allList, filtered, false)
}

function renderCredentialList(target, items, emphasizeFill) {
  target.replaceChildren()
  if (!items.length) {
    const empty = document.createElement('p')
    empty.className = 'empty'
    empty.textContent = elements.searchInput.value
      ? 'Aucun résultat.'
      : 'Aucun identifiant enregistré.'
    target.appendChild(empty)
    return
  }

  items.forEach(item => {
    const row = document.createElement('article')
    row.className = 'credential'

    const copy = document.createElement('div')
    copy.className = 'credential__copy'
    const label = document.createElement('strong')
    label.textContent = item.label || hostnameFromUrl(item.url) || 'Sans titre'
    const account = document.createElement('small')
    account.textContent = item.username || 'Compte sans identifiant'
    copy.append(label, account)

    const actions = document.createElement('div')
    actions.className = 'credential__actions'

    const copyButton = document.createElement('button')
    copyButton.type = 'button'
    copyButton.className = 'button'
    copyButton.textContent = 'Copier'
    copyButton.addEventListener('click', () => copyPassword(item, copyButton))

    const fillButton = document.createElement('button')
    fillButton.type = 'button'
    fillButton.className = `button${emphasizeFill ? ' button--primary' : ''}`
    fillButton.textContent = 'Remplir'
    fillButton.disabled = !state.pageContext?.hasPasswordField
    fillButton.title = fillButton.disabled
      ? 'Aucun champ de mot de passe détecté sur cette page'
      : 'Remplir cette page'
    fillButton.addEventListener('click', () => fillCredential(item, fillButton))

    actions.append(copyButton, fillButton)
    row.append(copy, actions)
    target.appendChild(row)
  })
}

async function fillCredential(item, button) {
  if (!state.activeTab?.id) {
    showStatus('Aucun onglet compatible.', 'error')
    return
  }

  setLoading(button, true)
  try {
    const response = await chrome.tabs.sendMessage(state.activeTab.id, {
      type: 'QVAULT_FILL',
      credential: {
        username: item.username,
        password: item.password,
      },
    })
    if (!response?.ok) throw new Error('Aucun formulaire compatible sur cette page.')
    setTransientState(button, 'success', 'Rempli')
    showStatus('Identifiant rempli.', 'success')
  } catch (error) {
    setTransientState(button, 'error', 'Échec')
    showStatus(messageFromError(error, 'Remplissage impossible.'), 'error')
  } finally {
    setLoading(button, false)
  }
}

async function copyPassword(item, button) {
  try {
    await navigator.clipboard.writeText(item.password)
    setTransientState(button, 'success', 'Copié')
    showStatus('Mot de passe copié. Pensez à vider le presse-papiers.', 'success')
  } catch {
    setTransientState(button, 'error', 'Échec')
    showStatus('Copie impossible.', 'error')
  }
}

async function consumePendingCredential() {
  const response = await chrome.runtime.sendMessage({ type: 'QVAULT_TAKE_PENDING' })
    .catch(() => null)
  if (response?.credential) openAddView(response.credential)
}

function openAddView(credential = null) {
  if (!state.masterPassword) {
    showView('unlock')
    return
  }

  elements.addForm.reset()
  elements.addSignal.textContent = credential ? 'identifiant détecté' : 'nouvel identifiant'
  elements.addTitle.textContent = credential ? 'Vérifier puis enregistrer' : 'Ajouter au coffre'
  elements.addLabel.value = credential?.label || state.pageContext?.hostname || ''
  elements.addUrl.value = credential?.url || state.pageContext?.url || ''
  elements.addUsername.value = credential?.username || ''
  elements.addPassword.value = credential?.password || ''
  showView('add')
  elements.addLabel.focus()
}

function closeAddView() {
  elements.addForm.reset()
  showView('vault')
}

async function saveCredential(event) {
  event.preventDefault()
  clearAddFieldErrors()

  const label = elements.addLabel.value.trim()
  const username = elements.addUsername.value.trim()
  const password = elements.addPassword.value
  let url

  try {
    url = new URL(elements.addUrl.value.trim())
    if (!['http:', 'https:'].includes(url.protocol)) throw new Error('protocol')
  } catch {
    setFieldError(elements.addUrl)
    showStatus('Utilisez une adresse http:// ou https:// valide.', 'error')
    return
  }

  if (!label || !password) {
    if (!label) setFieldError(elements.addLabel)
    if (!password) setFieldError(elements.addPassword)
    showStatus('Le nom du site et le mot de passe sont requis.', 'error')
    return
  }

  setLoading(elements.saveButton, true)
  try {
    const plaintext = JSON.stringify({
      schema: 'qvault.credentials/v1',
      username,
      password,
    })
    const encrypted = await encryptData(plaintext, state.masterPassword)

    await apiRequest('/api/extension/passwords', {
      method: 'POST',
      body: JSON.stringify({
        label,
        url: url.toString(),
        payload: serializeEncryptedPayload(encrypted),
        iv: encrypted.iv,
      }),
    })

    await refreshEncryptedItems()
    await rebuildDecryptedItems()
    showView('vault')
    renderCredentials()
    showStatus('Identifiant chiffré et enregistré.', 'success')
  } catch (error) {
    showStatus(messageFromError(error, 'Enregistrement impossible.'), 'error')
  } finally {
    setLoading(elements.saveButton, false)
  }
}

async function rebuildDecryptedItems() {
  const next = []
  for (const item of state.rawItems) {
    try {
      const plaintext = await decryptEnvelope(item.payload, item.iv, state.masterPassword)
      next.push({ ...item, ...parseCredentialPayload(plaintext) })
    } catch {
      // Corrupt or differently encrypted items remain hidden from autofill.
    }
  }
  state.items = next
}

function parseCredentialPayload(plaintext) {
  try {
    const parsed = JSON.parse(plaintext)
    if (parsed && typeof parsed.password === 'string') {
      return {
        username: typeof parsed.username === 'string' ? parsed.username : '',
        password: parsed.password,
      }
    }
  } catch {
    // Fall through to the legacy payload parser.
  }

  const separator = plaintext.indexOf(':')
  if (separator > 0) {
    return {
      username: plaintext.slice(0, separator),
      password: plaintext.slice(separator + 1),
    }
  }
  return { username: '', password: plaintext }
}

async function encryptData(plaintext, masterPassword) {
  const encoder = new TextEncoder()
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const key = await deriveKey(masterPassword, salt, ['encrypt'])
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    encoder.encode(plaintext),
  )

  return {
    salt: bytesToBase64(salt),
    iv: bytesToBase64(iv),
    ciphertext: bytesToBase64(new Uint8Array(encrypted)),
  }
}

function serializeEncryptedPayload(value) {
  return `${ENCRYPTED_PAYLOAD_VERSION}:${PBKDF2_ITERATIONS}:${value.salt}:${value.ciphertext}`
}

function parseEncryptedPayload(payload) {
  const parts = payload.split(':')
  if (parts.length === 2 && parts[0] && parts[1]) {
    return { salt: parts[0], ciphertext: parts[1], iterations: LEGACY_PBKDF2_ITERATIONS }
  }
  if (
    parts.length === 4
    && parts[0] === ENCRYPTED_PAYLOAD_VERSION
    && Number(parts[1]) === PBKDF2_ITERATIONS
    && parts[2]
    && parts[3]
  ) {
    return { salt: parts[2], ciphertext: parts[3], iterations: PBKDF2_ITERATIONS }
  }
  throw new Error('Élément chiffré invalide.')
}

async function decryptEnvelope(payload, ivBase64, masterPassword) {
  if (typeof payload !== 'string' || typeof ivBase64 !== 'string') {
    throw new Error('Élément chiffré invalide.')
  }
  const envelope = parseEncryptedPayload(payload)
  const salt = base64ToBytes(envelope.salt)
  const ciphertext = base64ToBytes(envelope.ciphertext)
  const iv = base64ToBytes(ivBase64)
  const key = await deriveKey(masterPassword, salt, ['decrypt'], envelope.iterations)
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    ciphertext,
  )
  return new TextDecoder().decode(decrypted)
}

async function deriveKey(masterPassword, salt, usages, iterations = PBKDF2_ITERATIONS) {
  const material = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(masterPassword),
    'PBKDF2',
    false,
    ['deriveKey'],
  )
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt,
      iterations,
      hash: 'SHA-256',
    },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    usages,
  )
}

function base64ToBytes(value) {
  const binary = atob(value)
  return Uint8Array.from(binary, char => char.charCodeAt(0))
}

function bytesToBase64(value) {
  let binary = ''
  const chunkSize = 0x8000
  for (let offset = 0; offset < value.length; offset += chunkSize) {
    binary += String.fromCharCode(...value.subarray(offset, offset + chunkSize))
  }
  return btoa(binary)
}

function generateIntoPasswordField() {
  const password = generatePassword(22)
  elements.addPassword.value = password
  elements.addPassword.type = 'text'
  window.setTimeout(() => {
    elements.addPassword.type = 'password'
  }, 4000)
  elements.addPassword.dispatchEvent(new Event('input', { bubbles: true }))
  showStatus('Mot de passe fort généré.', 'success')
}

function generatePassword(length) {
  const groups = [
    'ABCDEFGHJKLMNPQRSTUVWXYZ',
    'abcdefghijkmnopqrstuvwxyz',
    '23456789',
    '!@#$%&*+-=?',
  ]
  const all = groups.join('')
  const bytes = crypto.getRandomValues(new Uint32Array(length))
  const chars = groups.map((group, index) => group[bytes[index] % group.length])
  for (let index = groups.length; index < length; index += 1) {
    chars.push(all[bytes[index] % all.length])
  }

  for (let index = chars.length - 1; index > 0; index -= 1) {
    const swapIndex = bytes[index] % (index + 1)
    ;[chars[index], chars[swapIndex]] = [chars[swapIndex], chars[index]]
  }
  return chars.join('')
}

function hostnameFromUrl(value) {
  try {
    return new URL(value).hostname.replace(/^www\./, '').toLowerCase()
  } catch {
    return ''
  }
}

function domainsMatch(left, right) {
  if (!left || !right) return false
  const a = left.replace(/^www\./, '').toLowerCase()
  const b = right.replace(/^www\./, '').toLowerCase()
  return a === b || a.endsWith(`.${b}`) || b.endsWith(`.${a}`)
}

function toggleTokenVisibility() {
  const visible = elements.tokenInput.type === 'text'
  elements.tokenInput.type = visible ? 'password' : 'text'
  elements.toggleTokenButton.textContent = visible ? 'Voir' : 'Masquer'
  elements.toggleTokenButton.setAttribute(
    'aria-label',
    visible ? 'Afficher le jeton' : 'Masquer le jeton',
  )
}

function setLoading(button, loading) {
  button.disabled = loading
  if (loading) button.dataset.state = 'loading'
  else if (button.dataset.state === 'loading') delete button.dataset.state
}

function setTransientState(button, stateName, text) {
  const original = button.textContent
  button.dataset.state = stateName
  button.textContent = text
  window.setTimeout(() => {
    if (button.dataset.state === stateName) delete button.dataset.state
    button.textContent = original
  }, 1400)
}

function setFieldError(input) {
  input.setAttribute('aria-invalid', 'true')
  input.focus()
}

function clearFieldError(input) {
  input.removeAttribute('aria-invalid')
}

function clearAddFieldErrors() {
  [
    elements.addLabel,
    elements.addUrl,
    elements.addUsername,
    elements.addPassword,
  ].forEach(clearFieldError)
}

function showStatus(message, stateName = 'success') {
  if (state.statusTimer) window.clearTimeout(state.statusTimer)
  elements.status.textContent = message
  elements.status.dataset.state = stateName
  elements.status.classList.remove('hidden')
  state.statusTimer = window.setTimeout(() => {
    elements.status.classList.add('hidden')
    delete elements.status.dataset.state
  }, stateName === 'error' ? 6000 : 3200)
}

function messageFromError(error, fallback) {
  return error instanceof Error && error.message ? error.message : fallback
}
