/** Abre el selector de archivos (en iPhone: app Archivos / iCloud Drive) */
export function pickFile(accept: string): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = accept
    input.style.position = 'fixed'
    input.style.left = '-1000px'
    let done = false
    const finish = (f: File | null) => {
      if (done) return
      done = true
      input.remove()
      resolve(f)
    }
    input.addEventListener('change', () => finish(input.files?.[0] ?? null))
    input.addEventListener('cancel', () => finish(null))
    document.body.appendChild(input)
    input.click()
  })
}

export const ACCEPT_STATEMENT = '.csv,.txt,.xls,.xlsx,.ods,text/csv,text/plain,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
export const ACCEPT_SHORTCUT = '.csv,.txt,text/csv,text/plain'
export const ACCEPT_PDF = '.pdf,application/pdf'
export const ACCEPT_JSON = '.json,application/json'

/**
 * Guarda un archivo: en iPhone abre la hoja de compartir ("Guardar en Archivos" → iCloud Drive);
 * en otros navegadores lo descarga. Devuelve false si el usuario cancela.
 */
export async function saveFile(content: string, fileName: string, type: string): Promise<boolean> {
  const blob = new Blob([content], { type })
  const file = new File([blob], fileName, { type })
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean }
  const isTouch = window.matchMedia('(pointer: coarse)').matches
  if (isTouch && nav.canShare?.({ files: [file] })) {
    try {
      await nav.share({ files: [file], title: fileName })
      return true
    } catch (e) {
      if ((e as DOMException).name === 'AbortError') return false
    }
  }
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 4000)
  return true
}

export function isIOS(): boolean {
  const ua = navigator.userAgent
  return /iPhone|iPad|iPod/.test(ua) || (ua.includes('Macintosh') && navigator.maxTouchPoints > 1)
}

export function isStandalone(): boolean {
  return (navigator as Navigator & { standalone?: boolean }).standalone === true || window.matchMedia('(display-mode: standalone)').matches
}
