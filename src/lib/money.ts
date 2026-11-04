/**
 * Dinero en céntimos enteros para evitar errores de coma flotante.
 * Los gastos son negativos y los ingresos positivos.
 */

export type Cents = number

export const toCents = (euros: number): Cents => Math.round(euros * 100)
export const fromCents = (cents: Cents): number => cents / 100

/**
 * Convierte un importe escrito en cualquier formato habitual a céntimos.
 * Acepta: "1.234,56", "-1.234,56 €", "1,234.56", "1234.56", "(12,50)", "12,50-",
 * "+3,00", "€12.34", "12,34 EUR", números ya numéricos.
 * Devuelve null si no es un importe.
 */
export function parseAmount(input: unknown): Cents | null {
  if (input === null || input === undefined) return null
  if (typeof input === 'number') return Number.isFinite(input) ? toCents(input) : null
  let s = String(input).trim()
  if (!s) return null
  let negative = false
  // Paréntesis contables: (12,50)
  if (/^\(.*\)$/.test(s)) {
    negative = true
    s = s.slice(1, -1)
  }
  // Signo menos final: 12,50-
  if (/-\s*$/.test(s) && !/^-/.test(s)) {
    negative = true
    s = s.replace(/-\s*$/, '')
  }
  // Quita moneda y espacios (incluidos espacios duros)
  s = s.replace(/eur(os)?|€|\$|usd|\s|\u00a0|\u202f/gi, '')
  if (/^[-−–]/.test(s)) {
    negative = !negative
    s = s.slice(1)
  } else if (s.startsWith('+')) {
    s = s.slice(1)
  }
  if (!/^[\d.,']+$/.test(s) || !/\d/.test(s)) return null
  s = s.replace(/'/g, '')

  const lastComma = s.lastIndexOf(',')
  const lastDot = s.lastIndexOf('.')
  let normalized: string
  if (lastComma >= 0 && lastDot >= 0) {
    // El separador que aparece el último es el decimal
    if (lastComma > lastDot) normalized = s.replace(/\./g, '').replace(',', '.')
    else normalized = s.replace(/,/g, '')
  } else if (lastComma >= 0) {
    const parts = s.split(',')
    if (parts.length > 2) normalized = parts.join('') // 1,234,567 → miles
    else normalized = s.replace(',', '.') // coma decimal (formato español)
  } else if (lastDot >= 0) {
    const parts = s.split('.')
    const decimals = parts[parts.length - 1]
    // "1.234" o "12.345.678" → separador de miles (formato español)
    if (parts.length > 2 || (decimals.length === 3 && parts[0].length <= 3 && parts[0] !== '0')) {
      normalized = parts.join('')
    } else normalized = s
  } else normalized = s

  const value = Number(normalized)
  if (!Number.isFinite(value)) return null
  const cents = toCents(value)
  return negative ? -cents : cents
}

const formatters = new Map<string, Intl.NumberFormat>()

function formatter(currency: string, decimals: boolean): Intl.NumberFormat {
  const key = `${currency}-${decimals}`
  let f = formatters.get(key)
  if (!f) {
    f = new Intl.NumberFormat('es-ES', {
      style: 'currency',
      currency,
      minimumFractionDigits: decimals ? 2 : 0,
      maximumFractionDigits: decimals ? 2 : 0,
      useGrouping: 'always' as unknown as boolean,
    })
    formatters.set(key, f)
  }
  return f
}

export interface FormatOptions {
  currency?: string
  /** Muestra "+" en los positivos (ingresos) */
  sign?: boolean
  /** Sin decimales (para ejes de gráficas) */
  compact?: boolean
}

export function formatMoney(cents: Cents, opts: FormatOptions = {}): string {
  const { currency = 'EUR', sign = false, compact = false } = opts
  const text = formatter(currency, !compact).format(fromCents(compact ? Math.round(cents / 100) * 100 : cents))
  if (sign && cents > 0) return `+${text}`
  // Signo menos tipográfico
  return text.replace('-', '−')
}

/** Divide un importe en entero y decimales para pintarlos con distinto tamaño */
export function splitMoney(cents: Cents, currency = 'EUR'): { main: string; decimals: string } {
  const text = formatMoney(cents, { currency })
  const m = text.match(/^(.*?)(,\d{2})(.*)$/)
  if (!m) return { main: text, decimals: '' }
  return { main: m[1], decimals: m[2] + m[3] }
}

export function formatPercent(ratio: number, digits = 0): string {
  if (!Number.isFinite(ratio)) return '—'
  return new Intl.NumberFormat('es-ES', {
    style: 'percent',
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(ratio)
}

/** Número en formato español sin moneda (unidades de un valor, por ejemplo) */
export function formatNumber(n: number, maxDecimals = 6): string {
  return new Intl.NumberFormat('es-ES', { maximumFractionDigits: maxDecimals }).format(n)
}

/** Lee un número decimal español ("12,345678") sin redondear a céntimos */
export function parseDecimal(input: unknown): number | null {
  if (typeof input === 'number') return Number.isFinite(input) ? input : null
  if (input === null || input === undefined) return null
  let s = String(input).trim().replace(/\s|\u00a0/g, '').replace(/eur|€/gi, '')
  if (!/^[-+]?[\d.,]+$/.test(s)) return null
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.')
  else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '')
  const v = Number(s)
  return Number.isFinite(v) ? v : null
}

/** Tasa de ahorro legible: fuera de ±100 % no aporta nada ("gastaste 8 veces lo que ingresaste") */
export function formatRate(rate: number | null): string {
  if (rate === null || !Number.isFinite(rate)) return '—'
  if (rate < -1) return '< −100 %'
  return formatPercent(rate).replace('-', '−')
}
