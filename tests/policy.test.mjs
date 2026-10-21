import test from 'node:test'
import assert from 'node:assert/strict'
import { hostOf, matchesHost, senderRole, allowedFor } from '../src/shared/policy.js'

const runtime = { id: 'ext', getURL: path => `chrome-extension://ext/${path}` }
const popup = { id: 'ext', url: 'chrome-extension://ext/src/popup/popup.html' }
const content = { id: 'ext', url: 'https://login.example.com/signin', tab: { id: 4, url: 'https://login.example.com/signin' }, frameId: 0 }

test('un identifiant n’est proposé que sur son propre hôte', () => {
  assert.equal(matchesHost('https://example.com/login', 'example.com'), true)
  assert.equal(matchesHost('https://www.example.com/', 'example.com'), true)
  assert.equal(matchesHost('https://example.com/', 'evil.example.com'), false)
  assert.equal(matchesHost('https://accounts.example.com/', 'example.com'), false)
  assert.equal(matchesHost('https://user.github.io/', 'github.io'), false)
  assert.equal(matchesHost('pas une url', 'example.com'), false)
  assert.equal(matchesHost('https://example.com/', ''), false)
})

test('hostOf ignore www et la casse', () => {
  assert.equal(hostOf('https://WWW.Example.com:8443/x'), 'example.com')
  assert.equal(hostOf('javascript:alert(1)'), '')
})

test('le rôle de l’expéditeur vient de Chrome, pas du message', () => {
  assert.equal(senderRole(popup, runtime), 'popup')
  assert.equal(senderRole(content, runtime), 'content')
  assert.equal(senderRole({ ...content, id: 'autre-extension' }, runtime), null)
  assert.equal(senderRole({ ...content, frameId: 3 }, runtime), null)
  assert.equal(senderRole({ id: 'ext', url: 'chrome-extension://ext/src/popup/popup.html', tab: { id: 1 } }, runtime), null)
  assert.equal(senderRole({ ...content, url: 'file:///etc/passwd', tab: { url: 'file:///etc/passwd' } }, runtime), null)
})

test('un script de contenu n’a pas accès aux commandes du coffre', () => {
  for (const type of ['QVAULT_LIST', 'QVAULT_UNLOCK', 'QVAULT_SET_TOKEN', 'QVAULT_PAIR', 'QVAULT_DISCONNECT', 'QVAULT_TAKE_PENDING', 'QVAULT_LOCK', 'QVAULT_GET_STATE']) {
    assert.equal(allowedFor('content', type), false, type)
    assert.equal(allowedFor('popup', type), true, type)
  }
  for (const type of ['QVAULT_MATCHES_FOR_HOST', 'QVAULT_SAVE', 'QVAULT_CAPTURE_CREDENTIAL', 'QVAULT_OPEN_POPUP']) {
    assert.equal(allowedFor('content', type), true, type)
  }
  assert.equal(allowedFor(null, 'QVAULT_MATCHES_FOR_HOST'), false)
})
