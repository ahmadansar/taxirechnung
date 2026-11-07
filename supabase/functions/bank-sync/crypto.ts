// AES-256-GCM for the stored online-banking login. The key lives only in the Edge Function
// secret BANK_CRED_KEY (32 random bytes, base64). The company id is bound as associated data,
// so a ciphertext copied to another company's row cannot be decrypted.

const b64 = (u: Uint8Array) => btoa(String.fromCharCode(...u))
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0))

export async function importKey(base64Key: string): Promise<CryptoKey> {
  const raw = unb64(base64Key)
  if (raw.length !== 32) throw new Error('BANK_CRED_KEY must be 32 bytes (base64)')
  return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt'])
}

export async function encrypt(key: CryptoKey, plain: string, companyId: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const ct = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: new TextEncoder().encode(companyId) }, key, new TextEncoder().encode(plain)),
  )
  const out = new Uint8Array(iv.length + ct.length)
  out.set(iv)
  out.set(ct, iv.length)
  return 'v1:' + b64(out)
}

export async function decrypt(key: CryptoKey, stored: string, companyId: string): Promise<string> {
  if (!stored.startsWith('v1:')) throw new Error('unknown_cipher')
  const raw = unb64(stored.slice(3))
  const pt = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: raw.slice(0, 12), additionalData: new TextEncoder().encode(companyId) },
    key,
    raw.slice(12),
  )
  return new TextDecoder().decode(pt)
}
