/**
 * Extrae el texto de un PDF con pdf.js, conservando la posición de cada fragmento.
 * Recibe el módulo de pdf.js para poder usarlo tanto en el navegador como en los tests (Node).
 */

export interface PdfItem {
  str: string
  x: number
  y: number
  page: number
  /** Ancho del texto (pdf.js lo da); sirve para alinear importes a la derecha con su columna */
  w?: number
}

export interface PdfLine {
  page: number
  y: number
  items: PdfItem[]
  text: string
}

interface TextItemLike {
  str: string
  transform: number[]
  width?: number
}

interface PdfjsLike {
  getDocument(src: { data: Uint8Array; [k: string]: unknown }): {
    promise: Promise<{
      numPages: number
      getPage(n: number): Promise<{ getTextContent(): Promise<{ items: unknown[] }> }>
    }>
    destroy(): Promise<void>
  }
}

export async function extractPdfItems(data: ArrayBuffer | Uint8Array, pdfjs: PdfjsLike, options: Record<string, unknown> = {}): Promise<PdfItem[]> {
  // pdf.js puede quedarse con el buffer: trabajamos con una copia
  const bytes = new Uint8Array(data instanceof Uint8Array ? data : new Uint8Array(data))
  const task = pdfjs.getDocument({ data: bytes, isEvalSupported: false, ...options })
  const doc = await task.promise
  const out: PdfItem[] = []
  try {
    for (let p = 1; p <= doc.numPages; p++) {
      const page = await doc.getPage(p)
      const content = await page.getTextContent()
      for (const i of content.items as TextItemLike[]) {
        if (typeof i.str !== 'string' || !i.str.trim()) continue
        out.push({ str: i.str.trim(), x: i.transform[4], y: i.transform[5], page: p, ...(typeof i.width === 'number' && i.width > 0 ? { w: i.width } : {}) })
      }
    }
  } finally {
    await task.destroy()
  }
  return out
}

/** Agrupa los fragmentos en líneas (misma página y misma altura), de arriba abajo */
export function itemsToLines(items: PdfItem[]): PdfLine[] {
  const lines: PdfLine[] = []
  const byPage = new Map<number, PdfItem[]>()
  for (const it of items) {
    const list = byPage.get(it.page)
    if (list) list.push(it)
    else byPage.set(it.page, [it])
  }
  for (const page of [...byPage.keys()].sort((a, b) => a - b)) {
    const rows: { y: number; items: PdfItem[] }[] = []
    for (const it of byPage.get(page)!) {
      const row = rows.find((r) => Math.abs(r.y - it.y) <= 2.5)
      if (row) row.items.push(it)
      else rows.push({ y: it.y, items: [it] })
    }
    rows.sort((a, b) => b.y - a.y)
    for (const r of rows) {
      const sorted = r.items.sort((a, b) => a.x - b.x)
      lines.push({ page, y: r.y, items: sorted, text: sorted.map((i) => i.str).join(' ').replace(/\s+/g, ' ').trim() })
    }
  }
  return lines
}

export async function extractPdfLines(data: ArrayBuffer | Uint8Array, pdfjs: PdfjsLike, options: Record<string, unknown> = {}): Promise<string[]> {
  return itemsToLines(await extractPdfItems(data, pdfjs, options)).map((l) => l.text)
}

async function browserPdfjs(): Promise<PdfjsLike> {
  // Versión «legacy»: la normal de pdf.js 6 usa funciones de JavaScript muy recientes
  // (Uint8Array.prototype.toHex) que no tienen los iPhone sin la última versión de iOS, y entonces
  // ningún PDF se puede abrir. La legacy trae esas funciones incluidas. Es la misma que usan los tests.
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const worker = await import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url')
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default
  return pdfjs as unknown as PdfjsLike
}

/** Lee un PDF en el navegador (con su worker empaquetado por Vite), sin enviarlo a ningún sitio */
export async function readPdfInBrowser(data: ArrayBuffer): Promise<string[]> {
  return extractPdfLines(data, await browserPdfjs())
}

export async function readPdfLinesInBrowser(data: ArrayBuffer): Promise<PdfLine[]> {
  return itemsToLines(await extractPdfItems(data, await browserPdfjs()))
}
