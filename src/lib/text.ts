/** Minúsculas, sin tildes y con espacios simples. Base de todas las comparaciones. */
export function normalize(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
}

// Ruido típico de los conceptos de los bancos españoles
const NOISE = [
  /\b(compra|pago|pag|cargo|abono)\s+(con\s+)?(tarj(eta)?|tarjeta\s+credito|tarjeta\s+debito|movil|contactless|apple\s*pay|google\s*pay)\b/g,
  /\b(compra|pago)\s+en\b/g,
  /\bcompra\b/g,
  /\btarj(eta)?\b(\s+\d+)?/g,
  /\b(recibo|adeudo|domiciliacion|domiciliado|cargo)\b(\s+(de|sepa))?/g,
  /\bsepa\b/g,
  /\bapple\s*pay\b/g,
  /\b(contactless|visa|mastercard|debito|credito)\b/g,
  /\b(espana|esp)\b/g,
  /\b(madrid|barcelona|valencia|sevilla|bilbao|malaga|zaragoza|es)\s*$/g,
  /\b\d{2}\s\d{2}(\s\d{2,4})?\b/g, // fechas sueltas
  /\b\d*[x*]{2,}\d*\b/g, // tarjeta enmascarada (4000XXXX0001)
  /\b\d{4,}\b/g, // números largos (referencias, tarjetas)
  /\b(s\s?l\s?u|s\s?a\s?u|s\s?l|s\s?a|sau|slu|gmbh|ltd|inc|sarl|bv|plc|llc)\s*$/g,
  /\bnum\b|\bref\b|\bop\b/g,
  /\b(com|es|net|eu)\s*$/g, // dominios: "netflix.com" → "netflix"
  /\bp\d+\b/g,
]

/**
 * Clave estable del comercio a partir del concepto del banco.
 * "COMPRA TARJ. 4512XXXX1234 MERCADONA VALENCIA" → "mercadona"
 */
export function merchantKey(description: string): string {
  let s = normalize(description)
  for (const re of NOISE) s = s.replace(re, ' ')
  s = s.replace(/\s+/g, ' ').trim()
  const words = s.split(' ').filter((w) => w.length > 1 || /\d/.test(w))
  return words.slice(0, 3).join(' ') || normalize(description)
}

/** Nombre del comercio legible para mostrar: "Mercadona" */
export function prettyMerchant(description: string): string {
  const key = merchantKey(description)
  if (!key) return description.trim()
  return key
    .split(' ')
    .map((w) => (w.length <= 4 && /^[a-z]+$/.test(w) && !/[aeiouy]/.test(w) ? w.toUpperCase() : w[0].toUpperCase() + w.slice(1)))
    .join(' ')
}

/** Hash corto y determinista (FNV-1a) para claves de duplicados */
export function hash(s: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0).toString(36)
}

export function uid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}
