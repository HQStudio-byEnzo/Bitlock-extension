/**
 * Shared QVault crypto. Kept identical to the web app so payloads are
 * interchangeable in both directions.
 *
 * MASTER_VERIFIER_TEXT is frozen: existing verifiers were encrypted with this
 * exact string and must keep decrypting with it.
 */

export const LEGACY_PBKDF2_ITERATIONS = 100000
export const PBKDF2_ITERATIONS = 600000
export const ENCRYPTED_PAYLOAD_VERSION = 'v2'
export const MASTER_VERIFIER_TEXT = 'bitlock://master-verifier/v1'

export function serializeEncryptedPayload(value) {
  return `${ENCRYPTED_PAYLOAD_VERSION}:${PBKDF2_ITERATIONS}:${value.salt}:${value.ciphertext}`
}

export function parseEncryptedPayload(payload) {
  const parts = String(payload || '').split(':')
  if (parts.length === 2 && parts[0] && parts[1]) {
    return { salt: parts[0], ciphertext: parts[1], iterations: LEGACY_PBKDF2_ITERATIONS }
  }
  if (
    parts.length === 4
    && parts[0] === ENCRYPTED_PAYLOAD_VERSION
    && Number(parts[1]) === PBKDF2_ITERATIONS
    && parts[2]
    && parts[3]
  ) {
    return { salt: parts[2], ciphertext: parts[3], iterations: PBKDF2_ITERATIONS }
  }
  throw new Error('Élément chiffré invalide.')
}

export function bytesToBase64(value) {
  let binary = ''
  const chunkSize = 0x8000
  for (let offset = 0; offset < value.length; offset += chunkSize) {
    binary += String.fromCharCode(...value.subarray(offset, offset + chunkSize))
  }
  return btoa(binary)
}

export function base64ToBytes(value) {
  const binary = atob(value)
  return Uint8Array.from(binary, char => char.charCodeAt(0))
}

export async function deriveKey(masterPassword, salt, usages, iterations = PBKDF2_ITERATIONS) {
  const material = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(masterPassword),
    'PBKDF2',
    false,
    ['deriveKey'],
  )
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    usages,
  )
}

export async function encryptData(plaintext, masterPassword) {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const key = await deriveKey(masterPassword, salt, ['encrypt'])
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    new TextEncoder().encode(plaintext),
  )
  return {
    salt: bytesToBase64(salt),
    iv: bytesToBase64(iv),
    ciphertext: bytesToBase64(new Uint8Array(encrypted)),
  }
}

export async function decryptEnvelope(payload, ivBase64, masterPassword) {
  if (typeof payload !== 'string' || typeof ivBase64 !== 'string') {
    throw new Error('Élément chiffré invalide.')
  }
  const envelope = parseEncryptedPayload(payload)
  const key = await deriveKey(masterPassword, base64ToBytes(envelope.salt), ['decrypt'], envelope.iterations)
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: base64ToBytes(ivBase64) },
    key,
    base64ToBytes(envelope.ciphertext),
  )
  return new TextDecoder().decode(decrypted)
}

export function parseCredentialPayload(plaintext) {
  try {
    const parsed = JSON.parse(plaintext)
    if (parsed && typeof parsed.password === 'string') {
      return {
        username: typeof parsed.username === 'string' ? parsed.username : '',
        password: parsed.password,
      }
    }
  } catch {
    // Fall through to the legacy payload parser.
  }

  const separator = plaintext.indexOf(':')
  if (separator > 0) {
    return { username: plaintext.slice(0, separator), password: plaintext.slice(separator + 1) }
  }
  return { username: '', password: plaintext }
}

export function generatePassword(length = 22) {
  const groups = [
    'ABCDEFGHJKLMNPQRSTUVWXYZ',
    'abcdefghijkmnopqrstuvwxyz',
    '23456789',
    '!@#$%&*+-=?',
  ]
  const all = groups.join('')
  const bytes = crypto.getRandomValues(new Uint32Array(length))
  const chars = groups.map((group, index) => group[bytes[index] % group.length])
  for (let index = groups.length; index < length; index += 1) {
    chars.push(all[bytes[index] % all.length])
  }
  for (let index = chars.length - 1; index > 0; index -= 1) {
    const swapIndex = bytes[index] % (index + 1)
    ;[chars[index], chars[swapIndex]] = [chars[swapIndex], chars[index]]
  }
  return chars.join('')
}
