/**
 * QVault in-page credential bridge.
 *
 * - detects login fields (username, password, email, one-step forms);
 * - shows a 1Password-style card anchored to the field to autofill;
 * - captures a submitted credential and offers to save or update it;
 * - receives one-time fill commands from the popup.
 *
 * Credentials are decrypted by the background engine, never here.
 */

(() => {
  if (window.top !== window || window.__qvaultCredentialBridge) return
  const APP_HOSTS = /^(qvault\.hqmerchant\.xyz|bitlock\.hqmerchant\.xyz)$/i
  const LOCAL_APP = /^(localhost|127\.0\.0\.1)$/i.test(location.hostname) && location.port === '3000'
  if (APP_HOSTS.test(location.hostname) || LOCAL_APP) return
  window.__qvaultCredentialBridge = true

  const MESSAGES = {
    MATCHES_FOR_HOST: 'QVAULT_MATCHES_FOR_HOST',
    SAVE: 'QVAULT_SAVE',
    OPEN_POPUP: 'QVAULT_OPEN_POPUP',
    CAPTURE_CREDENTIAL: 'QVAULT_CAPTURE_CREDENTIAL',
    FILL: 'QVAULT_FILL',
    PAGE_CONTEXT: 'QVAULT_PAGE_CONTEXT',
  }

  const USERNAME_HINTS = /(user|login|email|e-?mail|account|identifier|identifiant|pseudo|handle|phone|tel|mobile)/i
  const USERNAME_AUTOCOMPLETE = /username|email|tel|phone/i
  const AVOID_HINTS = /(search|query|captcha|otp|code|token|promo|coupon|newsletter)/i

  const ignoredHostKey = `qvault-ignore:${location.hostname}`
  let lastCaptureFingerprint = ''
  let cardHost = null
  let cardRoot = null
  let cardMode = null
  let activeAnchor = null
  let hideTimer = null
  let repositionQueued = false

  /* ------------------------------------------------------------- detection */

  function isVisible(input) {
    if (!(input instanceof HTMLInputElement)) return false
    if (input.disabled || input.readOnly) return false
    const type = (input.getAttribute('type') || 'text').toLowerCase()
    if (['hidden', 'submit', 'button', 'checkbox', 'radio', 'file', 'image', 'range', 'color'].includes(type)) return false
    const style = window.getComputedStyle(input)
    if (style.visibility === 'hidden' || style.display === 'none' || style.opacity === '0') return false
    const rect = input.getBoundingClientRect()
    if (rect.width < 12 || rect.height < 8) return false
    return true
  }

  function meta(input) {
    return [
      input.getAttribute('name'),
      input.getAttribute('id'),
      input.getAttribute('autocomplete'),
      input.getAttribute('placeholder'),
      input.getAttribute('aria-label'),
    ].filter(Boolean).join(' ').toLowerCase()
  }

  function isUsernameField(input) {
    if (!(input instanceof HTMLInputElement)) return false
    const type = (input.getAttribute('type') || 'text').toLowerCase()
    if (type === 'email') return true
    if (type !== 'text' && type !== 'tel') return false
    const text = meta(input)
    if (AVOID_HINTS.test(text) && !USERNAME_HINTS.test(text)) return false
    const autocomplete = (input.getAttribute('autocomplete') || '').toLowerCase()
    if (USERNAME_AUTOCOMPLETE.test(autocomplete)) return true
    return USERNAME_HINTS.test(text)
  }

  function visibleInputs(scope) {
    return Array.from(scope.querySelectorAll('input')).filter(isVisible)
  }

  function findPasswordField(scope = document) {
    return visibleInputs(scope).find(input => (input.getAttribute('type') || '').toLowerCase() === 'password') || null
  }

  function findUsernameField(passwordInput) {
    const scope = passwordInput?.form
      || passwordInput?.closest('form, [role="form"], main, section, div')
      || document
    const candidates = visibleInputs(scope).filter(input => input !== passwordInput && isUsernameField(input))
    if (candidates.length) return candidates[0]
    return visibleInputs(document).find(input => isUsernameField(input)) || null
  }

  function relevantField(target) {
    if (!(target instanceof HTMLInputElement) || !isVisible(target)) return null
    const type = (target.getAttribute('type') || 'text').toLowerCase()
    if (type === 'password') return { password: target, username: findUsernameField(target) }
    if (isUsernameField(target)) return { password: findPasswordField(target.form || document), username: target }
    return null
  }

  function setNativeValue(input, value) {
    const descriptor = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')
    descriptor?.set?.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
    input.dispatchEvent(new Event('change', { bubbles: true }))
  }

  function hostname() {
    return location.hostname.replace(/^www\./, '').toLowerCase()
  }

  function pageContext() {
    return { hostname: hostname(), url: location.href, hasPasswordField: Boolean(findPasswordField()) }
  }

  function credentialFrom(passwordInput, usernameInput) {
    if (!passwordInput || !passwordInput.value) return null
    const user = usernameInput || findUsernameField(passwordInput)
    return {
      username: user?.value || '',
      password: passwordInput.value,
      hostname: hostname(),
      label: hostname() || document.title || 'Identifiant',
      url: location.href,
    }
  }

  /* ------------------------------------------------------------------- card */

  function fontFace() {
    const base = chrome.runtime.getURL('src/popup/fonts')
    return `
      @font-face { font-family: "Geist Variable"; font-weight: 100 900; font-display: swap; src: url("${base}/geist-latin.woff2") format("woff2"); }
      @font-face { font-family: "IBM Plex Mono"; font-weight: 600; font-display: swap; src: url("${base}/ibm-plex-mono-600.woff2") format("woff2"); }
      @font-face { font-family: "IBM Plex Mono"; font-weight: 400; font-display: swap; src: url("${base}/ibm-plex-mono-400.woff2") format("woff2"); }
    `
  }

  function cardStyle() {
    return `
      ${fontFace()}
      :host { all: initial; }
      *, *::before, *::after { box-sizing: border-box; }
      .card {
        --bg: oklch(15.3% 0.006 107.1);
        --panel: oklch(22.8% 0.013 107.4);
        --raised: oklch(30% 0.018 107.3);
        --rule: oklch(30% 0.018 107.3);
        --text: oklch(96% 0.004 106.5);
        --muted: oklch(70% 0.021 106.9);
        --faint: oklch(58% 0.031 107.3);
        --accent: oklch(62.3% 0.214 259.8);
        --accent-strong: oklch(70.7% 0.165 254.6);
        --accent-ink: oklch(99% 0.005 255);
        --focus: oklch(70.7% 0.165 254.6 / 0.5);
        --danger: oklch(57.7% 0.245 27.3);
        width: 340px;
        max-width: calc(100vw - 16px);
        border: 1px solid var(--rule);
        border-radius: 12px;
        background: var(--bg);
        box-shadow: 0 24px 64px oklch(0 0 0 / 0.6);
        color: var(--text);
        font: 13px/1.45 "Geist Variable", system-ui, sans-serif;
        overflow: hidden;
      }
      .head { display: flex; align-items: center; gap: 10px; padding: 10px 12px; border-bottom: 1px solid var(--rule); }
      .mark { display: grid; place-items: center; width: 24px; height: 24px; flex: 0 0 auto; border: 1px solid var(--accent-strong); border-radius: 6px; color: var(--accent-strong); font-family: "IBM Plex Mono", monospace; font-weight: 600; font-size: 12px; }
      .head strong { font-family: "IBM Plex Mono", monospace; font-weight: 600; font-size: 12px; }
      .head small { display: block; color: var(--faint); font-size: 11px; }
      .titles { flex: 1; min-width: 0; }
      .titles strong, .titles small { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .close { width: 28px; height: 28px; border: 0; border-radius: 6px; background: transparent; color: var(--muted); cursor: pointer; font-size: 16px; line-height: 1; }
      .close:hover { background: var(--raised); color: var(--text); }
      .body { padding: 6px; max-height: 260px; overflow-y: auto; }
      .row { display: flex; align-items: center; gap: 10px; width: 100%; padding: 8px; border: 0; border-radius: 8px; background: transparent; color: inherit; cursor: pointer; text-align: left; font: inherit; }
      .row:hover, .row:focus-visible { background: var(--raised); outline: none; }
      .row:focus-visible { box-shadow: 0 0 0 2px var(--focus); }
      .avatar { display: grid; place-items: center; width: 30px; height: 30px; flex: 0 0 auto; border: 1px solid var(--rule); border-radius: 7px; background: var(--panel); color: var(--accent-strong); font-family: "IBM Plex Mono", monospace; font-weight: 600; font-size: 12px; }
      .copy { flex: 1; min-width: 0; }
      .copy strong { display: block; font-size: 13px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .copy small { display: block; color: var(--faint); font-size: 11px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .go { color: var(--accent-strong); font-size: 11px; font-weight: 600; }
      .note { padding: 14px 12px; color: var(--muted); text-align: center; }
      .foot { display: flex; gap: 6px; padding: 8px; border-top: 1px solid var(--rule); }
      button.act { flex: 1; min-height: 32px; padding: 0 10px; border: 1px solid var(--rule); border-radius: 8px; background: var(--panel); color: var(--text); cursor: pointer; font: 600 12px "Geist Variable", sans-serif; }
      button.act:hover { background: var(--raised); }
      button.act.primary { border-color: var(--accent); background: var(--accent); color: var(--accent-ink); }
      button.act.primary:hover { background: var(--accent-strong); border-color: var(--accent-strong); }
      button.act.ghost { background: transparent; color: var(--muted); }
      button.act:focus-visible { outline: 2px solid var(--focus); outline-offset: 1px; }
      .site { padding: 12px; }
      .site p { margin: 0; }
      .site .who { margin-top: 4px; color: var(--muted); overflow-wrap: anywhere; }
      @media (prefers-reduced-motion: no-preference) { .card { animation: qv-in 160ms cubic-bezier(0.16, 1, 0.3, 1); } }
      @keyframes qv-in { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: none; } }
    `
  }

  function ensureCard() {
    if (cardHost) return
    cardHost = document.createElement('div')
    cardHost.style.cssText = 'all:initial;position:fixed;z-index:2147483647;'
    cardRoot = cardHost.attachShadow({ mode: 'open' })
    const style = document.createElement('style')
    style.textContent = cardStyle()
    cardRoot.append(style)
    document.documentElement.appendChild(cardHost)
  }

  function closeCard() {
    if (hideTimer) { clearTimeout(hideTimer); hideTimer = null }
    cardHost?.remove()
    cardHost = null
    cardRoot = null
    cardMode = null
    activeAnchor = null
  }

  function positionCard() {
    if (!cardHost || !activeAnchor || !activeAnchor.isConnected) return
    const rect = activeAnchor.getBoundingClientRect()
    const hostRect = cardHost.getBoundingClientRect()
    const width = hostRect.width || 340
    const height = hostRect.height || 180
    const margin = 8
    let left = rect.left
    if (left + width > window.innerWidth - margin) left = Math.max(margin, window.innerWidth - width - margin)
    let top = rect.bottom + margin
    if (top + height > window.innerHeight - margin && rect.top - margin - height > margin) {
      top = rect.top - margin - height
    }
    cardHost.style.left = `${Math.max(margin, left)}px`
    cardHost.style.top = `${Math.max(margin, top)}px`
  }

  function queueReposition() {
    if (repositionQueued) return
    repositionQueued = true
    requestAnimationFrame(() => {
      repositionQueued = false
      positionCard()
    })
  }

  function render(children) {
    ensureCard()
    const style = cardRoot.querySelector('style')
    const card = element('div', { class: 'card' }, children)
    cardRoot.replaceChildren(style, card)
    positionCard()
  }

  function element(tag, props = {}, children = []) {
    const node = document.createElement(tag)
    for (const [key, value] of Object.entries(props)) {
      if (value === undefined || value === null) continue
      if (key === 'class') node.className = value
      else if (key === 'text') node.textContent = value
      else if (key.startsWith('on') && typeof value === 'function') node.addEventListener(key.slice(2), value)
      else node.setAttribute(key, value)
    }
    for (const child of [].concat(children)) if (child) node.append(child)
    return node
  }

  function head(title, subtitle) {
    const mark = element('span', { class: 'mark', text: 'Q', 'aria-hidden': 'true' })
    const titles = element('div', { class: 'titles' }, [
      element('strong', { text: title }),
      subtitle ? element('small', { text: subtitle }) : null,
    ])
    const close = element('button', { class: 'close', type: 'button', 'aria-label': 'Fermer', text: '×', onclick: closeCard })
    return element('header', { class: 'head' }, [mark, titles, close])
  }

  function initial(value) {
    const letter = String(value || '').replace(/^www\./, '').trim().charAt(0)
    return (letter || 'Q').toUpperCase()
  }

  function fill(credential) {
    const passwordField = findPasswordField() || activeAnchor
    if (passwordField && credential.password) setNativeValue(passwordField, String(credential.password))
    const usernameField = passwordField ? findUsernameField(passwordField) : activeAnchor
    if (usernameField && credential.username !== undefined) setNativeValue(usernameField, String(credential.username))
    ;(passwordField || usernameField)?.focus()
    closeCard()
  }

  async function showAutofill(anchor) {
    activeAnchor = anchor
    cardMode = 'autofill'
    render(element('div', { class: 'body' }, [element('div', { class: 'note', text: 'Recherche…' })]))
    let response
    try {
      response = await chrome.runtime.sendMessage({ type: MESSAGES.MATCHES_FOR_HOST, hostname: hostname() })
    } catch {
      closeCard()
      return
    }
    if (cardMode !== 'autofill') return

    if (response?.locked) {
      render([
        head('Coffre verrouillé', 'QVault'),
        element('div', { class: 'note', text: 'Déverrouillez QVault pour remplir cet identifiant.' }),
        element('footer', { class: 'foot' }, [
          element('button', {
            class: 'act primary', type: 'button', text: 'Ouvrir QVault',
            onclick: () => chrome.runtime.sendMessage({ type: MESSAGES.OPEN_POPUP }).catch(() => {}),
          }),
        ]),
      ])
      return
    }

    const items = Array.isArray(response?.items) ? response.items : []
    if (!items.length) {
      render([
        head('Aucun identifiant', hostname()),
        element('div', { class: 'note', text: 'Aucun identifiant enregistré pour ce site.' }),
      ])
      return
    }

    const rows = items.map(item => element('button', {
      class: 'row', type: 'button',
      onclick: () => fill(item),
    }, [
      element('span', { class: 'avatar', text: initial(item.label), 'aria-hidden': 'true' }),
      element('span', { class: 'copy' }, [
        element('strong', { text: item.label || hostname() }),
        item.username ? element('small', { text: item.username }) : null,
      ]),
      element('span', { class: 'go', text: 'Remplir' }),
    ]))

    render([
      head('Remplir avec QVault', hostname()),
      element('div', { class: 'body' }, rows),
    ])
  }

  function showSave(credential, updateId) {
    activeAnchor = findPasswordField() || document.body
    cardMode = 'save'
    const who = credential.username || 'Compte sans identifiant'
    const actions = [
      element('button', {
        class: 'act primary', type: 'button', text: updateId ? 'Mettre à jour' : 'Enregistrer',
        onclick: () => saveCredential(credential, updateId),
      }),
      element('button', { class: 'act ghost', type: 'button', text: 'Ignorer', onclick: closeCard }),
    ]

    render([
      head(updateId ? 'Mettre à jour ?' : 'Enregistrer ?', 'QVault'),
      element('div', { class: 'site' }, [
        element('p', {}, [element('strong', { text: credential.hostname })]),
        element('p', { class: 'who', text: who }),
      ]),
      element('footer', { class: 'foot' }, actions),
    ])
  }

  async function saveCredential(credential, updateId) {
    const buttons = cardRoot?.querySelectorAll('button.act')
    buttons?.forEach(button => { button.disabled = true })
    try {
      const response = await chrome.runtime.sendMessage({
        type: MESSAGES.SAVE,
        id: updateId || undefined,
        label: credential.label,
        url: credential.url,
        username: credential.username,
        password: credential.password,
      })
      if (response?.ok) {
        closeCard()
        showToast('Identifiant enregistré dans QVault.')
      } else {
        throw new Error(response?.error || 'Échec')
      }
    } catch (error) {
      buttons?.forEach(button => { button.disabled = false })
      showToast(String(error?.message || 'Enregistrement impossible.'), true)
    }
  }

  function showToast(text, failed = false) {
    ensureCard()
    const style = cardRoot.querySelector('style')
    const card = element('div', { class: 'card' }, [
      head('QVault', failed ? 'Erreur' : 'Enregistré'),
      element('div', { class: 'note', text }),
    ])
    cardRoot.replaceChildren(style, card)
    activeAnchor = activeAnchor || document.body
    positionCard()
    window.setTimeout(closeCard, failed ? 5000 : 2200)
  }

  /* --------------------------------------------------------------- capture */

  async function scheduleCapture(passwordInput) {
    const credential = credentialFrom(passwordInput, findUsernameField(passwordInput))
    if (!credential || sessionStorage.getItem(ignoredHostKey) === 'true') return

    const digest = await crypto.subtle.digest(
      'SHA-256',
      new TextEncoder().encode([credential.hostname, credential.username, credential.password].join('\u0000')),
    )
    const fingerprint = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')
    if (fingerprint === lastCaptureFingerprint) return
    lastCaptureFingerprint = fingerprint

    let updateId
    try {
      const response = await chrome.runtime.sendMessage({ type: MESSAGES.MATCHES_FOR_HOST, hostname: credential.hostname })
      if (!response?.locked) {
        const existing = (response?.items || []).find(item =>
          String(item.username || '').toLowerCase() === credential.username.toLowerCase())
        if (existing) updateId = existing.id
      }
    } catch {
      // Capture still works without the match lookup.
    }

    window.setTimeout(() => showSave(credential, updateId), 180)
  }

  document.addEventListener('focusin', (event) => {
    const fields = relevantField(event.target)
    if (!fields) return
    const anchor = fields.password && isVisible(fields.password) ? fields.password : fields.username
    if (!anchor) return
    if (hideTimer) { clearTimeout(hideTimer); hideTimer = null }
    if (cardMode === 'save') return
    showAutofill(anchor)
  }, true)

  document.addEventListener('focusout', () => {
    if (hideTimer) clearTimeout(hideTimer)
    hideTimer = window.setTimeout(() => {
      const active = cardRoot?.activeElement
      if (!active && cardMode !== 'save') closeCard()
    }, 250)
  }, true)

  document.addEventListener('pointerdown', (event) => {
    if (!cardHost) return
    if (event.composedPath().includes(cardHost)) return
    if (cardMode !== 'save') closeCard()
  }, true)

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && cardHost) closeCard()
  }, true)

  document.addEventListener('submit', (event) => {
    const form = event.target instanceof HTMLFormElement ? event.target : null
    scheduleCapture(findPasswordField(form || document))
  }, true)

  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter') return
    const target = event.target
    if (target instanceof HTMLInputElement && (target.getAttribute('type') || '') === 'password' && !target.form) {
      scheduleCapture(target)
    }
  }, true)

  document.addEventListener('click', (event) => {
    const target = event.target instanceof Element
      ? event.target.closest('button, input[type="submit"], [role="button"]')
      : null
    if (!target || target.closest('form')) return
    const passwordInput = findPasswordField(target.closest('[role="form"], main, section') || document)
    if (passwordInput) scheduleCapture(passwordInput)
  }, true)

  window.addEventListener('scroll', () => { if (cardHost) queueReposition() }, true)
  window.addEventListener('resize', () => { if (cardHost) queueReposition() })

  /* -------------------------------------------------------------- messages */

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!message || typeof message.type !== 'string') return undefined

    if (message.type === MESSAGES.PAGE_CONTEXT) {
      sendResponse(pageContext())
      return undefined
    }

    if (message.type === MESSAGES.FILL) {
      const credential = message.credential || {}
      const passwordField = findPasswordField()
      if (!passwordField) {
        sendResponse({ ok: false, reason: 'NO_PASSWORD_FIELD' })
        return undefined
      }
      const usernameField = findUsernameField(passwordField)
      if (usernameField && credential.username) setNativeValue(usernameField, String(credential.username))
      setNativeValue(passwordField, String(credential.password || ''))
      passwordField.focus()
      sendResponse({ ok: true })
    }

    return undefined
  })
})()
