/**
 * Extrae el texto de un PDF agrupado en líneas, con pdf.js.
 * Recibe el módulo de pdf.js para poder usarlo tanto en el navegador como en los tests (Node).
 */

interface TextItemLike {
  str: string
  transform: number[]
  width: number
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

export async function extractPdfLines(
  data: ArrayBuffer | Uint8Array,
  pdfjs: PdfjsLike,
  options: Record<string, unknown> = {},
): Promise<string[]> {
  // pdf.js puede quedarse con el buffer: trabajamos con una copia
  const bytes = new Uint8Array(data instanceof Uint8Array ? data : new Uint8Array(data))
  const task = pdfjs.getDocument({ data: bytes, isEvalSupported: false, ...options })
  const doc = await task.promise
  const lines: string[] = []
  try {
    for (let p = 1; p <= doc.numPages; p++) {
      const page = await doc.getPage(p)
      const content = await page.getTextContent()
      const items = (content.items as TextItemLike[]).filter((i) => typeof i.str === 'string' && i.str.trim() !== '')
      lines.push(...groupLines(items))
    }
  } finally {
    await task.destroy()
  }
  return lines
}

export function groupLines(items: TextItemLike[]): string[] {
  const rows: { y: number; items: TextItemLike[] }[] = []
  for (const it of items) {
    const y = it.transform[5]
    const row = rows.find((r) => Math.abs(r.y - y) <= 2.5)
    if (row) row.items.push(it)
    else rows.push({ y, items: [it] })
  }
  rows.sort((a, b) => b.y - a.y)
  return rows.map((r) =>
    r.items
      .sort((a, b) => a.transform[4] - b.transform[4])
      .map((i) => i.str.trim())
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim(),
  )
}

/** Carga pdf.js en el navegador (con su worker empaquetado por Vite) */
export async function readPdfInBrowser(data: ArrayBuffer): Promise<string[]> {
  const pdfjs = await import('pdfjs-dist')
  const worker = await import('pdfjs-dist/build/pdf.worker.min.mjs?url')
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default
  return extractPdfLines(data, pdfjs as unknown as PdfjsLike)
}
