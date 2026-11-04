import { useState } from 'react'
import { useToast } from './toast'
import { ACCEPT_PDF, pickFile } from './files'
import { parseTradeRepublic, type TRStatement } from '../import/tradeRepublic'
import { ManualValue, TRPreview } from './TRSheets'
import { readPdfInBrowser } from '../import/pdfText'
import type { Account } from '../db/types'

/**
 * Importar el «Extracto del patrimonio neto» de Trade Republic desde cualquier pantalla:
 * abre el selector de archivos, lee el PDF en el iPhone y muestra la vista previa.
 */
export function useTRImport(account: Account | undefined) {
  const toast = useToast()
  const [preview, setPreview] = useState<TRStatement | null>(null)
  const [manual, setManual] = useState(false)
  const [busy, setBusy] = useState(false)

  async function start() {
    if (!account) {
      toast.show('Crea antes una cuenta de tipo Inversión para Trade Republic')
      return
    }
    const file = await pickFile(ACCEPT_PDF)
    if (!file) return
    setBusy(true)
    try {
      const st = parseTradeRepublic(await readPdfInBrowser(await file.arrayBuffer()))
      if (!st.positions.length && !st.cash) {
        toast.show('No se ha podido leer el extracto. Puedes meter el valor total a mano.')
        setManual(true)
      } else setPreview(st)
    } catch {
      toast.show('No se ha podido abrir el PDF. Puedes meter el valor total a mano.')
      setManual(true)
    } finally {
      setBusy(false)
    }
  }

  const element = account ? (
    <>
      {preview && <TRPreview account={account} st={preview} onClose={() => setPreview(null)} />}
      {manual && <ManualValue account={account} onClose={() => setManual(false)} />}
    </>
  ) : null

  return { start, busy, element, openManual: () => setManual(true) }
}

