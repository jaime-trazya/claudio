import * as XLSX from 'xlsx'
import { decodeText } from './decode'
import { parseCSV, type Row } from './csv'

export type { Row, Cell } from './csv'

/**
 * Lee un extracto (CSV, TXT, XLS o XLSX) y devuelve sus filas.
 * Las hojas de cálculo se leen con SheetJS; los CSV con un lector propio
 * que no reinterpreta fechas al estilo estadounidense.
 */
export function readSheet(data: ArrayBuffer, fileName: string): Row[] {
  const ext = fileName.toLowerCase().split('.').pop() ?? ''
  const bytes = new Uint8Array(data)
  const isZip = bytes[0] === 0x50 && bytes[1] === 0x4b // XLSX
  const isOle = bytes[0] === 0xd0 && bytes[1] === 0xcf // XLS binario
  if (isZip || isOle || ext === 'xlsx' || ext === 'xls' || ext === 'ods') {
    if (!isZip && !isOle) {
      // Muchos bancos exportan "XLS" que en realidad es HTML o CSV
      const text = decodeText(bytes)
      if (!/<table|<html/i.test(text)) return parseCSV(text)
      const wb = XLSX.read(text, { type: 'string', cellDates: true, raw: true })
      return sheetRows(wb)
    }
    const wb = XLSX.read(bytes, { type: 'array', cellDates: true })
    return sheetRows(wb)
  }
  return parseCSV(decodeText(bytes))
}

function sheetRows(wb: XLSX.WorkBook): Row[] {
  // La hoja con más filas suele ser la de movimientos
  let best: Row[] = []
  for (const name of wb.SheetNames) {
    const ws = wb.Sheets[name]
    const rows = XLSX.utils.sheet_to_json<Row>(ws, { header: 1, raw: true, defval: null, blankrows: false })
    const clean = rows
      .map((r) => r.map((c) => (typeof c === 'string' ? c.trim() : c)))
      .filter((r) => r.some((c) => c !== null && c !== ''))
    if (clean.length > best.length) best = clean
  }
  return best
}
