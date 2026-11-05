import { normalize } from '../lib/text'
import { HEADER_WORDS, score } from './detect'
import type { Row } from './csv'
import type { PdfItem, PdfLine } from './pdfText'

/**
 * Convierte un extracto bancario en PDF en filas de tabla, para reutilizar la misma
 * detección de columnas, vista previa y plantillas que los CSV/XLSX.
 *
 * Funciona con extractos de una línea por movimiento (p. ej. CaixaBank) y con los que reparten
 * cada movimiento en varias líneas (p. ej. Trade Republic: "10 abr" / importe / "2025"):
 * 1. Busca la cabecera (línea con "Fecha" + otra palabra de columna) y junta las partes de la
 *    cabecera escritas en varias líneas ("Entrada de" / "dinero").
 * 2. Asigna cada fragmento de texto a la columna según su posición horizontal.
 * 3. Cada línea con importes es un movimiento; las líneas cercanas sin importes son su continuación
 *    (fecha partida, concepto en dos líneas…) y se unen a la línea con importe más próxima.
 * 4. Un PDF puede tener varias tablas (Revolut: cuenta, ahorro…): se devuelven por separado.
 */

export interface PdfTable {
  label: string
  rows: Row[] // la primera fila es la cabecera
  movements: number
}

interface Column {
  x: number
  /** Borde derecho de la cabecera, si pdf.js dio el ancho del texto */
  right?: number
  label: string
}

const AMOUNT_RE = /-?\d[\d.]*,\d{2}\b/
const DATE_START = /^(\d{1,2}[/.-]\d{1,2}(?:[/.-]\d{2,4})?|\d{1,2}\s+[a-záéíóú]{3,5}\.?(?:\s+\d{4})?)(?:\s+(.*))?$/i
const STOP_WORDS = /^(notas sobre|resumen del balance|pagina \d|creado en|www\.|informacion sobre)/

const GROUPS = Object.values(HEADER_WORDS)

function isWordy(item: PdfItem) {
  return !/\d/.test(item.str) && item.str.length <= 40
}

/** ¿Es esta línea una cabecera de tabla? Devuelve sus columnas (fusionando cabeceras multilínea) */
function headerColumns(lines: PdfLine[], i: number): Column[] | null {
  const line = lines[i]
  if (!line.items.every(isWordy)) return null
  const cells = line.items.map((it) => normalize(it.str))
  const hasDate = cells.some((c) => score(c, HEADER_WORDS.date) > 0)
  const groups = new Set(line.items.flatMap((it) => GROUPS.map((g, gi) => (score(it.str, g) > 0 ? gi : -1)).filter((g) => g >= 0)))
  if (!hasDate || groups.size < 2) return null
  // Fragmentos de cabecera en las líneas pegadas (arriba y abajo)
  const frags: PdfItem[] = [...line.items]
  for (const j of [i - 2, i - 1, i + 1, i + 2]) {
    const l = lines[j]
    if (!l || l.page !== line.page || Math.abs(l.y - line.y) > 14) continue
    if (l.items.every(isWordy)) frags.push(...l.items)
  }
  frags.sort((a, b) => b.y - a.y) // de arriba abajo
  const cols: Column[] = []
  for (const it of frags) {
    const c = cols.find((c) => Math.abs(c.x - it.x) <= 12)
    const right = it.w !== undefined ? it.x + it.w : undefined
    if (c) {
      c.label = `${c.label} ${it.str}`.trim()
      c.x = Math.min(c.x, it.x)
      if (right !== undefined) c.right = Math.max(c.right ?? right, right)
    } else cols.push({ x: it.x, label: it.str, ...(right !== undefined ? { right } : {}) })
  }
  cols.sort((a, b) => a.x - b.x)
  return cols.map((c) => ({ ...c, label: c.label.replace(/\s*\/\s*/g, ' / ').replace(/\s+/g, ' ') }))
}

const signature = (cols: Column[]) => cols.map((c) => normalize(c.label)).join('|')

function columnOf(cols: Column[], it: PdfItem): number {
  // Un importe suele ir alineado a la derecha bajo su cabecera: un número ancho («12.345,67») bajo
  // una cabecera corta («Saldo») empieza bastante más a la izquierda que ella. Con los anchos de
  // pdf.js se elige la columna con la que más se solapa, en vez de comparar solo el borde izquierdo.
  if (it.w !== undefined && AMOUNT_RE.test(it.str) && cols.every((c) => c.right !== undefined)) {
    const end = it.x + it.w
    let best = -1
    let bestOverlap = 0
    cols.forEach((c, i) => {
      const overlap = Math.min(end, c.right!) - Math.max(it.x, c.x)
      if (overlap > bestOverlap) {
        bestOverlap = overlap
        best = i
      }
    })
    if (best >= 0) return best
  }
  let idx = 0
  for (let c = 0; c < cols.length; c++) if (cols[c].x <= it.x + 10) idx = c
  return idx
}

