import test from 'node:test'
import assert from 'node:assert/strict'
import { loadPage, wait } from './helpers.mjs'

function guardOf(page) {
  const guard = page.window.__qvaultGuard
  assert.ok(guard, 'src/content/guard.js doit exposer __qvaultGuard')
  return guard
}

test('un vrai clic sur une carte visible depuis assez longtemps est accepté', async () => {
  const page = loadPage()
  const guard = guardOf(page)
  const card = page.document.createElement('div')
  page.document.body.append(card)
  const watch = guard.watch(card, { minVisibleMs: 20 })
  await wait(40)
  assert.equal(watch.accepts({ isTrusted: true }), true)
  watch.stop()
})

test('un clic non fiable est refusé', async () => {
  const page = loadPage()
  const watch = guardOf(page).watch(page.document.body, { minVisibleMs: 0 })
  await wait(10)
  assert.equal(watch.accepts({ isTrusted: false }), false)
})

test('un clic trop rapide après l’apparition est refusé', async () => {
  const page = loadPage()
  const watch = guardOf(page).watch(page.document.body, { minVisibleMs: 500 })
  await wait(10)
  assert.equal(watch.accepts({ isTrusted: true }), false)
})

test('une carte masquée ou recouverte par la page est refusée', async () => {
  const page = loadPage({ visible: false })
  const watch = guardOf(page).watch(page.document.body, { minVisibleMs: 0 })
  await wait(10)
  assert.equal(watch.accepts({ isTrusted: true }), false)
})
