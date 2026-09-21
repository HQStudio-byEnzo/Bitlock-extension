import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const scriptFiles = [
  'src/background.js',
  'src/content/autosave.js',
  'src/popup/popup.js',
]

for (const relativePath of scriptFiles) {
  const source = await readFile(join(root, relativePath), 'utf8')
  try {
    Function(source)
  } catch (error) {
    throw new Error(`${relativePath}: ${error.message}`)
  }
}

const manifest = JSON.parse(await readFile(join(root, 'manifest.json'), 'utf8'))
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

const popupHtml = await readFile(join(root, 'src/popup/popup.html'), 'utf8')
const popupJs = await readFile(join(root, 'src/popup/popup.js'), 'utf8')
const backgroundJs = await readFile(join(root, 'src/background.js'), 'utf8')
const autosaveJs = await readFile(join(root, 'src/content/autosave.js'), 'utf8')
const allSources = [
  popupHtml,
  popupJs,
  backgroundJs,
  autosaveJs,
  await readFile(join(root, 'src/popup/popup.css'), 'utf8'),
].join('\n')

if (/kipit-two|bitlock-two\.vercel\.app|bitlock\.hqmerchant\.xyz/i.test(allSources)) {
  throw new Error('Une ancienne URL est encore présente.')
}

if (/\bBitLock\b|BITLOCK_/.test(allSources)) {
  throw new Error('Une ancienne marque BitLock subsiste dans les sources.')
}

if (/chrome\.storage\.(local|session)\.set\([^)]*(password|credential|pending)/is.test(backgroundJs)) {
  throw new Error('Le background persiste potentiellement une credential en clair.')
}

if (!/PBKDF2_ITERATIONS = 600000/.test(popupJs)) {
  throw new Error('Le facteur PBKDF2 de l’application (600000) est absent.')
}

if (!/ENCRYPTED_PAYLOAD_VERSION = 'v2'/.test(popupJs)) {
  throw new Error('Le préfixe de payload chiffré (v2) est absent.')
}

if (!/MASTER_VERIFIER_TEXT = 'bitlock:\/\/master-verifier\/v1'/.test(popupJs)) {
  throw new Error('Le marqueur maître (gelé) a changé.')
}

for (const match of popupJs.matchAll(/getElementById\('([^']+)'\)/g)) {
  if (!popupHtml.includes(`id="${match[1]}"`)) {
    throw new Error(`Élément HTML absent: #${match[1]}`)
  }
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
}))
