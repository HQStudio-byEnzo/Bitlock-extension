// Charge les scripts de contenu dans une page simulée, avec un faux chrome.runtime.
import { readFileSync } from 'node:fs'
import { JSDOM } from 'jsdom'

const root = new URL('..', import.meta.url)
const read = path => readFileSync(new URL(path, root), 'utf8')

export function loadPage({ url = 'https://login.example.com/', items = [], visible = true } = {}) {
  const dom = new JSDOM(
    '<form><input id=u name=email type=email><input id=p name=password type=password></form>',
    { url, runScripts: 'outside-only', pretendToBeVisual: true },
  )
  const w = dom.window
  w.HTMLElement.prototype.getBoundingClientRect = () => ({ x: 10, y: 10, top: 10, left: 10, width: 200, height: 30, right: 210, bottom: 40 })
  // IntersectionObserver v2 (Chrome) : jsdom ne l'a pas, on simule son verdict.
  w.IntersectionObserver = class {
    constructor(callback) { this.callback = callback }
    observe(target) { setTimeout(() => this.callback([{ target, isVisible: visible, isIntersecting: true }]), 0) }
    disconnect() {}
  }
  const sent = []
  w.chrome = {
    runtime: {
      getURL: path => `chrome-extension://test/${path}`,
      onMessage: { addListener() {} },
      sendMessage: async (message) => {
        sent.push(message)
        if (message.type === 'QVAULT_MATCHES_FOR_HOST') return { locked: false, items }
        return { ok: true }
      },
    },
  }
  for (const script of ['src/content/icons.js', 'src/content/guard.js', 'src/content/autosave.js']) {
    try { w.eval(read(script)) } catch (error) { if (error.code !== 'ENOENT') throw error }
  }
  return { window: w, document: w.document, sent }
}

export const wait = ms => new Promise(resolve => setTimeout(resolve, ms))
