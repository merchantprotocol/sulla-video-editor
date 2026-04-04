// Password hashing using Web Crypto API (available in Workers)
export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const key = await deriveKey(password, salt)
  const exported = await crypto.subtle.exportKey('raw', key)
  const hash = new Uint8Array(exported)
  return `${toHex(salt)}:${toHex(hash)}`
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [saltHex, hashHex] = stored.split(':')
  const salt = fromHex(saltHex)
  const key = await deriveKey(password, salt)
  const exported = await crypto.subtle.exportKey('raw', key)
  const hash = new Uint8Array(exported)
  return toHex(hash) === hashHex
}

async function deriveKey(password: string, salt: Uint8Array): Promise<CryptoKey> {
  const enc = new TextEncoder()
  const keyMaterial = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits', 'deriveKey'])
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt'],
  )
}

// JWT using HMAC-SHA256
export async function createToken(payload: Record<string, any>, secret: string): Promise<string> {
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
  const body = btoa(JSON.stringify({ ...payload, exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 7 })) // 7 days
  const data = `${header}.${body}`
  const enc = new TextEncoder()
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(data))
  return `${data}.${toBase64Url(new Uint8Array(sig))}`
}

export async function verifyToken(token: string, secret: string): Promise<Record<string, any> | null> {
  const parts = token.split('.')
  if (parts.length !== 3) return null
  const [header, body, sig] = parts
  const data = `${header}.${body}`
  const enc = new TextEncoder()
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify'])
  const valid = await crypto.subtle.verify('HMAC', key, fromBase64Url(sig), enc.encode(data))
  if (!valid) return null
  const payload = JSON.parse(atob(body))
  if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null
  return payload
}

function toHex(buf: Uint8Array): string {
  return [...buf].map(b => b.toString(16).padStart(2, '0')).join('')
}

function fromHex(hex: string): Uint8Array {
  return new Uint8Array(hex.match(/.{2}/g)!.map(b => parseInt(b, 16)))
}

function toBase64Url(buf: Uint8Array): string {
  return btoa(String.fromCharCode(...buf)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromBase64Url(str: string): Uint8Array {
  const b64 = str.replace(/-/g, '+').replace(/_/g, '/') + '=='.slice(0, (4 - str.length % 4) % 4)
  return Uint8Array.from(atob(b64), c => c.charCodeAt(0))
}
