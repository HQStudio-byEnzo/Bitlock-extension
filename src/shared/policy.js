/**
 * Who may ask what of the background, and which credentials belong to a page.
 * Pure functions: tested without a browser (tests/policy.test.mjs).
 */

import { MESSAGES } from './protocol.js'

/** Messages a content script may send. Everything else is reserved to the popup. */
const CONTENT_MESSAGES = new Set([
  MESSAGES.MATCHES_FOR_HOST,
  MESSAGES.SAVE,
  MESSAGES.CAPTURE_CREDENTIAL,
  MESSAGES.OPEN_POPUP,
])

/** Lower-case hostname without a leading `www.`, or '' for anything but http(s). */
export function hostOf(value) {
  try {
    const url = new URL(String(value || ''))
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return ''
    return url.hostname.replace(/^www\./, '').toLowerCase()
  } catch {
    return ''
  }
}

/**
 * A credential is offered on its own host only. No parent or child domain: a
 * page on `blog.example.com` must not receive the password of `example.com`.
 */
export function matchesHost(itemUrl, hostname) {
  const target = String(hostname || '').replace(/^www\./, '').toLowerCase()
  const itemHost = hostOf(itemUrl)
  return Boolean(target && itemHost && itemHost === target)
}

/** 'popup', 'content' (top frame of an http(s) tab) or null, from Chrome's sender. */
export function senderRole(sender, runtime) {
  if (!sender || sender.id !== runtime.id) return null
  const url = String(sender.url || '')
  if (!sender.tab) {
    return url.startsWith(runtime.getURL('src/popup/')) ? 'popup' : null
  }
  if (sender.frameId !== 0) return null
  return hostOf(url) ? 'content' : null
}

export function allowedFor(role, type) {
  if (role === 'popup') return true
  if (role === 'content') return CONTENT_MESSAGES.has(type)
  return false
}
