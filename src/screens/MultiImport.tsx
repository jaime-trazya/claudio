import { useMemo, useState } from 'react'
import { useData } from '../ui/useData'
import { useToast } from '../ui/toast'
import { Sheet } from '../ui/components'
import { applyMapping, bankClosingBalance, detectColumns } from '../import/detect'
import { planImport, summarizePlan } from '../import/reconcile'
import type { PdfTable } from '../import/pdfTable'
import { applyStatementImport, mirrorTransfers, SAVINGS_TRANSFER } from '../db/actions'
import { db } from '../db/db'
import { bankById, BANKS } from '../domain/banks'
import { uid } from '../lib/text'
import type { Account } from '../db/types'

const isSavings = (label: string) => /ahorro|remunerada|savings/i.test(label)

/** Importa todas las tablas de un PDF (Revolut: cuenta + Cuenta Remunerada), cada una en su cuenta */
export function MultiImport({
  tables,
  primaryAccountId,
  bankName,
  fileName,
  fingerprint,
  onClose,
  onDone,
}: {
  tables: PdfTable[]
  primaryAccountId: string
  bankName: string | null
  fileName: string
  fingerprint: string
  onClose: () => void
  onDone: (firstAccountId: string) => void
}) {
  const { accounts, transactions } = useData()
  const toast = useToast()
  const [busy, setBusy] = useState(false)
  const usable = accounts.filter((a) => !a.archived && a.type !== 'inversion')
  const primary = usable.find((a) => a.id === primaryAccountId)
  const prefix = bankName ?? primary?.name ?? 'Cuenta'

  const defaults = tables.map((t, i) => {
    if (i === 0 || !isSavings(t.label)) return i === 0 ? primaryAccountId : `new:${prefix} · ${t.label}`
    const existing = usable.find((a) => a.id !== primaryAccountId && isSavings(a.name) && (!primary?.bank || a.bank === primary.bank))
    return existing?.id ?? `new:${prefix} · Cuenta remunerada`
  })
  const [choice, setChoice] = useState<string[]>(defaults)

  const plans = useMemo(
    () =>
      tables.map((t, i) => {
        const det = detectColumns(t.rows)
        if (!det) return null
        const movements = applyMapping(t.rows, det.mapping)
        const acc = choice[i].startsWith('new:') ? '__nueva__' : choice[i]
        return { movements, rows: planImport(movements, acc, transactions) }
      }),
    [tables, choice, transactions],
  )

  async function run() {
    setBusy(true)
    try {
      const ids: string[] = []
      let order = accounts.length
      for (const c of choice) {
        if (!c.startsWith('new:')) {
          ids.push(c)
          continue
        }
        const bank = primary?.bank ?? BANKS.find((b) => b.name === bankName)?.id
        const acc: Account = { id: uid(), name: c.slice(4), type: 'banco', bank, initialBalance: 0, color: bankById(bank)?.bg ?? '#0e7490', order: order++, createdAt: Date.now() }
        await db.accounts.add(acc)
        ids.push(acc.id)
      }
      let added = 0
      let dup = 0
      for (const [i, p] of plans.entries()) {
        if (!p) continue
        // Recalcula con la cuenta real (las nuevas no tienen duplicados)
        const rows = planImport(p.movements, ids[i], (await db.transactions.toArray()))
        const res = await applyStatementImport({ rows, accountId: ids[i], fileName: `${fileName} · ${tables[i].label}`, bankBalance: bankClosingBalance(p.movements), fingerprint: i === 0 ? fingerprint : undefined })
        added += res.added
        dup += summarizePlan(rows).duplicados
      }
      // Los traspasos de la cuenta principal a las de ahorro crean la otra pata en la de ahorro
      let mirrored = 0
      for (let i = 1; i < ids.length; i++) if (isSavings(tables[i].label)) mirrored += await mirrorTransfers(ids[0], ids[i], SAVINGS_TRANSFER)
      toast.show(`${added} movimientos nuevos${dup ? ` · ${dup} ya estaban` : ''}${mirrored ? ` · ${mirrored} traspasos enlazados` : ''}`)
      onClose()
      onDone(ids[0])
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet
      title="Importar todo el extracto"
      onClose={onClose}
      footer={
        <button className="btn primary block" disabled={busy} onClick={() => void run()}>
          {busy ? 'Importando…' : 'Importar'}
        </button>
      }
    >
      <p className="muted small">Cada tabla va a su cuenta. Antes de guardar se comprueba qué movimientos ya tienes: los repetidos no se duplican.</p>
      {tables.map((t, i) => {
        const p = plans[i]
        const s = p ? summarizePlan(p.rows) : null
        return (
          <div key={i} className="card stack" style={{ gap: 8 }}>
            <strong>{t.label}</strong>
            <select className="select" value={choice[i]} onChange={(e) => setChoice(choice.map((c, j) => (j === i ? e.target.value : c)))}>
              {defaults[i].startsWith('new:') && <option value={defaults[i]}>Crear «{defaults[i].slice(4)}»</option>}
              {usable.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
            <span className="meta">
              {p ? `${p.movements.length} movimientos · ${s!.duplicados ? `${s!.duplicados} ya los tienes` : 'ninguno repetido'}` : 'No se reconocen las columnas de esta tabla'}
              {i > 0 && isSavings(t.label) ? ' · se añadirán los traspasos desde la cuenta principal' : ''}
            </span>
          </div>
        )
      })}
    </Sheet>
  )
}
