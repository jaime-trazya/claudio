/**
 * Bloqueo de la app con Face ID / Touch ID y un código de respaldo.
 *
 * Face ID se pide con WebAuthn (las «llaves de acceso» de Safari): el iPhone solo da la llave si la
 * cara o la huella coinciden. Sin servidor no se comprueba la firma: es un bloqueo de privacidad para
 * que nadie que coja el móvil desbloqueado vea tus finanzas, no un cifrado de los datos.
 * El código de respaldo evita quedarse fuera si la llave se borra o Face ID falla.
 */

const enc = new TextEncoder()

export function randomBytes(n: number): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(n))
}

export function toB64url(bytes: ArrayBuffer | Uint8Array): string {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
  let s = ''
  for (const x of b) s += String.fromCharCode(x)
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function fromB64url(s: string): Uint8Array {
  const b = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4))
  return Uint8Array.from(b, (c) => c.charCodeAt(0))
}

export const PIN_RE = /^\d{4,8}$/

/** Huella del código (PBKDF2, 100 000 vueltas): el código nunca se guarda tal cual */
export async function hashPin(pin: string, saltB64: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', enc.encode(pin), 'PBKDF2', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: fromB64url(saltB64) as BufferSource, iterations: 100_000, hash: 'SHA-256' }, key, 256)
  return toB64url(bits)
}

export async function newPin(pin: string): Promise<{ pinSalt: string; pinHash: string }> {
  const pinSalt = toB64url(randomBytes(16))
  return { pinSalt, pinHash: await hashPin(pin, pinSalt) }
}

export async function checkPin(pin: string, salt: string, hash: string): Promise<boolean> {
  if (!salt || !hash || !PIN_RE.test(pin)) return false
  const h = await hashPin(pin, salt)
  // Comparación en tiempo constante
  let diff = h.length ^ hash.length
  for (let i = 0; i < Math.min(h.length, hash.length); i++) diff |= h.charCodeAt(i) ^ hash.charCodeAt(i)
  return diff === 0
}

/** ¿Tiene el dispositivo Face ID / Touch ID utilizable desde la web? */
export async function biometricsAvailable(): Promise<boolean> {
  try {
    return typeof PublicKeyCredential !== 'undefined' && (await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable())
  } catch {
    return false
  }
}

/** Crea la llave de acceso de la app (pide Face ID una vez) y devuelve su identificador */
export async function registerBiometrics(): Promise<string> {
  const cred = (await navigator.credentials.create({
    publicKey: {
      challenge: randomBytes(32) as BufferSource,
      rp: { name: 'Claudio · Finanzas', id: location.hostname },
      user: { id: randomBytes(16) as BufferSource, name: 'Claudio', displayName: 'Bloqueo de Claudio' },
      pubKeyCredParams: [
        { type: 'public-key', alg: -7 },
        { type: 'public-key', alg: -257 },
      ],
      authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required', residentKey: 'discouraged' },
      timeout: 60_000,
      attestation: 'none',
    },
  })) as PublicKeyCredential | null
  if (!cred) throw new Error('No se ha creado la llave')
  return toB64url(cred.rawId)
}

/** Pide Face ID con la llave de la app. true si la cara (o huella) coincide. */
export async function verifyBiometrics(credentialId: string): Promise<boolean> {
  try {
    const res = await navigator.credentials.get({
      publicKey: {
        challenge: randomBytes(32) as BufferSource,
        allowCredentials: [{ type: 'public-key', id: fromB64url(credentialId) as BufferSource, transports: ['internal'] }],
        userVerification: 'required',
        timeout: 60_000,
      },
    })
    return !!res
  } catch {
    return false
  }
}

/** Tiempo en segundo plano tras el que se vuelve a bloquear */
export const RELOCK_MS = 60_000
