import test, { after } from 'node:test'
import assert from 'node:assert/strict'
import { encryptData, serializeEncryptedPayload, MASTER_VERIFIER_TEXT } from '../src/shared/crypto.js'

// Faux Chrome : stockage en mémoire et serveur QVault simulé.
const store = { local: {}, session: {} }
const area = name => ({
  get: async keys => Object.fromEntries([].concat(keys).filter(k => k in store[name]).map(k => [k, store[name][k]])),
  set: async values => { Object.assign(store[name], values) },
  remove: async keys => { for (const k of [].concat(keys)) delete store[name][k] },
  setAccessLevel: async () => {},
})
let listener
globalThis.chrome = {
  runtime: {
    id: 'ext',
    getURL: path => `chrome-extension://ext/${path}`,
    onMessage: { addListener: fn => { listener = fn } },
    onInstalled: { addListener() {} },
    sendMessage: async () => {},
  },
  storage: { local: area('local'), session: area('session') },
  action: { setBadgeText: async () => {}, setBadgeBackgroundColor: async () => {}, openPopup: async () => {} },
}

const MASTER = 'mot-de-passe-maitre-de-test'
async function item(id, url, password) {
  const enc = await encryptData(JSON.stringify({ username: 'enzo', password }), MASTER)
  return { id, label: id, url, payload: serializeEncryptedPayload(enc), iv: enc.iv, is_encrypted: 1 }
}
const verifier = await encryptData(MASTER_VERIFIER_TEXT, MASTER)
const items = [await item('banque', 'https://banque.example/', 'pw-banque'), await item('blog', 'https://blog.example.org/', 'pw-blog')]
const posted = []
globalThis.fetch = async (url, options = {}) => {
  const path = new URL(url).pathname
  if (path === '/api/extension/unlock') return Response.json({ configured: true, verifier: { payload: serializeEncryptedPayload(verifier), iv: verifier.iv } })
  if (path === '/api/extension/passwords' && options.method === 'POST') { posted.push(JSON.parse(options.body)); return Response.json({ id: 'x' }) }
  if (path === '/api/extension/passwords') return Response.json({ items })
  return new Response('{}', { status: 404 })
}
store.local.qvaultExtensionToken = 'blx_' + 'a'.repeat(43)

await import('../src/background.js')

const popup = { id: 'ext', url: 'chrome-extension://ext/src/popup/popup.html' }
const page = host => ({ id: 'ext', url: `https://${host}/login`, tab: { id: 1, url: `https://${host}/login` }, frameId: 0 })
const send = (message, sender) => new Promise(resolve => {
  const sync = listener(message, sender, resolve)
  if (sync === undefined) setTimeout(() => resolve(undefined), 50)
})

test('le popup déverrouille et liste le coffre', async () => {
  assert.deepEqual(await send({ type: 'QVAULT_UNLOCK', masterPassword: MASTER }, popup), { ok: true })
  const list = await send({ type: 'QVAULT_LIST' }, popup)
  assert.equal(list.items.length, 2)
})

test('une page ne peut pas lister tout le coffre', async () => {
  const response = await send({ type: 'QVAULT_LIST' }, page('evil.example'))
  assert.equal(response.ok, false)
  assert.equal(response.items, undefined)
})

test('une page ne reçoit que ses propres identifiants, quel que soit l’hôte annoncé', async () => {
  const own = await send({ type: 'QVAULT_MATCHES_FOR_HOST', hostname: 'banque.example' }, page('banque.example'))
  assert.deepEqual(own.items.map(i => i.id), ['banque'])
  const forged = await send({ type: 'QVAULT_MATCHES_FOR_HOST', hostname: 'banque.example' }, page('evil.example'))
  assert.deepEqual(forged.items, [])
  const sub = await send({ type: 'QVAULT_MATCHES_FOR_HOST' }, page('static.banque.example'))
  assert.deepEqual(sub.items, [])
})

test('une page ne peut pas enregistrer pour un autre site ni écraser un autre identifiant', async () => {
  const other = await send({ type: 'QVAULT_SAVE', label: 'x', url: 'https://banque.example/', password: 'p' }, page('evil.example'))
  assert.equal(other.ok, false)
  const overwrite = await send({ type: 'QVAULT_SAVE', id: 'banque', label: 'x', url: 'https://evil.example/', password: 'p' }, page('evil.example'))
  assert.equal(overwrite.ok, false)
})

test('l’identifiant n’est pas envoyé en clair au serveur', async () => {
  const response = await send({ type: 'QVAULT_SAVE', label: 'evil', url: 'https://evil.example/login', username: 'enzo', password: 'p' }, page('evil.example'))
  assert.equal(response.ok, true)
  assert.equal(posted.at(-1).username, undefined)
})

test('une autre extension ou une sous-frame est ignorée', async () => {
  assert.equal((await send({ type: 'QVAULT_LIST' }, { ...popup, id: 'autre' })).ok, false)
  assert.equal((await send({ type: 'QVAULT_MATCHES_FOR_HOST' }, { ...page('banque.example'), frameId: 2 })).ok, false)
})

// Verrouille pour couper les minuteurs de session et laisser le processus finir.
after(() => send({ type: 'QVAULT_DISCONNECT' }, popup))
