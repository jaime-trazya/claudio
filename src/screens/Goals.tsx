import { useState } from 'react'
import { Plus } from 'lucide-react'
import { useData } from '../ui/useData'
import { useToast } from '../ui/toast'
import { Money, Sheet } from '../ui/components'
import { goalProgress } from '../domain/goals'
import { db } from '../db/db'
import { formatMoney, parseAmount } from '../lib/money'
import { addMonths, formatShortDate, todayISO } from '../lib/dates'
import { savingsSuggestion } from '../domain/insights'
import { uid } from '../lib/text'
import { CATEGORY_COLORS } from '../ui/iconNames'
import type { Goal } from '../db/types'

/** Objetivos de ahorro: un viaje, un colchón, el coche… con su progreso y la cuota mensual */
export function GoalsSection() {
  const { goals, accounts, transactions, snapshots, settings } = useData()
  const [editing, setEditing] = useState<Partial<Goal> | null>(null)
  return (
    <>
      <div className="section-head">
        <h2 className="section-title">Objetivos</h2>
        <button className="btn small ghost" onClick={() => setEditing({})}>
          <Plus size={15} /> Nuevo
        </button>
      </div>
      {goals.length === 0 ? (
        <button className="card" style={{ textAlign: 'left', width: '100%' }} onClick={() => setEditing({})}>
          <strong>Ponte un objetivo</strong>
          <p className="muted small" style={{ marginTop: 4 }}>Un viaje, un colchón para imprevistos, el carné… La app te dice cuánto apartar cada mes para llegar a tiempo.</p>
        </button>
      ) : (
        <section className="card flush list">
          {goals.map((g) => {
            const p = goalProgress(g, accounts, transactions, snapshots)
            return (
              <button key={g.id} className="list-item" style={{ display: 'block', paddingTop: 14, paddingBottom: 14 }} onClick={() => setEditing(g)}>
                <div className="row between">
                  <span className="primary-line ellipsis">{g.name}</span>
                  <span className="small">
                    <Money cents={p.saved} plain /> <span className="muted">/ {formatMoney(g.target, { currency: settings.currency, compact: g.target % 100 === 0 })}</span>
                  </span>
                </div>
                <div className="track" style={{ marginTop: 10 }} role="progressbar" aria-valuenow={Math.round(p.ratio * 100)} aria-valuemin={0} aria-valuemax={100}>
                  <i style={{ width: `${p.ratio * 100}%`, background: g.color }} />
                </div>
                <div className="plan-caption">
                  <span>{p.done ? '¡Conseguido!' : `${Math.round(p.ratio * 100)} % · faltan ${formatMoney(p.remaining, { currency: settings.currency })}`}</span>
                  {!p.done && p.monthly !== null && <span>{p.monthsLeft ? `${formatMoney(p.monthly, { currency: settings.currency })}/mes hasta ${formatShortDate(g.deadline!)}` : 'Fecha pasada'}</span>}
                </div>
              </button>
            )
          })}
        </section>
      )}
      {editing && <GoalEditor goal={editing} onClose={() => setEditing(null)} />}
    </>
  )
}

function GoalEditor({ goal, onClose }: { goal: Partial<Goal>; onClose: () => void }) {
  const { accounts, goals, statTxs, settings, categoryById } = useData()
  const toast = useToast()
  const suggestion = savingsSuggestion(statTxs, todayISO(), settings.monthStartDay, categoryById)
  const [name, setName] = useState(goal.name ?? '')
  const [target, setTarget] = useState(goal.target ? (goal.target / 100).toFixed(2).replace('.', ',') : '')
  const [saved, setSaved] = useState(goal.saved ? (goal.saved / 100).toFixed(2).replace('.', ',') : '')
  const [accountId, setAccountId] = useState(goal.accountId ?? '')
  const [deadline, setDeadline] = useState(goal.deadline ?? '')
  const [color, setColor] = useState(goal.color ?? CATEGORY_COLORS[goals.length % CATEGORY_COLORS.length])
  const targetCents = Math.abs(parseAmount(target) ?? 0)
  return (
    <Sheet
      title={goal.id ? 'Objetivo' : 'Nuevo objetivo'}
      onClose={onClose}
      full
      footer={
        <>
          {goal.id && (
            <button
              className="btn danger"
              onClick={async () => {
                await db.goals.delete(goal.id!)
                toast.show('Objetivo borrado')
                onClose()
              }}
            >
              Borrar
            </button>
          )}
          <button
            className="btn primary block"
            disabled={!name.trim() || !targetCents}
            onClick={async () => {
              await db.goals.put({
                id: goal.id ?? uid(),
                name: name.trim(),
                target: targetCents,
                saved: Math.abs(parseAmount(saved) ?? 0),
                accountId: accountId || undefined,
                deadline: deadline || undefined,
                color,
                createdAt: goal.createdAt ?? Date.now(),
              })
              toast.show('Objetivo guardado')
              onClose()
            }}
          >
            Guardar
          </button>
        </>
      }
    >
      <label className="field">
        <span>Para qué</span>
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Viaje, colchón, coche…" autoFocus={!goal.id} />
      </label>
      <label className="field">
        <span>Cuánto quieres juntar</span>
        <input className="input" inputMode="decimal" value={target} onChange={(e) => setTarget(e.target.value)} placeholder="1.000,00" />
      </label>
      <label className="field">
        <span>Dónde lo guardas</span>
        <select className="select" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
          <option value="">Lo apunto yo a mano</option>
          {accounts
            .filter((a) => !a.archived)
            .map((a) => (
              <option key={a.id} value={a.id}>
                Saldo de {a.name}
              </option>
            ))}
        </select>
        <span className="meta">Si eliges una cuenta (por ejemplo, la Cuenta Remunerada), el progreso es su saldo.</span>
      </label>
      {!accountId && (
        <label className="field">
          <span>Llevas ahorrado</span>
          <input className="input" inputMode="decimal" value={saved} onChange={(e) => setSaved(e.target.value)} placeholder="0,00" />
        </label>
      )}
      <label className="field">
        <span>Para cuándo (opcional)</span>
        <input className="input" type="date" value={deadline} min={todayISO()} onChange={(e) => setDeadline(e.target.value)} />
      </label>
      {suggestion !== null && targetCents > 0 && (() => {
        // Lo que falta, con lo que suele sobrarte al mes: cuándo llegarías sin apretarte
        const already = accountId ? 0 : Math.abs(parseAmount(saved) ?? 0)
        const months = Math.max(1, Math.ceil(Math.max(0, targetCents - already) / suggestion))
        const date = addMonths(todayISO(), months)
        return (
          <div className="notice accent" role="status">
            <div className="grow">
              <strong>
                Te suelen sobrar unos <Money cents={suggestion} plain /> al mes
              </strong>
              <p>
                Apartándolos, llegarías en {months === 1 ? 'un mes' : `${months} meses`} ({formatShortDate(date)}). Es la mediana de lo que te ha sobrado los últimos 3 meses.
              </p>
              {deadline !== date && (
                <div className="notice-actions">
                  <button className="btn small" type="button" onClick={() => setDeadline(date)}>
                    Ponerle esa fecha
                  </button>
                </div>
              )}
            </div>
          </div>
        )
      })()}
      <div className="field">
        <span className="field-label">Color</span>
        <div className="swatches">
          {CATEGORY_COLORS.map((c) => (
            <button key={c} className="swatch" style={{ background: c }} aria-pressed={c === color} aria-label={`Color ${c}`} onClick={() => setColor(c)} />
          ))}
        </div>
      </div>
    </Sheet>
  )
}
