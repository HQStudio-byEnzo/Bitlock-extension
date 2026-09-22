import { MESSAGES, DEFAULT_SERVER, SERVERS } from '../shared/protocol.js'
import { generatePassword } from '../shared/crypto.js'
import { icon } from '../shared/icons.js'

const elements = {
  connectView: document.getElementById('connect-view'),
  unlockView: document.getElementById('unlock-view'),
  vaultView: document.getElementById('vault-view'),
  addView: document.getElementById('add-view'),
  serverSelect: document.getElementById('server-select'),
  serverLabel: document.getElementById('server-label'),
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
  brandLink: document.getElementById('brand-link'),
  settingsLink: document.getElementById('settings-link'),
}

const state = {
  connected: false,
  unlocked: false,
  items: [],
  activeTab: null,
  pageContext: null,
  statusTimer: null,
}

document.addEventListener('DOMContentLoaded', initialize)

elements.connectForm.addEventListener('submit', pairExtension)
elements.connectTokenButton.addEventListener('click', connectWithToken)
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
  if (event.key === 'Escape' && !elements.addView.classList.contains('hidden')) closeAddView()
})

chrome.runtime.onMessage.addListener((message) => {
  if (message?.type === MESSAGES.SESSION_CHANGED) refreshState()
})

/* ---------------------------------------------------------------- helpers */

async function send(message) {
  const response = await chrome.runtime.sendMessage(message).catch(() => null)
  if (response && response.ok === false) throw new Error(response.error || 'Erreur QVault.')
  return response
}

function setServer(value) {
  const apiUrl = value === SERVERS.local ? SERVERS.local : DEFAULT_SERVER
  elements.serverSelect.value = apiUrl
  elements.brandLink.href = `${apiUrl}/`
  elements.settingsLink.href = `${apiUrl}/dashboard/settings`
  elements.serverLabel.textContent = new URL(apiUrl).host
}

function showView(name) {
  const map = { connect: elements.connectView, unlock: elements.unlockView, vault: elements.vaultView, add: elements.addView }
  Object.values(map).forEach(view => view.classList.add('hidden'))
  map[name].classList.remove('hidden')

  const connected = name !== 'connect'
  const unlocked = name === 'vault' || name === 'add'
  elements.disconnectButton.classList.toggle('hidden', !connected)
  elements.lockButton.classList.toggle('hidden', !unlocked)
}

/* ------------------------------------------------------------------- init */

async function initialize() {
  hydrateIcons()
  setServer(DEFAULT_SERVER)
  await readActivePage()
  await refreshState()
  await consumePendingCredential()
}

/** Replace every [data-icon] placeholder with its Hugeicons SVG. */
function hydrateIcons(root = document) {
  root.querySelectorAll('[data-icon]').forEach((node) => {
    const name = node.getAttribute('data-icon')
    const size = Number(node.getAttribute('data-icon-size') || 18)
    if (name && !node.firstChild) node.innerHTML = icon(name, size)
  })
}

async function refreshState() {
  const status = await send({ type: MESSAGES.GET_STATE })
  state.connected = Boolean(status?.connected)
  state.unlocked = Boolean(status?.unlocked)
  if (status?.apiUrl) setServer(status.apiUrl)

  if (!state.connected) { showView('connect'); return }
  if (!state.unlocked) { showView('unlock'); return }
  await loadItems()
  showView('vault')
}

async function readActivePage() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
    state.activeTab = tab || null
    if (!tab?.id || !/^https?:/i.test(tab.url || '')) return
    try {
      state.pageContext = await chrome.tabs.sendMessage(tab.id, { type: MESSAGES.PAGE_CONTEXT })
    } catch {
      const url = new URL(tab.url)
      state.pageContext = { hostname: url.hostname.replace(/^www\./, ''), url: tab.url, hasPasswordField: false }
    }
  } catch {
    state.activeTab = null
    state.pageContext = null
  }
}

/* --------------------------------------------------------------- connecting */

