export type Cell = string | number | Date | null
export type Row = Cell[]

/** Detecta el separador más probable mirando las primeras líneas */
export function detectDelimiter(text: string): string {
  const lines = text.split(/\r?\n/).filter((l) => l.trim()).slice(0, 30)
  const candidates = [';', ',', '\t', '|']
  let best = ';'
  let bestScore = -1
  for (const d of candidates) {
    const counts = lines.map((l) => splitLine(l, d).length)
    const multi = counts.filter((c) => c > 1)
    if (!multi.length) continue
    // Número de columnas más repetido × filas que lo tienen
    const freq = new Map<number, number>()
    for (const c of multi) freq.set(c, (freq.get(c) ?? 0) + 1)
    const [cols, times] = [...freq.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0]
    const score = times * 10 + cols
    if (score > bestScore) {
      bestScore = score
      best = d
    }
  }
  return best
}

function splitLine(line: string, d: string): string[] {
  const out: string[] = []
  let cur = ''
  let quoted = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (quoted) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"'
          i++
        } else quoted = false
      } else cur += ch
    } else if (ch === '"' && cur.trim() === '') {
      quoted = true
      cur = ''
    } else if (ch === d) {
      out.push(cur)
      cur = ''
    } else cur += ch
  }
  out.push(cur)
  return out
}

/** CSV → filas de texto. Respeta comillas y saltos de línea dentro de comillas. */
export function parseCSV(text: string, delimiter = detectDelimiter(text)): Row[] {
  const rows: Row[] = []
  let row: string[] = []
  let cur = ''
  let quoted = false
  const pushRow = () => {
    row.push(cur)
    cur = ''
    if (row.some((c) => c.trim() !== '')) rows.push(row.map((c) => c.trim()))
    row = []
  }
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cur += '"'
          i++
        } else quoted = false
      } else cur += ch
    } else if (ch === '"' && cur.trim() === '') {
      quoted = true
      cur = ''
    } else if (ch === delimiter) {
      row.push(cur)
      cur = ''
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++
      pushRow()
    } else cur += ch
  }
  if (cur !== '' || row.length) pushRow()
  return rows
}
