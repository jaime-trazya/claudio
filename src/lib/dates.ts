/** Fechas como texto ISO "AAAA-MM-DD" (sin zona horaria) para evitar desfases. */
export type ISODate = string

const pad = (n: number) => String(n).padStart(2, '0')

export function toISO(d: Date): ISODate {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export function fromISO(s: ISODate): Date {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export const todayISO = (): ISODate => toISO(new Date())

/** ¿Es una fecha "AAAA-MM-DD" real? (rechaza vacías y fechas imposibles) */
export function isValidISO(s: unknown): s is ISODate {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false
  const [y, m, d] = s.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  return date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d
}

function valid(y: number, m: number, d: number): ISODate | null {
  if (y < 100) y += y > 70 ? 1900 : 2000
  if (m < 1 || m > 12 || d < 1 || d > 31 || y < 1970 || y > 2100) return null
  const date = new Date(y, m - 1, d)
  if (date.getMonth() !== m - 1) return null
  return `${y}-${pad(m)}-${pad(d)}`
}

/** Serial de fecha de Excel (días desde 1899-12-30) */
export function excelSerialToISO(serial: number): ISODate | null {
  if (!Number.isFinite(serial) || serial < 20000 || serial > 80000) return null
  const ms = Math.round((serial - 25569) * 86400 * 1000)
  const d = new Date(ms)
  return valid(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate())
}

const MONTHS_ES: Record<string, number> = {
  ene: 1, feb: 2, mar: 3, abr: 4, may: 5, jun: 6, jul: 7, ago: 8, sep: 9, sept: 9, oct: 10, nov: 11, dic: 12,
}

/**
 * Interpreta una fecha en los formatos habituales de bancos españoles.
 * dd/mm/aaaa, dd-mm-aa, dd.mm.aaaa, aaaa-mm-dd, "3 oct 2026", Date, serial de Excel.
 * Siempre día antes que mes (nunca formato estadounidense) salvo ISO.
 */
export function parseDate(input: unknown): ISODate | null {
  if (input === null || input === undefined || input === '') return null
  if (input instanceof Date) {
    if (Number.isNaN(input.getTime())) return null
    // Las hojas de cálculo guardan fechas a medianoche, a veces con segundos de desfase:
    // redondeamos a la medianoche más cercana
    const d = new Date(input.getTime() + 12 * 3600 * 1000)
    d.setHours(0, 0, 0, 0)
    return valid(d.getFullYear(), d.getMonth() + 1, d.getDate())
  }
  if (typeof input === 'number') return excelSerialToISO(input)
  const s = String(input)
    .trim()
    .replace(/[,\s]+(a las\s+)?\d{1,2}:\d{2}(:\d{2})?(\s*h)?$/i, '')
  let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[T\s].*)?$/)
  if (m) return valid(+m[1], +m[2], +m[3])
  m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2}|\d{4})(?:\s+\d{1,2}:\d{2}(?::\d{2})?)?$/)
  if (m) return valid(+m[3], +m[2], +m[1])
  m = s.match(/^(\d{1,2})[\s-]+(?:de\s+)?([a-záéíóú]{3,4})[a-záéíóú]*\.?[\s-]+(?:de\s+)?(\d{2,4})$/i)
  if (m) {
    const month = MONTHS_ES[m[2].toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').slice(0, 4)] ??
      MONTHS_ES[m[2].toLowerCase().slice(0, 3)]
    if (month) return valid(+m[3], month, +m[1])
  }
  if (/^\d{5}(\.\d+)?$/.test(s)) return excelSerialToISO(Number(s))
  return null
}

export function addDays(iso: ISODate, days: number): ISODate {
  const d = fromISO(iso)
  d.setDate(d.getDate() + days)
  return toISO(d)
}

export function daysBetween(a: ISODate, b: ISODate): number {
  return Math.round((fromISO(b).getTime() - fromISO(a).getTime()) / 86400000)
}

export function addMonths(iso: ISODate, months: number): ISODate {
  const d = fromISO(iso)
  const day = d.getDate()
  d.setDate(1)
  d.setMonth(d.getMonth() + months)
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()
  d.setDate(Math.min(day, last))
  return toISO(d)
}

