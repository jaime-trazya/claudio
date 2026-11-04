import { useState } from 'react'
import { Plus } from 'lucide-react'
import { useData } from '../ui/useData'
import { useEditor } from '../ui/editor'
import { useToast } from '../ui/toast'
import { BackBar, Money, Segmented, Sheet, Switch } from '../ui/components'
import { db } from '../db/db'
import { deleteAccount } from '../db/actions'
import { accountBalance } from '../domain/stats'
import { formatMoney, parseAmount } from '../lib/money'
import { uid } from '../lib/text'
import type { Account, AccountType } from '../db/types'
import { CATEGORY_COLORS } from '../ui/iconNames'

const TYPES: { value: AccountType; label: string }[] = [
  { value: 'banco', label: 'Banco' },
  { value: 'tarjeta', label: 'Tarjeta' },
  { value: 'efectivo', label: 'Efectivo' },
  { value: 'inversion', label: 'Inversión' },
]

export function AccountsScreen() {
  const { accounts, transactions } = useData()
  const { openAccount } = useEditor()
  return (
    <main className="screen sub">
      <BackBar label="Ajustes" fallback="/ajustes" />
      <div className="title-row">
        <h1 className="title">Cuentas</h1>
        <button className="icon-btn primary" onClick={() => openAccount()} aria-label="Nueva cuenta">
          <Plus size={22} />
        </button>
      </div>
      <section className="card flush list">
        {accounts.length ? (
          accounts.map((a) => (
            <button key={a.id} className="list-item" onClick={() => openAccount(a.id)}>
              <span className="tile sm" style={{ '--c': a.color } as React.CSSProperties} aria-hidden>
                {a.name.slice(0, 1).toUpperCase()}
              </span>
              <div className="grow">
                <div className="primary-line ellipsis">
                  {a.name}
                  {a.archived ? ' (archivada)' : ''}
                </div>
                <div className="secondary-line">{TYPES.find((t) => t.value === a.type)?.label}{a.cardAlias ? ` · tarjeta «${a.cardAlias}»` : ''}</div>
              </div>
              {a.type !== 'inversion' && <Money cents={accountBalance(a, transactions)} plain />}
            </button>
          ))
        ) : (
          <div className="empty">
            <strong>Sin cuentas</strong>
            Crea tu banco, tus tarjetas, el efectivo o tu cuenta de inversión.
          </div>
        )}
      </section>
    </main>
  )
}

export function AccountEditor({ id, onClose }: { id?: string; onClose: () => void }) {
  const { accounts, transactions, settings } = useData()
  const toast = useToast()
  const existing = accounts.find((a) => a.id === id)
  const [name, setName] = useState(existing?.name ?? '')
  const [type, setType] = useState<AccountType>(existing?.type ?? 'banco')
  const [initial, setInitial] = useState(existing ? (existing.initialBalance / 100).toFixed(2).replace('.', ',') : '')
  const [color, setColor] = useState(existing?.color ?? CATEGORY_COLORS[accounts.length % CATEGORY_COLORS.length])
  const [cardAlias, setCardAlias] = useState(existing?.cardAlias ?? '')
  const [archived, setArchived] = useState(!!existing?.archived)
  const initialCents = initial.trim() ? parseAmount(initial) : 0
  const valid = name.trim().length > 0 && initialCents !== null
  const count = existing ? transactions.filter((t) => t.accountId === existing.id).length : 0

  async function save() {
    if (!valid) return
    const acc: Account = {
      id: existing?.id ?? uid(),
      name: name.trim(),
      type,
      initialBalance: initialCents ?? 0,
      color,
      cardAlias: cardAlias.trim() || undefined,
      archived,
      order: existing?.order ?? accounts.length,
      createdAt: existing?.createdAt ?? Date.now(),
    }
    await db.accounts.put(acc)
    toast.show(existing ? 'Cuenta guardada' : 'Cuenta creada')
    onClose()
  }

  return (
    <Sheet
      title={existing ? 'Editar cuenta' : 'Nueva cuenta'}
      onClose={onClose}
      full
      footer={
        <>
          {existing && (
            <button
              className="btn danger"
              onClick={async () => {
                const ok = await toast.confirm({
                  title: `Borrar «${existing.name}»`,
                  message: count ? `Se borrarán también sus ${count} movimientos. Si solo quieres ocultarla, archívala.` : 'La cuenta no tiene movimientos.',
                  confirmLabel: 'Borrar',
                  danger: true,
                  typeToConfirm: count ? 'BORRAR' : undefined,
                })
                if (!ok) return
                await deleteAccount(existing.id)
                toast.show('Cuenta borrada')
                onClose()
              }}
            >
              Borrar
            </button>
          )}
          <button className="btn primary block" disabled={!valid} onClick={() => void save()}>
            Guardar
          </button>
        </>
      }
    >
      <Segmented label="Tipo de cuenta" value={type} onChange={setType} options={TYPES} />
      <label className="field">
        <span>Nombre</span>
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder={type === 'inversion' ? 'Trade Republic' : type === 'tarjeta' ? 'Tarjeta de crédito' : type === 'efectivo' ? 'Cartera' : 'Cuenta nómina'} autoFocus={!existing} />
      </label>
      <label className="field">
        <span>{type === 'inversion' ? 'Aportado antes de usar la app' : 'Saldo inicial'}</span>
        <input className="input" inputMode="decimal" value={initial} onChange={(e) => setInitial(e.target.value)} placeholder="0,00" />
        <span className="meta">
          {type === 'inversion'
            ? 'Lo que ya habías metido en la cuenta. Las aportaciones nuevas se suman solas al importar el extracto del banco.'
            : 'Saldo antes del primer movimiento que vayas a importar. El saldo actual se calcula sumando los movimientos.'}
        </span>
      </label>
      {existing && type !== 'inversion' && (
        <p className="small muted">
          Saldo actual: <strong>{formatMoney(accountBalance({ ...existing, initialBalance: initialCents ?? 0 }, transactions), { currency: settings.currency })}</strong>
        </p>
      )}
      {(type === 'tarjeta' || type === 'banco') && (
        <label className="field">
          <span>Nombre de la tarjeta en Wallet (para el Atajo de Apple Pay)</span>
          <input className="input" value={cardAlias} onChange={(e) => setCardAlias(e.target.value)} placeholder="Visa Débito" />
          <span className="meta">Los pagos del Atajo con esta tarjeta se asignarán a esta cuenta.</span>
        </label>
      )}
      <div className="field">
        <span className="field-label">Color</span>
        <div className="swatches">
          {CATEGORY_COLORS.map((c) => (
            <button key={c} className="swatch" style={{ background: c }} aria-pressed={c === color} aria-label={`Color ${c}`} onClick={() => setColor(c)} />
          ))}
        </div>
      </div>
      {existing && (
        <div className="card row between" style={{ padding: '10px 14px' }}>
          <div>
            <div style={{ fontWeight: 500 }}>Archivada</div>
            <div className="meta">Se oculta pero conserva sus movimientos</div>
          </div>
          <Switch checked={archived} onChange={setArchived} label="Archivada" />
        </div>
      )}
    </Sheet>
  )
}