async function pairExtension(event) {
  event.preventDefault()
  clearFieldError(elements.pairCodeInput)
  const code = elements.pairCodeInput.value.trim()
  if (!/^\d{6}$/.test(code)) {
    setFieldError(elements.pairCodeInput)
    showStatus('Saisissez le code à 6 chiffres affiché dans QVault.', 'error')
    return
  }

  setLoading(elements.connectButton, true)
  try {
    await send({ type: MESSAGES.PAIR, code, apiUrl: elements.serverSelect.value })
    elements.pairCodeInput.value = ''
    showView('unlock')
    showStatus('Extension associée.', 'success')
  } catch (error) {
    setFieldError(elements.pairCodeInput)
    showStatus(messageFromError(error, 'Appairage impossible.'), 'error')
  } finally {
    setLoading(elements.connectButton, false)
  }
}

async function connectWithToken() {
  clearFieldError(elements.tokenInput)
  const token = elements.tokenInput.value.trim()
  if (!/^blx_[A-Za-z0-9_-]{40,64}$/.test(token)) {
    setFieldError(elements.tokenInput)
    showStatus('Ce jeton QVault est invalide.', 'error')
    return
  }

  setLoading(elements.connectTokenButton, true)
  try {
    await send({ type: MESSAGES.SET_TOKEN, token, apiUrl: elements.serverSelect.value })
    elements.tokenInput.value = ''
    showView('unlock')
    showStatus('Extension connectée.', 'success')
  } catch (error) {
    setFieldError(elements.tokenInput)
    showStatus(messageFromError(error, 'Connexion impossible.'), 'error')
  } finally {
    setLoading(elements.connectTokenButton, false)
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
    await send({ type: MESSAGES.UNLOCK, masterPassword })
    elements.masterPasswordInput.value = ''
    await loadItems()
    showView('vault')
    showStatus('Coffre déverrouillé.', 'success')
    await consumePendingCredential()
  } catch (error) {
    setFieldError(elements.masterPasswordInput)
    showStatus(messageFromError(error, 'Mot de passe maître incorrect.'), 'error')
  } finally {
    setLoading(elements.unlockButton, false)
  }
}

function lockVault() {
  send({ type: MESSAGES.LOCK }).catch(() => {})
  state.items = []
  elements.searchInput.value = ''
  showView('unlock')
  showStatus('Coffre verrouillé.', 'success')
}

async function disconnectExtension() {
  await send({ type: MESSAGES.DISCONNECT }).catch(() => {})
  state.items = []
  showView('connect')
  showStatus('Extension déconnectée.', 'success')
}

/* -------------------------------------------------------------------- vault */