export interface DateRange {
  start: ISODate // incluido
  end: ISODate // incluido
}

/**
 * Mes contable que contiene la fecha. Si el mes empieza el día 25,
 * el "mes de octubre" va del 25 de septiembre al 24 de octubre.
 */
export function accountingMonth(iso: ISODate, startDay = 1): DateRange & { key: string } {
  const d = fromISO(iso)
  let y = d.getFullYear()
  let m = d.getMonth() // 0-11, mes "etiqueta"
  if (startDay > 1 && d.getDate() >= startDay) {
    m += 1
    if (m > 11) {
      m = 0
      y += 1
    }
  }
  return monthRange(y, m, startDay)
}

/** Rango del mes contable etiquetado como (año, mes 0-11) */
export function monthRange(year: number, month0: number, startDay = 1): DateRange & { key: string } {
  const key = `${year}-${pad(month0 + 1)}`
  if (startDay <= 1) {
    const last = new Date(year, month0 + 1, 0).getDate()
    return { key, start: `${key}-01`, end: `${key}-${pad(last)}` }
  }
  const prev = new Date(year, month0 - 1, 1)
  const prevLast = new Date(prev.getFullYear(), prev.getMonth() + 1, 0).getDate()
  const start = toISO(new Date(prev.getFullYear(), prev.getMonth(), Math.min(startDay, prevLast)))
  const curLast = new Date(year, month0 + 1, 0).getDate()
  const end = addDays(toISO(new Date(year, month0, Math.min(startDay, curLast))), -1)
  return { key, start, end }
}

export function shiftMonth(key: string, delta: number): { year: number; month0: number } {
  const [y, m] = key.split('-').map(Number)
  const d = new Date(y, m - 1 + delta, 1)
  return { year: d.getFullYear(), month0: d.getMonth() }
}

export function inRange(iso: ISODate, r: DateRange): boolean {
  return iso >= r.start && iso <= r.end
}

const MONTH_NAMES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
const MONTH_SHORT = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

export const monthName = (month0: number) => MONTH_NAMES[month0]
export const monthShort = (month0: number) => MONTH_SHORT[month0]

export function monthLabel(key: string, withYear = true): string {
  const [y, m] = key.split('-').map(Number)
  const name = MONTH_NAMES[m - 1]
  return withYear ? `${name[0].toUpperCase()}${name.slice(1)} ${y}` : name
}

export function formatDay(iso: ISODate, today = todayISO()): string {
  if (!isValidISO(iso)) return 'Sin fecha'
  if (iso === today) return 'Hoy'
  if (iso === addDays(today, -1)) return 'Ayer'
  const d = fromISO(iso)
  const text = new Intl.DateTimeFormat('es-ES', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    ...(d.getFullYear() !== fromISO(today).getFullYear() ? { year: 'numeric' } : {}),
  }).format(d)
  return text[0].toUpperCase() + text.slice(1)
}

export function formatShortDate(iso: ISODate): string {
  if (!isValidISO(iso)) return 'sin fecha'
  const d = fromISO(iso)
  return `${d.getDate()} ${MONTH_SHORT[d.getMonth()]} ${d.getFullYear()}`
}

export function formatDMY(iso: ISODate): string {
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

/** Número de meses naturales que abarca un rango (ambos incluidos) */
export function monthsBetween(start: ISODate, end: ISODate): number {
  const [y1, m1] = start.split('-').map(Number)
  const [y2, m2] = end.split('-').map(Number)
  return (y2 - y1) * 12 + (m2 - m1) + 1
}

/** "hace 5 min", "ayer", "hace 3 días" */
export function relativeTime(ts: number): string {
  const mins = Math.round((Date.now() - ts) / 60000)
  if (mins < 1) return 'ahora mismo'
  if (mins < 60) return `hace ${mins} min`
  const hours = Math.round(mins / 60)
  if (hours < 24) return `hace ${hours} h`
  const d = new Date(ts)
  const days = daysBetween(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`, todayISO())
  return days === 1 ? 'ayer' : `hace ${days} días`
}

