import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

const scriptFiles = [
  'src/background.js',
  'src/content/autosave.js',
  'src/popup/popup.js',
  'src/shared/crypto.js',
  'src/shared/protocol.js',
]

async function read(relativePath) {
  return readFile(join(root, relativePath), 'utf8')
}

for (const relativePath of scriptFiles) {
  const source = await read(relativePath)
  try {
    new Bun.Transpiler({ loader: 'js' }).transformSync(source)
  } catch (error) {
    throw new Error(`${relativePath}: ${error.message}`)
  }
}

const manifest = JSON.parse(await read('manifest.json'))
const permissions = new Set(manifest.permissions || [])
const forbiddenPermissions = ['cookies', 'tabs', 'clipboardRead', 'webRequest']

for (const permission of forbiddenPermissions) {
  if (permissions.has(permission)) {
    throw new Error(`Permission excessive détectée: ${permission}`)
  }
}

for (const host of ['https://qvault.hqmerchant.xyz/*', 'http://localhost:3000/*']) {
  if (!manifest.host_permissions?.includes(host)) {
    throw new Error(`Permission d’hôte absente: ${host}`)
  }
}

if (manifest.background?.type !== 'module' || !manifest.background?.service_worker) {
  throw new Error('Le service worker doit être déclaré comme module.')
}

const webResources = (manifest.web_accessible_resources || []).flatMap(entry => entry.resources || [])
if (!webResources.includes('src/popup/fonts/*.woff2')) {
  throw new Error('Les polices ne sont pas exposées via web_accessible_resources.')
}

for (const font of ['geist-latin.woff2', 'ibm-plex-mono-400.woff2', 'ibm-plex-mono-600.woff2']) {
  try {
    await readFile(join(root, 'src/popup/fonts', font))
  } catch {
    throw new Error(`Police absente: ${font}`)
  }
}

const popupHtml = await read('src/popup/popup.html')
const popupJs = await read('src/popup/popup.js')
const backgroundJs = await read('src/background.js')
const autosaveJs = await read('src/content/autosave.js')
const cryptoJs = await read('src/shared/crypto.js')
const protocolJs = await read('src/shared/protocol.js')
const popupCss = await read('src/popup/popup.css')
const tokensCss = await read('src/popup/tokens.css')
const allSources = [popupHtml, popupJs, backgroundJs, autosaveJs, cryptoJs, protocolJs, popupCss, tokensCss].join('\n')

if (/kipit-two|bitlock-two\.vercel\.app|bitlock\.hqmerchant\.xyz/i.test(allSources)) {
  throw new Error('Une ancienne URL est encore présente.')
}

if (/\bBitLock\b|BITLOCK_/.test(allSources)) {
  throw new Error('Une ancienne marque BitLock subsiste dans les sources.')
}

if (/chrome\.storage\.(local|session)\.set\([^)]*(password|credential|pending)/is.test(backgroundJs)) {
  throw new Error('Le background persiste potentiellement une credential en clair.')
}

if (!/PBKDF2_ITERATIONS = 600000/.test(cryptoJs)) {
  throw new Error('Le facteur PBKDF2 de l’application (600000) est absent.')
}

if (!/ENCRYPTED_PAYLOAD_VERSION = 'v2'/.test(cryptoJs)) {
  throw new Error('Le préfixe de payload chiffré (v2) est absent.')
}

if (!/MASTER_VERIFIER_TEXT = 'bitlock:\/\/master-verifier\/v1'/.test(cryptoJs)) {
  throw new Error('Le marqueur maître (gelé) a changé.')
}

if (!backgroundJs.includes('/api/extension/pair')) {
  throw new Error('La route d’appairage est absente du background.')
}

if (!popupJs.includes('\\d{6}')) {
  throw new Error('Le format du code d’appairage (6 chiffres) est absent.')
}

if (!autosaveJs.includes('MATCHES_FOR_HOST') || !autosaveJs.includes('QVAULT_SAVE')) {
  throw new Error('La carte inline (autofill/enregistrement) est incomplète.')
}

if (manifest.content_scripts?.[0]?.run_at !== 'document_idle') {
  throw new Error('Le content script doit s’exécuter à document_idle.')
}

for (const match of popupJs.matchAll(/getElementById\('([^']+)'\)/g)) {
  if (!popupHtml.includes(`id="${match[1]}"`)) {
    throw new Error(`Élément HTML absent: #${match[1]}`)
  }
}

if (!/<script type="module" src="popup\.js"><\/script>/.test(popupHtml)) {
  throw new Error('popup.html doit charger popup.js en module.')
}

if (/[ÃÂðŸ]/.test(allSources)) {
  throw new Error('Texte mal encodé détecté.')
}

console.log(JSON.stringify({
  ok: true,
  version: manifest.version,
  scriptsChecked: scriptFiles.length,
  permissions: [...permissions],
  hosts: manifest.host_permissions,
  webResources,
}))
