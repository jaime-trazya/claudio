import type { Position, PositionKind } from '../db/types'
import { parseAmount, parseDecimal } from '../lib/money'
import { hash, normalize } from '../lib/text'

/**
 * Lector del PDF "Extracto del patrimonio neto" de Trade Republic.
 * Recibe el texto del PDF agrupado en líneas (ver pdfText.ts) y extrae:
 * fecha, posiciones de la cuenta de valores, criptoactivos, efectivo y total.
 * Números en formato español (1.234,56) y fechas dd.mm.aaaa.
 */

export interface TRStatement {
  date: string | null
  positions: Position[]
  cash: number
  total: number
  /** Total que figura en el PDF (si aparece) */
  declaredTotal: number | null
  warnings: string[]
  fingerprint: string
}

type Section = 'inicio' | 'resumen' | 'valores' | 'cripto' | 'efectivo'

const ISIN_RE = /\b([A-Z]{2}[A-Z0-9]{9}\d)\b/
const DATE_RE = /\b(\d{2})\.(\d{2})\.(\d{4})\b/
const NUM = String.raw`-?\d{1,3}(?:\.\d{3})*(?:,\d+)?|-?\d+(?:,\d+)?`
const POSITION_RE = new RegExp(
  String.raw`^(${NUM})\s*(?:uds?\.?|unidades|stk\.?|t[ií]tulos|pcs\.?)?\s+(.+?)\s+(${NUM})\s*(?:EUR|€)?\s+(${NUM})\s*(?:EUR|€)?$`,
  'i',
)
// Importe con decimales al final de la línea ("312,45 EUR"); evita confundir "Página 1 de 2"
const AMOUNT_AT_END = new RegExp(String.raw`(-?\d{1,3}(?:\.\d{3})*,\d{2}|-?\d+,\d{2})\s*(?:EUR|€)?\s*$`, 'i')

function sectionOf(text: string): Section | null {
  const n = normalize(text)
  const hasNumber = /\d/.test(text)
  if (hasNumber) return null
  if (/^(resumen de la )?cartera$|^resumen$|^vision general$/.test(n)) return 'resumen'
  if (/^cuenta de valores$|^depot$|^valores$/.test(n)) return 'valores'
  if (/^(wallet )?crypto$|^wallet crypto$|^criptomonedas$|^criptoactivos$|^cripto$|^wallet cripto$/.test(n)) return 'cripto'
  if (/^efectivo$|^cuenta de efectivo$|^saldo en efectivo$/.test(n)) return 'efectivo'
  return null
}

const isHeaderLine = (n: string) =>
  /unidades nominal|^unidades$|descripcion|nombre del valor|precio por|valor de mercado|valor del mercado|valor en eur|numero de posiciones|^total|^pagina|^page|isin$/.test(n)

/** Líneas informativas que no forman parte del nombre del valor */
const isInfoLine = (n: string) => /^(cuenta de valores en|pais de custodia|extracto de|creado en|trade republic bank|www|nif|c velazquez|domicilio|registrad|directores)/.test(n)

function guessKind(name: string, section: Section, isin?: string): PositionKind {
  if (section === 'cripto') return 'cripto'
  if (/\b(etf|etc|ucits|ishares|vanguard|xtrackers|amundi|spdr|lyxor|invesco|wisdomtree|msci|s&p|stoxx|ftse|index|acc|dist)\b/i.test(name)) return 'etf'
  if (isin && /^(IE|LU)/.test(isin) && /fund|fondo|trust|plc/i.test(name)) return 'etf'
  return 'accion'
}

