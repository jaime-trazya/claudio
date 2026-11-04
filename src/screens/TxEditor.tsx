import { useMemo, useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import type { Split, Transaction, TxKind } from '../db/types'
import { useData } from '../ui/useData'
import { useToast } from '../ui/toast'
import { CategoryPicker, CategoryTile, Money, Segmented, Sheet, Switch } from '../ui/components'
import { categoryLabel } from '../ui/format'
import { formatMoney, parseAmount } from '../lib/money'
import { todayISO } from '../lib/dates'
import { applyRuleEverywhere, createTransfer, deleteTransaction, newTransaction, saveTransaction } from '../db/actions'
import { merchantKey } from '../lib/text'
import { db } from '../db/db'

type Mode = 'gasto' | 'ingreso' | 'aportacion' | 'transferencia'

const centsToInput = (c: number) => (Math.abs(c) / 100).toFixed(2).replace('.', ',')

export function TxEditor({ tx, defaults, onClose }: { tx?: Transaction; defaults?: Partial<Transaction>; onClose: () => void }) {
  const { accounts, categoryById, settings } = useData()
  const toast = useToast()
  const usable = accounts.filter((a) => !a.archived)
  const isNew = !tx
  const isPairedTransfer = !!tx?.transferId
  const base = tx ?? (defaults as Transaction | undefined)

  const [mode, setMode] = useState<Mode>((base?.kind as Mode) ?? 'gasto')
  const [amountText, setAmountText] = useState(base?.amount ? centsToInput(base.amount) : '')
  const [description, setDescription] = useState(base?.description ?? '')
  const [date, setDate] = useState(base?.date ?? todayISO())
  const [accountId, setAccountId] = useState(base?.accountId ?? settings.defaultAccountId ?? usable.find((a) => a.type !== 'inversion')?.id ?? '')
  const [toAccountId, setToAccountId] = useState(usable.find((a) => a.id !== accountId)?.id ?? '')
  const [categoryId, setCategoryId] = useState<string | null>(base?.categoryId ?? null)
  const [pending, setPending] = useState(base?.status === 'pendiente')
  const [notes, setNotes] = useState(base?.notes ?? '')
  const [tags, setTags] = useState((base?.tags ?? []).join(', '))
  const [splits, setSplits] = useState<{ categoryId: string | null; text: string }[]>(
    base?.splits?.map((s) => ({ categoryId: s.categoryId, text: centsToInput(s.amount) })) ?? [],
  )
  const [picker, setPicker] = useState<null | { index: number | 'main' }>(null)

  const absAmount = Math.abs(parseAmount(amountText) ?? 0)
  const signed = mode === 'ingreso' ? absAmount : -absAmount
  const splitTotal = splits.reduce((s, x) => s + Math.abs(parseAmount(x.text) ?? 0), 0)
  const splitRemaining = absAmount - splitTotal
  const category = categoryId ? categoryById.get(categoryId) : undefined
  const toAccount = accounts.find((a) => a.id === toAccountId)

  const modes = useMemo(() => {
    const m: { value: Mode; label: string }[] = [
      { value: 'gasto', label: 'Gasto' },
      { value: 'ingreso', label: 'Ingreso' },
      { value: 'aportacion', label: 'Inversión' },
    ]
    if (isNew) m.push({ value: 'transferencia', label: 'Traspaso' })
    return m
  }, [isNew])

  const canSave =
    absAmount > 0 &&
    !!accountId &&
    (mode === 'transferencia' ? !!toAccountId && toAccountId !== accountId : description.trim().length > 0) &&
    (splits.length === 0 || splitRemaining === 0)

  async function save() {
    if (!canSave) return
    const tagList = tags
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean)
    if (isNew && mode === 'transferencia') {
      const from = accounts.find((a) => a.id === accountId)!
      await createTransfer({ from, to: toAccount!, amount: absAmount, date, description, notes })
      toast.show(toAccount?.type === 'inversion' ? 'Aportación guardada' : 'Transferencia guardada')
      onClose()
      return
    }
    const splitList: Split[] | undefined = splits.length
      ? splits.map((s) => ({ categoryId: s.categoryId, amount: (mode === 'ingreso' ? 1 : -1) * Math.abs(parseAmount(s.text) ?? 0) }))
      : undefined
    const kind: TxKind = mode as TxKind
    const next: Transaction = {
      ...(tx ?? newTransaction({ accountId, date, amount: signed, description })),
      accountId,
      date,
      amount: isPairedTransfer ? (tx!.amount < 0 ? -absAmount : absAmount) : signed,
      description: description.trim(),
      categoryId: splitList ? null : mode === 'aportacion' && !categoryId ? 'cat-inversion' : categoryId,
      kind: isPairedTransfer ? tx!.kind : kind,
      status: pending ? 'pendiente' : 'confirmado',
      notes: notes.trim() || undefined,
      tags: tagList,
      splits: splitList,
    }
    await saveTransaction(next)
    // La otra pata de la transferencia se mantiene con el mismo importe y fecha
    if (isPairedTransfer) {
      await db.transactions
        .where('transferId')
        .equals(tx!.transferId!)
        .filter((t) => t.id !== tx!.id)
        .modify({ amount: -next.amount, date, description: next.description, updatedAt: Date.now() })
    }
    onClose()
    const changedCategory = tx && !splitList && categoryId && categoryId !== tx.categoryId && !isPairedTransfer
    if (changedCategory) {
      const keyword = merchantKey(tx.bankDescription ?? tx.description)
      const cat = categoryById.get(categoryId)
      const ok = await toast.confirm({
        title: `¿Aplicar siempre a «${keyword}»?`,
        message: `Los movimientos con este concepto pasarán a ${categoryLabel(cat, categoryById)}, también los anteriores, y los nuevos se categorizarán solos.`,
        confirmLabel: 'Aplicar siempre',
        cancelLabel: 'Solo este',
      })
      if (ok) {
        const n = await applyRuleEverywhere(keyword, categoryId, mode === 'aportacion' ? 'aportacion' : undefined)
        toast.show(n ? `Regla creada · ${n} movimiento${n === 1 ? '' : 's'} más actualizado${n === 1 ? '' : 's'}` : 'Regla creada')
      }
    } else toast.show(isNew ? 'Movimiento añadido' : 'Cambios guardados')
  }

  async function remove() {
    if (!tx) return
    const ok = await toast.confirm({
      title: 'Borrar movimiento',
      message: tx.transferId ? 'Se borrarán las dos partes de la transferencia.' : `${tx.description} · ${formatMoney(tx.amount)}`,
      confirmLabel: 'Borrar',
      danger: true,
    })
    if (!ok) return
    await deleteTransaction(tx)
    onClose()
    toast.show('Movimiento borrado', { action: { label: 'Deshacer', run: () => void saveTransaction(tx) } })
  }

  if (!usable.length) {
    return (
      <Sheet title="Nuevo movimiento" onClose={onClose}>
        <p className="muted">Primero crea una cuenta en Ajustes › Cuentas (banco, tarjeta, efectivo o inversión).</p>
      </Sheet>
    )
  }

  return (
    <Sheet
      title={isNew ? 'Nuevo movimiento' : 'Movimiento'}
      onClose={onClose}
      full
      footer={
        <>
          {!isNew && (
            <button className="btn danger" onClick={() => void remove()} aria-label="Borrar movimiento">
              <Trash2 size={18} />
            </button>
          )}
          <button className="btn primary block" disabled={!canSave} onClick={() => void save()}>
            Guardar
          </button>
        </>
      }
    >
      {!isPairedTransfer && <Segmented label="Tipo" value={mode} options={modes} onChange={setMode} />}
      {isPairedTransfer && <span className="pill">{tx!.kind === 'aportacion' ? 'Aportación a inversión' : 'Transferencia entre cuentas'}</span>}

      <div className="card" style={{ padding: '10px 14px' }}>
        <input
          className="amount-input"
          inputMode="decimal"
          placeholder="0,00"
          value={amountText}
          onChange={(e) => setAmountText(e.target.value.replace(/[^\d.,]/g, ''))}
          aria-label="Importe"
          autoFocus={isNew}
          enterKeyHint="done"
        />
        <div className="meta" style={{ textAlign: 'center' }}>
          {mode === 'ingreso' ? 'Entra dinero' : mode === 'transferencia' ? 'Se mueve entre tus cuentas: no cuenta como gasto' : mode === 'aportacion' ? 'Aportación a inversión: no cuenta como gasto' : 'Sale dinero'}
        </div>
      </div>

      <label className="field">
        <span>Concepto</span>
        <input className="input" value={description} onChange={(e) => setDescription(e.target.value)} placeholder={mode === 'transferencia' ? 'Opcional' : 'Mercadona, cena, nómina…'} autoCapitalize="sentences" enterKeyHint="next" />
      </label>
      {tx?.bankDescription && tx.bankDescription !== tx.description && <p className="meta">Concepto del banco: {tx.bankDescription}</p>}

      <div className="form-grid">
        <label className="field">
          <span>Fecha</span>
          <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
        <label className="field">
          <span>{mode === 'transferencia' ? 'Desde' : 'Cuenta'}</span>
          <select className="select" value={accountId} onChange={(e) => setAccountId(e.target.value)} disabled={isPairedTransfer}>
            {usable.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      {mode === 'transferencia' ? (
        <label className="field">
          <span>Hacia</span>
          <select className="select" value={toAccountId} onChange={(e) => setToAccountId(e.target.value)}>
            {usable
              .filter((a) => a.id !== accountId)
              .map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                  {a.type === 'inversion' ? ' (aportación)' : ''}
                </option>
              ))}
          </select>
        </label>
      ) : (
        !isPairedTransfer &&
        splits.length === 0 && (
          <div className="field">
            <span className="field-label">Categoría</span>
            <button className="card row" style={{ padding: 10, minHeight: 56 }} onClick={() => setPicker({ index: 'main' })}>
              <CategoryTile category={category} size="sm" />
              <span className="grow" style={{ textAlign: 'left', fontWeight: 500 }}>
                {categoryLabel(category, categoryById)}
              </span>
              <span className="muted small">Cambiar</span>
            </button>
          </div>
        )
      )}

      {mode !== 'transferencia' && !isPairedTransfer && (
        <div className="stack" style={{ gap: 8 }}>
          {splits.length > 0 && (
            <>
              <span className="field-label">Dividido en categorías</span>
              {splits.map((s, i) => (
                <div className="split-row" key={i}>
                  <button className="card row" style={{ padding: 8, minHeight: 46 }} onClick={() => setPicker({ index: i })}>
                    <CategoryTile category={s.categoryId ? categoryById.get(s.categoryId) : null} size="sm" />
                    <span className="ellipsis small" style={{ fontWeight: 500 }}>
                      {categoryLabel(s.categoryId ? categoryById.get(s.categoryId) : null, categoryById)}
                    </span>
                  </button>
                  <input
                    className="input"
                    inputMode="decimal"
                    value={s.text}
                    onChange={(e) => setSplits(splits.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)))}
                    aria-label="Importe de la parte"
                    style={{ textAlign: 'right' }}
                  />
                  <button className="icon-btn plain" aria-label="Quitar parte" onClick={() => setSplits(splits.filter((_, j) => j !== i))}>
                    <Trash2 size={18} />
                  </button>
                </div>
              ))}
              <p className={`small ${splitRemaining === 0 ? 'muted' : ''}`} style={{ color: splitRemaining !== 0 ? 'var(--warning)' : undefined }}>
                {splitRemaining === 0 ? 'El reparto cuadra con el importe.' : splitRemaining > 0 ? `Faltan ${formatMoney(splitRemaining)} por repartir.` : `Te pasas en ${formatMoney(-splitRemaining)}.`}
              </p>
            </>
          )}
          <button
            className="btn small"
            style={{ alignSelf: 'flex-start' }}
            onClick={() => {
              if (splits.length === 0) {
                const half = Math.floor(absAmount / 2)
                setSplits([
                  { categoryId, text: centsToInput(absAmount - half) },
                  { categoryId: null, text: centsToInput(half) },
                ])
              } else setSplits([...splits, { categoryId: null, text: centsToInput(Math.max(0, splitRemaining)) }])
            }}
          >
            <Plus size={16} /> {splits.length ? 'Añadir parte' : 'Dividir en varias categorías'}
          </button>
        </div>
      )}

      {mode !== 'transferencia' && (
        <div className="card row between" style={{ padding: '10px 14px' }}>
          <div>
            <div style={{ fontWeight: 500 }}>Pendiente de confirmar</div>
            <div className="meta">Se confirma solo al importar el extracto del banco</div>
          </div>
          <Switch checked={pending} onChange={setPending} label="Pendiente de confirmar" />
        </div>
      )}

      <label className="field">
        <span>Notas</span>
        <textarea className="textarea" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Opcional" />
      </label>
      <label className="field">
        <span>Etiquetas (separadas por comas)</span>
        <input className="input" value={tags} onChange={(e) => setTags(e.target.value)} placeholder="viaje, regalo…" autoCapitalize="none" />
      </label>
      {!isNew && tx && (
        <p className="meta">
          Origen: {tx.source === 'atajo' ? 'Atajo de Apple Pay' : tx.source === 'extracto' ? 'Extracto del banco' : 'Añadido a mano'}
          {tx.bankDate ? ' · conciliado con el banco' : ''} · <Money cents={tx.amount} plain />
        </p>
      )}

      {picker && (
        <CategoryPicker
          value={picker.index === 'main' ? categoryId : (splits[picker.index]?.categoryId ?? null)}
          kind={mode === 'ingreso' ? 'ingreso' : 'gasto'}
          onClose={() => setPicker(null)}
          onPick={(id) => {
            if (picker.index === 'main') setCategoryId(id)
            else setSplits(splits.map((x, j) => (j === picker.index ? { ...x, categoryId: id } : x)))
            setPicker(null)
          }}
        />
      )}
    </Sheet>
  )
}