async function loadItems() {
  const response = await send({ type: MESSAGES.LIST })
  if (response?.locked) {
    state.unlocked = false
    showView('unlock')
    return
  }
  state.items = Array.isArray(response?.items) ? response.items : []
  renderCredentials()
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

function renderCredentials() {
  const query = elements.searchInput.value.trim().toLowerCase()
  const filtered = state.items.filter(item => !query
    || [item.label, item.username, hostnameFromUrl(item.url)].some(value => String(value || '').toLowerCase().includes(query)))
  const siteItems = filtered.filter(item => domainsMatch(hostnameFromUrl(item.url), state.pageContext?.hostname || ''))

  elements.siteSection.classList.toggle('hidden', siteItems.length === 0)
  elements.siteCount.textContent = String(siteItems.length)
  elements.allCount.textContent = String(filtered.length)
  renderList(elements.siteList, siteItems, true)
  renderList(elements.allList, filtered, false)
}

function initial(value) {
  const letter = String(value || '').replace(/^www\./, '').trim().charAt(0)
  return (letter || 'Q').toUpperCase()
}

function actionButton(title, iconName, onClick, extraClass = '') {
  const button = document.createElement('button')
  button.type = 'button'
  button.className = `icon-action ${extraClass}`.trim()
  button.title = title
  button.setAttribute('aria-label', title)
  button.innerHTML = icon(iconName, 17)
  button.addEventListener('click', onClick)
  return button
}

function renderList(target, items, emphasizeFill) {
  target.replaceChildren()
  if (!items.length) {
    const empty = document.createElement('p')
    empty.className = 'empty'
    empty.textContent = elements.searchInput.value ? 'Aucun résultat.' : 'Aucun identifiant enregistré.'
    target.appendChild(empty)
    return
  }

  items.forEach((item) => {
    const row = document.createElement('article')
    row.className = 'item'

    const avatar = document.createElement('span')
    avatar.className = 'item__avatar'
    avatar.setAttribute('aria-hidden', 'true')
    avatar.textContent = initial(item.label)

    const copy = document.createElement('div')
    copy.className = 'item__copy'
    const label = document.createElement('strong')
    label.textContent = item.label || hostnameFromUrl(item.url) || 'Sans titre'
    const account = document.createElement('small')
    account.textContent = item.username || 'Compte sans identifiant'
    copy.append(label, account)

    const actions = document.createElement('div')
    actions.className = 'item__actions'

    const fill = actionButton('Remplir cette page', 'fill', () => fillItem(item, fill), emphasizeFill ? 'is-primary' : '')
    fill.disabled = !state.pageContext?.hasPasswordField
    if (fill.disabled) fill.title = 'Aucun champ de mot de passe détecté sur cette page'
    const copyPassword = actionButton('Copier le mot de passe', 'copy', () => copyPasswordItem(item, copyPassword))
    actions.append(fill, copyPassword)
    if (item.url) actions.append(actionButton('Ouvrir le site', 'open', () => openItem(item)))

    row.append(avatar, copy, actions)
    target.appendChild(row)
  })
}

async function fillItem(item, button) {
  if (!state.activeTab?.id) {
    showStatus('Aucun onglet compatible.', 'error')
    return
  }
  setLoading(button, true)
  try {
    const response = await chrome.tabs.sendMessage(state.activeTab.id, {
      type: MESSAGES.FILL,
      credential: { username: item.username, password: item.password },
    })
    if (!response?.ok) throw new Error('Aucun formulaire compatible sur cette page.')
    setTransientState(button, 'success', 'success')
    showStatus('Identifiant rempli.', 'success')
  } catch (error) {
    setTransientState(button, 'error', 'error')
    showStatus(messageFromError(error, 'Remplissage impossible.'), 'error')
  } finally {
    setLoading(button, false)
  }
}

async function copyPasswordItem(item, button) {
  try {
    await navigator.clipboard.writeText(item.password)
    setTransientState(button, 'success', 'success')
    showStatus('Mot de passe copié. Pensez à vider le presse-papiers.', 'success')
  } catch {
    setTransientState(button, 'error', 'error')
    showStatus('Copie impossible.', 'error')
  }
}

function openItem(item) {
  if (item.url) chrome.tabs.create({ url: item.url })
}

/* ---------------------------------------------------------------------- add */

async function consumePendingCredential() {
  if (!state.unlocked) return
  const response = await send({ type: MESSAGES.TAKE_PENDING }).catch(() => null)
  if (response?.credential) openAddView(response.credential)
}

function openAddView(credential = null) {
  if (!state.unlocked) {
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
    await send({ type: MESSAGES.SAVE, label, url: url.toString(), username, password })
    await loadItems()
    showView('vault')
    showStatus('Identifiant chiffré et enregistré.', 'success')
  } catch (error) {
    showStatus(messageFromError(error, 'Enregistrement impossible.'), 'error')
  } finally {
    setLoading(elements.saveButton, false)
  }
}

/* ------------------------------------------------------------------- misc */

function generateIntoPasswordField() {
  elements.addPassword.value = generatePassword(22)
  elements.addPassword.type = 'text'
  window.setTimeout(() => { elements.addPassword.type = 'password' }, 4000)
  elements.addPassword.dispatchEvent(new Event('input', { bubbles: true }))
  showStatus('Mot de passe fort généré.', 'success')
}

function toggleTokenVisibility() {
  const visible = elements.tokenInput.type === 'text'
  elements.tokenInput.type = visible ? 'password' : 'text'
  elements.toggleTokenButton.innerHTML = icon(visible ? 'view' : 'hide', 18)
  elements.toggleTokenButton.setAttribute('aria-label', visible ? 'Afficher le jeton' : 'Masquer le jeton')
}

function setLoading(button, loading) {
  button.disabled = loading
  if (loading) button.dataset.state = 'loading'
  else if (button.dataset.state === 'loading') delete button.dataset.state
}

function setTransientState(button, stateName, iconName) {
  const original = button.innerHTML
  button.dataset.state = stateName
  button.innerHTML = icon(iconName, 17)
  window.setTimeout(() => {
    if (button.dataset.state === stateName) delete button.dataset.state
    button.innerHTML = original
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
  [elements.addLabel, elements.addUrl, elements.addUsername, elements.addPassword].forEach(clearFieldError)
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
