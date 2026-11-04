import type { Account } from '../db/types'
import { parseAmount } from '../lib/money'
import { parseDate } from '../lib/dates'
import { hash, normalize } from '../lib/text'
import { parseCSV, detectDelimiter } from './csv'
import { decodeText } from './decode'

/**
 * Formato del archivo del Atajo (una línea por pago con Apple Pay):
 *
 *   fecha;comercio;importe;tarjeta
 *   2026-10-03 13:45;Mercadona;23,45;Visa Débito
 *
 * - fecha: "aaaa-mm-dd hh:mm" (también se aceptan dd/mm/aaaa y "3 oct 2026, 13:45")
 * - comercio: nombre que da Wallet
 * - importe: positivo, con coma o punto decimal y con o sin "€"
 * - tarjeta: nombre de la tarjeta en Wallet
 */
export const SHORTCUT_HEADER = 'fecha;comercio;importe;tarjeta'

export interface ShortcutPayment {
  externalId: string
  date: string
  merchant: string
  amount: number // céntimos, negativo (gasto)
  card: string
  line: number
}

export interface ShortcutParseResult {
  payments: ShortcutPayment[]
  errors: { line: number; text: string }[]
}

export function parseShortcutFile(data: ArrayBuffer | string): ShortcutParseResult {
  const text = typeof data === 'string' ? data : decodeText(data)
  // El Atajo puede escribir con ";" o con tabulador; si hay comas decimales nunca usamos ","
  let delimiter = detectDelimiter(text)
  if (delimiter === ',' && /\d,\d{2}\b/.test(text)) delimiter = ';'
  const rows = parseCSV(text, delimiter)
  const payments: ShortcutPayment[] = []
  const errors: { line: number; text: string }[] = []
  const seen = new Map<string, number>()
  rows.forEach((row, i) => {
    const cells = row.map((c) => String(c ?? '').trim())
    if (i === 0 && /fecha/i.test(cells[0] ?? '')) return // cabecera
    if (cells.every((c) => !c)) return
    const [rawDate, merchant, rawAmount, card = ''] = cells
    const date = parseDate(rawDate)
    const amount = parseAmount(rawAmount)
    if (!date || amount === null || !merchant) {
      errors.push({ line: i + 1, text: cells.join(';') })
      return
    }
    // Clave estable: misma línea = mismo pago. Si hay dos líneas idénticas se numeran.
    const base = hash(`${normalize(rawDate)}|${normalize(merchant)}|${Math.abs(amount)}|${normalize(card)}`)
    const n = (seen.get(base) ?? 0) + 1
    seen.set(base, n)
    payments.push({
      externalId: `atajo-${base}-${n}`,
      date,
      merchant: merchant.trim(),
      amount: rawAmount.trim().startsWith('+') ? Math.abs(amount) : -Math.abs(amount),
      card: card.trim(),
      line: i + 1,
    })
  })
  return { payments, errors }
}

/** Cuenta asociada a la tarjeta del Atajo (por el alias de tarjeta o el nombre de la cuenta) */
/** Cuenta cuyo alias de tarjeta (o nombre) coincide con la tarjeta del Atajo; null si ninguna */
export function matchCard(card: string, accounts: Account[]): string | null {
  const c = normalize(card)
  if (!c) return null
  const exact = accounts.find((a) => a.cardAlias && normalize(a.cardAlias) === c)
  if (exact) return exact.id
  const partial = accounts.find((a) => {
    const alias = normalize(a.cardAlias ?? '')
    return (alias && (c.includes(alias) || alias.includes(c))) || normalize(a.name) === c
  })
  return partial?.id ?? null
}

export function accountForCard(card: string, accounts: Account[], fallbackId: string | null): string | null {
  const m = matchCard(card, accounts)
  if (m) return m
  return fallbackId ?? accounts.find((a) => a.type === 'tarjeta')?.id ?? accounts.find((a) => a.type === 'banco')?.id ?? null
}

/** Pagos que aún no están guardados */
export function newPayments(payments: ShortcutPayment[], knownExternalIds: Set<string>): ShortcutPayment[] {
  return payments.filter((p) => !knownExternalIds.has(p.externalId))
}
