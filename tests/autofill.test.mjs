import test from 'node:test'
import assert from 'node:assert/strict'
import { loadPage, wait } from './helpers.mjs'

const saved = [{ id: '1', label: 'login.example.com', url: 'https://login.example.com', username: 'enzo', password: 'S3cret-Du-Coffre!' }]

// Ce que peut faire une page hostile (ou un XSS) avec les seules API DOM.
async function pageTriesToSteal(page) {
  page.document.getElementById('p').focus()
  await wait(60)
  const host = [...page.document.documentElement.children].find(node => node.shadowRoot)
  host?.shadowRoot.querySelector('button.row')?.click()
  return {
    shadowReadable: Boolean(host),
    password: page.document.getElementById('p').value,
    username: page.document.getElementById('u').value,
  }
}

test('la carte de remplissage n’est pas lisible par la page', async () => {
  const page = loadPage({ items: saved })
  const result = await pageTriesToSteal(page)
  assert.equal(result.shadowReadable, false)
})

test('un clic simulé par la page ne remplit rien', async () => {
  const page = loadPage({ items: saved })
  page.document.getElementById('p').focus()
  await wait(60)
  const host = page.document.documentElement.lastElementChild
  // Même sans lire le shadow root, la page peut viser la carte : elle dispatche un clic.
  host.dispatchEvent(new page.window.MouseEvent('click', { bubbles: true, composed: true }))
  assert.equal(page.document.getElementById('p').value, '')
  const stolen = await pageTriesToSteal(loadPage({ items: saved }))
  assert.equal(stolen.password, '')
  assert.equal(stolen.username, '')
})
