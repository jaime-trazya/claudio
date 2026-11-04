import { useState } from 'react'
import { useData } from './useData'
import { useToast } from './toast'
import { ACCEPT_SHORTCUT, pickFile } from './files'
import { parseShortcutFile, matchCard, type ShortcutPayment } from '../import/shortcut'
import { importShortcutPayments } from '../db/actions'
import { setSetting } from '../db/settings'
import { db } from '../db/db'
import { Sheet } from './components'

/** Botón "Importar pagos del Atajo": lee el archivo y añade los pagos nuevos como pendientes */
export function useShortcutImport() {
  const { accounts, settings } = useData()
  const toast = useToast()
  const [ask, setAsk] = useState<{ payments: ShortcutPayment[]; fileName: string; cards: string[] } | null>(null)
  const usable = accounts.filter((a) => a.type !== 'inversion' && !a.archived)

  async function finish(payments: ShortcutPayment[], fileName: string, fallback: string | null) {
    const res = await importShortcutPayments(payments, usable, fallback, fileName)
    if (res.added) toast.show(`${res.added} pago${res.added === 1 ? '' : 's'} nuevo${res.added === 1 ? '' : 's'} pendiente${res.added === 1 ? '' : 's'} de confirmar${res.skipped ? ` · ${res.skipped} ya estaban` : ''}`)
    else toast.show(payments.length ? 'No hay pagos nuevos: todos estaban ya importados' : 'El archivo no tiene pagos')
  }

  async function start() {
    if (!usable.length) {
      toast.show('Crea antes una cuenta o tarjeta en Ajustes › Cuentas')
      return
    }
    const file = await pickFile(ACCEPT_SHORTCUT)
    if (!file) return
    const { payments, errors } = parseShortcutFile(await file.arrayBuffer())
    if (!payments.length) {
      toast.show(errors.length ? `No se ha entendido el archivo (${errors.length} líneas con errores). Revisa el formato en la guía.` : 'El archivo está vacío')
      return
    }
    const unmatched = [...new Set(payments.map((p) => p.card))].filter((c) => !matchCard(c, usable))
    if (unmatched.length && !(settings.defaultAccountId && usable.some((a) => a.id === settings.defaultAccountId)) && usable.length > 1) {
      setAsk({ payments, fileName: file.name, cards: unmatched })
      return
    }
    await finish(payments, file.name, settings.defaultAccountId ?? usable[0].id)
    if (errors.length) toast.show(`${errors.length} línea${errors.length === 1 ? '' : 's'} del archivo no se ha${errors.length === 1 ? '' : 'n'} podido leer`)
  }

  const element = ask ? (
    <Sheet title="¿De qué cuenta son estos pagos?" onClose={() => setAsk(null)}>
      <p className="muted small">
        El Atajo indica la tarjeta {ask.cards.map((c) => `«${c || 'sin nombre'}»`).join(', ')}. Elige la cuenta donde se cargan; la app lo recordará.
      </p>
      <div className="card flush list">
        {usable.map((a) => (
          <button
            key={a.id}
            className="list-item"
            onClick={async () => {
              if (ask.cards[0] && !a.cardAlias) await db.accounts.update(a.id, { cardAlias: ask.cards[0] })
              await setSetting('defaultAccountId', a.id)
              const p = ask
              setAsk(null)
              await finish(p.payments, p.fileName, a.id)
            }}
          >
            <span className="grow primary-line">{a.name}</span>
          </button>
        ))}
      </div>
    </Sheet>
  ) : null

  return { start, element }
}