function cleanName(name: string): string {
  return name
    .replace(ISIN_RE, '')
    .replace(/\bISIN:?\s*/i, '')
    .replace(DATE_RE, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

export function parseTradeRepublic(lines: string[]): TRStatement {
  const warnings: string[] = []
  const positions: Position[] = []
  let section: Section = 'inicio'
  let date: string | null = null
  let cash: number | null = null
  let declaredTotal: number | null = null
  let summaryCash: number | null = null
  let current: Position | null = null

  const clean = lines.map((l) => l.replace(/\s+/g, ' ').trim()).filter(Boolean)

  // Fecha del extracto: la primera fecha cerca de "fecha" / "a " / "patrimonio"
  for (const l of clean.slice(0, 25)) {
    const m = l.match(DATE_RE)
    if (m && /fecha|patrimonio|extracto|a \d{2}\.|^a\b|al \d/i.test(l)) {
      date = `${m[3]}-${m[2]}-${m[1]}`
      break
    }
  }
  if (!date) {
    const m = clean.join(' ').match(DATE_RE)
    if (m) date = `${m[3]}-${m[2]}-${m[1]}`
  }

  for (const line of clean) {
    const sec = sectionOf(line)
    if (sec) {
      section = sec
      current = null
      continue
    }
    const n = normalize(line)

    if (section === 'resumen' || section === 'inicio') {
      const am = line.match(AMOUNT_AT_END)
      if (am && /efectivo/.test(n)) summaryCash = parseAmount(am[1])
      if (am && /^(total|patrimonio neto|patrimonio total)/.test(n)) declaredTotal = parseAmount(am[1])
      continue
    }

    if (section === 'efectivo') {
      const am = line.match(AMOUNT_AT_END)
      if (am && !DATE_RE.test(line.slice(-12))) {
        const v = parseAmount(am[1])
        if (v !== null && (/saldo|efectivo|total|eur|€/i.test(line) || cash === null)) cash = v
      }
      if (am && /^(total|patrimonio)/.test(n) && /patrimonio/.test(n)) declaredTotal = parseAmount(am[1])
      continue
    }

    // valores o cripto
    const pm = line.match(POSITION_RE)
    if (pm && !isHeaderLine(n)) {
      const units = parseDecimal(pm[1])
      const price = parseDecimal(pm[3])
      const value = parseAmount(pm[4])
      if (units !== null && price !== null && value !== null) {
        const isin = line.match(ISIN_RE)?.[1]
        let name = cleanName(pm[2]).replace(/^(unidades|uds?\.?)\s+/i, '')
        let symbol: string | undefined
        const sym = name.match(/\(([A-Z0-9]{2,6})\)/)
        if (section === 'cripto') {
          if (sym) symbol = sym[1]
          else {
            const tok = name.split(' ').find((w) => /^[A-Z]{2,6}$/.test(w))
            if (tok) symbol = tok
          }
        }
        name = name.replace(/\s+/g, ' ')
        current = { name, isin, symbol, kind: guessKind(name, section, isin), units, price, value }
        positions.push(current)
        continue
      }
    }
    if (current) {
      const isin = line.match(ISIN_RE)?.[1]
      if (isin && !current.isin) {
        current.isin = isin
        if (current.kind !== 'cripto') current.kind = guessKind(current.name, section, isin)
        const rest = cleanName(line).replace(/\bunidades\b/i, '').trim()
        if (rest && !/\d/.test(rest) && rest.length > 2) current.name = `${current.name} ${rest}`.trim()
        continue
      }
      // Cripto: el símbolo va en la línea siguiente ("LTC 04.11.2026")
      if (section === 'cripto' && !current.symbol) {
        const sym = cleanName(line).match(/^([A-Z0-9]{2,6})$/)
        if (sym) {
          current.symbol = sym[1]
          continue
        }
      }
      if (isInfoLine(n) || /^unidades$/.test(n)) continue
      // Continuación del nombre: texto sin números que no es cabecera ni total
      if (!/\d/.test(line) && !isHeaderLine(n) && line.length < 80) {
        current.name = `${current.name} ${line}`.trim()
        if (current.kind !== 'cripto') current.kind = guessKind(current.name, section, current.isin)
        continue
      }
      if (/^total|numero de posiciones/.test(n)) current = null
    }
  }

  const finalCash = cash ?? summaryCash ?? 0
  const sum = positions.reduce((s, p) => s + p.value, 0) + finalCash
  const total = declaredTotal ?? sum
  if (declaredTotal !== null && Math.abs(declaredTotal - sum) > 100) {
    warnings.push('La suma de las posiciones no coincide con el total del extracto. Revisa los datos.')
  }
  if (!positions.length && cash === null && summaryCash === null) warnings.push('No se ha encontrado ninguna posición ni efectivo.')
  if (!date) warnings.push('No se ha encontrado la fecha del extracto.')

  const fingerprint = hash(
    [date, total, finalCash, ...positions.map((p) => `${p.isin ?? p.symbol ?? p.name}:${p.units}:${p.value}`)].join('|'),
  )
  return { date, positions, cash: finalCash, total, declaredTotal, warnings, fingerprint }
}
