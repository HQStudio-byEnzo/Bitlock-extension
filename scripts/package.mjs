// Construit l'archive à déposer sur le Chrome Web Store.
//
// Le ZIP ne contient que les fichiers d'exécution (manifest, icônes, src).
// Le script vérifie que la version du manifest correspond au nom du fichier et
// refuse de produire une archive contenant tests, node_modules ou scripts.
import { mkdirSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { spawnSync } from 'node:child_process'

const root = join(import.meta.dir, '..')
const manifest = JSON.parse(readFileSync(join(root, 'manifest.json'), 'utf8'))
const version = String(manifest.version || '')

if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error(`Version de manifest invalide: ${version}`)

const INCLUDED = ['manifest.json', 'icons', 'src']
const files = []

function walk(path) {
  const absolute = join(root, path)
  if (statSync(absolute).isDirectory()) {
    for (const entry of readdirSync(absolute).sort()) walk(join(path, entry))
    return
  }
  files.push(path)
}

for (const entry of INCLUDED) walk(entry)

const forbidden = files.filter(file => /(^|\/)(tests|node_modules|scripts|\.git)\//.test(file) || file.endsWith('.map'))
if (forbidden.length > 0) throw new Error(`Fichiers de développement dans l'archive: ${forbidden.join(', ')}`)

for (const required of ['manifest.json', 'src/background.js', 'src/popup/popup.html']) {
  if (!files.includes(required)) throw new Error(`Fichier obligatoire manquant: ${required}`)
}

const outDir = join(root, 'dist')
mkdirSync(outDir, { recursive: true })
const archive = join(outDir, `qvault-extension-${version}.zip`)
rmSync(archive, { force: true })

const script = [
  'import json, sys, zipfile',
  'files = json.load(sys.stdin)',
  'out = sys.argv[1]',
  "with zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED) as archive:",
  '    for path in files:',
  '        archive.write(path, path)',
].join('\n')

const result = spawnSync('python3', ['-c', script, archive], { cwd: root, input: JSON.stringify(files), encoding: 'utf8' })
if (result.status !== 0) throw new Error(result.stderr || 'Échec de création du ZIP')

const { size } = statSync(archive)
if (size <= 0) throw new Error('Archive vide')

console.log(JSON.stringify({
  ok: true,
  archive: relative(root, archive),
  version,
  files: files.length,
  bytes: size,
}, null, 2))
