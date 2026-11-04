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
import { BANKS, bankById, quickAccountsFor } from '../domain/banks'
import { BankBadge } from '../ui/BankBadge'

const TYPES: { value: AccountType; label: string }[] = [
  { value: 'banco', label: 'Banco' },
  { value: 'tarjeta', label: 'Tarjeta' },
  { value: 'efectivo', label: 'Efectivo' },
  { value: 'inversion', label: 'Inversión' },
]

export function AccountsScreen() {
  const { accounts, transactions } = useData()
  const { openAccount } = useEditor()
  const [quick, setQuick] = useState(false)
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
              <BankBadge account={a} size={36} />
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
      <button className="btn" onClick={() => setQuick(true)}>
        Añadir mis bancos de golpe
      </button>
      {quick && <QuickSetup onClose={() => setQuick(false)} />}
    </main>
  )
}

/** Crea de una vez las cuentas de tus bancos (Trade Republic crea efectivo + inversión enlazadas) */
export function QuickSetup({ onClose }: { onClose: () => void }) {
  const { accounts } = useData()
  const toast = useToast()
  const [picked, setPicked] = useState<string[]>([])
  const toggle = (id: string) => setPicked(picked.includes(id) ? picked.filter((x) => x !== id) : [...picked, id])
  async function create() {
    let order = accounts.length
    const created: Account[] = []
    for (const bank of picked) {
      for (const q of quickAccountsFor(bank)) {
        if (accounts.some((a) => a.name === q.name) || created.some((a) => a.name === q.name)) continue
        const b = bankById(bank)!
        created.push({ id: uid(), name: q.name, type: q.type, bank, initialBalance: 0, color: b.bg, order: order++, createdAt: Date.now(), cashAccountId: q.cashAccount })
      }
    }
    // Enlaza la inversión con su cuenta de efectivo
    for (const a of created) {
      if (a.cashAccountId) a.cashAccountId = [...created, ...accounts].find((x) => x.name === a.cashAccountId)?.id
    }
    await db.accounts.bulkAdd(created)
    toast.show(`${created.length} cuenta${created.length === 1 ? '' : 's'} creada${created.length === 1 ? '' : 's'}`)
    onClose()
  }
  return (
    <Sheet
      title="Tus bancos"
      onClose={onClose}
      full
      footer={
        <button className="btn primary block" disabled={!picked.length} onClick={() => void create()}>
          Crear {picked.length ? `${picked.length} banco${picked.length === 1 ? '' : 's'}` : 'cuentas'}
        </button>
      }
    >
      <p className="muted small">Elige los bancos que usas. Trade Republic crea dos cuentas: su efectivo (para el extracto de cuenta) y la inversión (para el extracto del patrimonio), ya enlazadas.</p>
      <div className="cat-grid">
        {BANKS.map((b) => (
          <button key={b.id} className="cat-option" aria-pressed={picked.includes(b.id)} onClick={() => toggle(b.id)}>
            <BankBadge bank={b.id} size={36} />
            {b.name}
          </button>
        ))}
      </div>
    </Sheet>
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
  const [cashAccountId, setCashAccountId] = useState(existing?.cashAccountId ?? '')
  const [bank, setBank] = useState(existing?.bank ?? '')
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
      cashAccountId: type === 'inversion' && cashAccountId ? cashAccountId : undefined,
      bank: bank || undefined,
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
      <div className="field">
        <span className="field-label">Banco</span>
        <div className="chips" style={{ paddingBottom: 2 }}>
          <button className={`chip ${!bank ? 'on' : ''}`} onClick={() => setBank('')}>
            Ninguno
          </button>
          {BANKS.map((b) => (
            <button
              key={b.id}
              className={`chip ${bank === b.id ? 'on' : ''}`}
              style={{ paddingLeft: 6 }}
              onClick={() => {
                setBank(b.id)
                setColor(b.bg)
                if (!name.trim()) setName(b.name)
              }}
            >
              <BankBadge bank={b.id} size={26} /> {b.name}
            </button>
          ))}
        </div>
      </div>
      <label className="field">
        <span>Nombre</span>
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder={type === 'inversion' ? 'Trade Republic' : type === 'tarjeta' ? 'Tarjeta de crédito' : type === 'efectivo' ? 'Cartera' : 'Cuenta nómina'} autoFocus={!existing} />
      </label>
      <label className="field">
        <span>{type === 'inversion' ? 'Aportado que no aparece en tus extractos' : 'Saldo inicial'}</span>
        <input className="input" inputMode="decimal" value={initial} onChange={(e) => setInitial(e.target.value)} placeholder="0,00" />
        <span className="meta">
          {type === 'inversion'
            ? 'Lo que metiste antes de usar la app o por otra vía (plan de inversión con tarjeta, regalos…). Las aportaciones que estén en tus extractos se suman solas: no las repitas aquí.'
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
      {type === 'inversion' && (
        <label className="field">
          <span>El efectivo de este bróker está en…</span>
          <select className="select" value={cashAccountId} onChange={(e) => setCashAccountId(e.target.value)}>
            <option value="">No lo importo aparte (contar el efectivo aquí)</option>
            {accounts
              .filter((a) => a.type !== 'inversion' && a.id !== existing?.id)
              .map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
          </select>
          <span className="meta">
            Si importas el extracto de la cuenta corriente de Trade Republic en otra cuenta, elígela: el efectivo no se contará dos veces y lo aportado serán las compras y ventas («Buy trade», «Sell trade»).
          </span>
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
