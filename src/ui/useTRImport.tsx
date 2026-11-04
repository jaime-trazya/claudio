import { useState } from 'react'
import { useToast } from './toast'
import { useData } from './useData'
import { ACCEPT_PDF, pickFile } from './files'
import { parseTradeRepublic, type TRStatement } from '../import/tradeRepublic'
import { ManualValue, TRPreview } from './TRSheets'
import { readPdfInBrowser } from '../import/pdfText'
import { ensureInvestmentAccount } from '../db/actions'
import type { Account } from '../db/types'

/**
 * Importar el «Extracto del patrimonio neto» de Trade Republic desde cualquier pantalla:
 * abre el selector de archivos (o usa un PDF ya leído), lo lee en el iPhone y muestra la vista previa.
 * Si aún no tienes cuenta de inversión, crea «Trade Republic · inversión».
 */
export function useTRImport(preferred?: Account) {
  const toast = useToast()
  const { accounts } = useData()
  const [target, setTarget] = useState<Account | null>(null)
  const [preview, setPreview] = useState<TRStatement | null>(null)
  const [manual, setManual] = useState(false)
  const [busy, setBusy] = useState(false)

  async function account(): Promise<Account> {
    if (preferred) return preferred
    const acc = await ensureInvestmentAccount(accounts)
    if (!accounts.some((a) => a.id === acc.id)) toast.show(`Creada la cuenta «${acc.name}»`)
    return acc
  }

  /** Con las líneas de un PDF ya leído (desde «Importar extracto») */
  async function fromLines(lines: string[]) {
    const acc = await account()
    setTarget(acc)
    const st = parseTradeRepublic(lines)
    if (!st.positions.length && !st.cash) {
      toast.show('No se ha podido leer el extracto. Puedes meter el valor total a mano.')
      setManual(true)
    } else setPreview(st)
  }

  async function start() {
    const file = await pickFile(ACCEPT_PDF)
    if (!file) return
    setBusy(true)
    try {
      await fromLines(await readPdfInBrowser(await file.arrayBuffer()))
    } catch {
      setTarget(await account())
      toast.show('No se ha podido abrir el PDF. Puedes meter el valor total a mano.')
      setManual(true)
    } finally {
      setBusy(false)
    }
  }

  async function openManual() {
    setTarget(await account())
    setManual(true)
  }

  const acc = target ?? preferred
  const element = acc ? (
    <>
      {preview && <TRPreview account={acc} st={preview} onClose={() => setPreview(null)} />}
      {manual && <ManualValue account={acc} onClose={() => setManual(false)} />}
    </>
  ) : null

  return { start, fromLines, busy, element, openManual }
}