/** Etiqueta de la tabla: la línea de título más cercana por encima ("Cuenta personal (EUR)") */
function tableLabel(lines: PdfLine[], i: number, n: number): string {
  for (let j = i - 1; j >= Math.max(0, i - 12); j--) {
    const t = lines[j].text
    if (/\([A-Z]{3}\)/.test(t) && t.length < 60) return t
  }
  return `Tabla ${n}`
}

export function pdfToTables(lines: PdfLine[]): PdfTable[] {
  // 1. Localizar cabeceras
  const headers: { i: number; cols: Column[]; sig: string }[] = []
  const fragmentLines = new Set<number>()
  for (let i = 0; i < lines.length; i++) {
    const cols = headerColumns(lines, i)
    if (!cols) continue
    headers.push({ i, cols, sig: signature(cols) })
    for (const j of [i - 2, i - 1, i + 1, i + 2]) {
      const l = lines[j]
      if (l && l.page === lines[i].page && Math.abs(l.y - lines[i].y) <= 14 && l.items.every(isWordy)) fragmentLines.add(j)
    }
  }
  if (!headers.length) return []

  // 2. Regiones: de cada cabecera a la siguiente. Las cabeceras repetidas en cada página
  //    continúan la misma tabla, pero con las posiciones de columna de esa página.
  const tables: (PdfTable & { sig: string })[] = []
  let current: (PdfTable & { sig: string }) | null = null
  for (let h = 0; h < headers.length; h++) {
    const { i, cols, sig } = headers[h]
    if (!current || current.sig !== sig) {
      const label = tableLabel(lines, i, tables.length + 1)
      current = tables.find((t) => t.sig === sig && t.label === label) ?? null
      if (!current) {
        current = { label, rows: [cols.map((c) => c.label)], movements: 0, sig }
        tables.push(current)
      }
    }
    const end = h + 1 < headers.length ? headers[h + 1].i : lines.length
    const region: number[] = []
    for (let j = i + 1; j < end; j++) if (!fragmentLines.has(j)) region.push(j)
    for (const row of buildRows(lines, region, cols)) {
      current.rows.push(row)
      current.movements++
    }
  }
  return tables.filter((t) => t.movements > 0).map(({ label, rows, movements }) => ({ label, rows, movements }))
}

function buildRows(lines: PdfLine[], region: number[], cols: Column[]): Row[] {
  const amountCols = cols
    .map((c, idx) => ({ c, idx }))
    .filter(({ c }) => [HEADER_WORDS.amount, HEADER_WORDS.debit, HEADER_WORDS.credit, HEADER_WORDS.balance].some((g) => score(c.label, g) > 0))
  const minAmountX = amountCols.length ? Math.min(...amountCols.map(({ c }) => c.x)) - 10 : cols[cols.length - 1].x - 10
  const dateCol = cols.findIndex((c) => score(c.label, HEADER_WORDS.date) > 0)

  const anchors: number[] = []
  const others: number[] = []
  for (const j of region) {
    const l = lines[j]
    if (STOP_WORDS.test(normalize(l.text))) continue
    if (l.items.some((it) => it.x >= minAmountX && AMOUNT_RE.test(it.str))) anchors.push(j)
    else others.push(j)
  }
  if (!anchors.length) return []

  // Separación típica entre movimientos para decidir qué líneas son continuación
  const gaps: number[] = []
  for (let k = 1; k < anchors.length; k++) {
    const a = lines[anchors[k - 1]]
    const b = lines[anchors[k]]
    if (a.page === b.page) gaps.push(a.y - b.y)
  }
  gaps.sort((a, b) => a - b)
  const typical = gaps.length ? gaps[Math.floor(gaps.length / 2)] : 20
  const maxDist = Math.min(26, Math.max(9, typical * 0.75))

  const groups = new Map<number, number[]>(anchors.map((a) => [a, [a]]))
  for (const j of others) {
    const l = lines[j]
    let best: number | null = null
    let bestD = Infinity
    for (const a of anchors) {
      const al = lines[a]
      if (al.page !== l.page) continue
      const d = Math.abs(al.y - l.y)
      if (d < bestD) {
        bestD = d
        best = a
      }
    }
    if (best !== null && bestD <= maxDist) groups.get(best)!.push(j)
  }

  const rows: Row[] = []
  for (const a of anchors) {
    const members = groups.get(a)!.map((j) => lines[j]).sort((x, y) => y.y - x.y)
    const cells: string[] = cols.map(() => '')
    const put = (c: number, s: string) => {
      cells[c] = cells[c] ? `${cells[c]} ${s}` : s
    }
    for (const l of members) {
      for (const it of l.items) {
        const c = columnOf(cols, it)
        if (c === dateCol) {
          // "18 jul 2025 Operar": la fecha se queda, el resto pasa a la columna siguiente
          const m = it.str.match(DATE_START)
          if (m && m[2] && dateCol + 1 < cols.length) {
            put(c, m[1])
            put(c + 1, m[2])
            continue
          }
        }
        put(c, it.str)
      }
    }
    if (dateCol >= 0) cells[dateCol] = cells[dateCol].replace(/\s*\/\s*/g, '/').replace(/\s+/g, ' ').trim()
    rows.push(cells.map((c) => c.replace(/\s+(€|EUR)$/i, ' €').trim() || null))
  }
  return rows
}
