import { useCallback, useMemo, useState } from 'react'
import { EyeOff, Pencil, Plus } from 'lucide-react'
import { useData } from '../ui/useData'
import { useToast } from '../ui/toast'
import { CategoryPicker, CategoryTile, Money, PeriodSwitch, Segmented, Sheet } from '../ui/components'
import { navigate, routeParams } from '../ui/router'
import { categoryLabel, txTitle } from '../ui/format'
import { ChartCanvas } from '../charts/ChartCanvas'
import { donut, incomeExpenseBars, lineSeries, savingsRateLine } from '../charts/configs'
import { balanceSeries, delta, expensesByCategory, monthlySeries, periodRange, summarize, topExpenses, topMerchants, type PeriodType } from '../domain/stats'
import { budgetStatus } from '../domain/budgets'
import { detectRecurring, recurringTotals } from '../domain/recurring'
import { accountingMonth, formatShortDate, monthRange, shiftMonth, todayISO, monthShort, monthLabel, type DateRange } from '../lib/dates'
import { formatMoney, formatPercent, parseAmount } from '../lib/money'
import { db } from '../db/db'
import { setSetting } from '../db/settings'
import { uid } from '../lib/text'
import type { Budget } from '../db/types'

type View = 'resumen' | 'presupuestos' | 'recurrentes'

export function Analysis({ route }: { route: string }) {
  const params = routeParams(route)
  const view = (params.get('vista') as View) || 'resumen'
  return (
    <main className="screen">
      <div className="title-row">
        <h1 className="title">Análisis</h1>
      </div>
      <Segmented<View>
        label="Vista"
        value={view}
        onChange={(v) => navigate(v === 'resumen' ? '/analisis' : `/analisis?vista=${v}`, true)}
        options={[
          { value: 'resumen', label: 'Resumen' },
          { value: 'presupuestos', label: 'Presupuestos' },
          { value: 'recurrentes', label: 'Recurrentes' },
        ]}
      />
      {view === 'resumen' && <Summary />}
      {view === 'presupuestos' && <Budgets />}
      {view === 'recurrentes' && <RecurringList />}
    </main>
  )
}

function DeltaLine({ cur, prev, lowerIsBetter = false }: { cur: number; prev: number; lowerIsBetter?: boolean }) {
  const { settings } = useData()
  const d = delta(cur, prev)
  if (d.diff === 0) return <div className="meta">Igual que el periodo anterior</div>
  if (d.ratio === null) return <div className="meta">Sin datos del periodo anterior</div>
  const good = lowerIsBetter ? d.diff < 0 : d.diff > 0
  return (
    <div className="meta" style={{ color: good ? 'var(--positive)' : undefined }}>
      {d.diff > 0 ? '▲' : '▼'} {formatMoney(Math.abs(d.diff), { currency: settings.currency })} ({formatPercent(Math.abs(d.ratio))}) vs. anterior
    </div>
  )
}

function Summary() {
  const { transactions, categories, categoryById, accounts, settings } = useData()
  const [type, setType] = useState<PeriodType>('mes')
  const [offset, setOffset] = useState(0)
  const today = todayISO()
  const [custom, setCustom] = useState<DateRange>(() => ({ start: accountingMonth(today, settings.monthStartDay).start, end: today }))
  const [picked, setPicked] = useState<string | null>(null)
  const currency = settings.currency

  const period = periodRange(type, offset, settings.monthStartDay, today, custom)
  const sum = useMemo(() => summarize(transactions, period), [transactions, period.start, period.end]) // eslint-disable-line react-hooks/exhaustive-deps
  const prev = useMemo(() => summarize(transactions, period.previous), [transactions, period.previous.start, period.previous.end]) // eslint-disable-line react-hooks/exhaustive-deps
  const byCat = useMemo(() => expensesByCategory(transactions, period, categories), [transactions, period.start, period.end, categories]) // eslint-disable-line react-hooks/exhaustive-deps
  const months = useMemo(() => monthlySeries(transactions, 12, settings.monthStartDay, today), [transactions, settings.monthStartDay, today])
  const balances = useMemo(() => balanceSeries(accounts, transactions, months), [accounts, transactions, months])
  const top = useMemo(() => topExpenses(transactions, period, 5), [transactions, period.start, period.end]) // eslint-disable-line react-hooks/exhaustive-deps
  const merchants = useMemo(() => topMerchants(transactions, period, 5), [transactions, period.start, period.end]) // eslint-disable-line react-hooks/exhaustive-deps

  // Donut: 4 categorías + "Resto" (cinco partes como máximo)
  const slices = useMemo(() => {
    const main = byCat.slice(0, 4).map((c) => ({
      id: c.categoryId ?? 'none',
      label: c.categoryId ? (categoryById.get(c.categoryId)?.name ?? 'Categoría') : 'Sin categoría',
      value: c.amount,
      color: c.categoryId ? (categoryById.get(c.categoryId)?.color ?? '#8a8f94') : '#a3a6ab',
    }))
    const rest = byCat.slice(4).reduce((s, c) => s + c.amount, 0)
    if (rest > 0) main.push({ id: '__rest__', label: 'Resto', value: rest, color: '#c4c7cc' })
    return main
  }, [byCat, categoryById])

  const donutBuild = useCallback((c: Parameters<ReturnType<typeof donut>>[0]) => donut(slices, currency, (i) => setPicked(slices[i]?.id ?? null))(c), [slices, currency])
  const barsBuild = useMemo(() => incomeExpenseBars(months, currency), [months, currency])
  const balanceBuild = useMemo(() => lineSeries(balances.map((b) => ({ label: monthShort(Number(b.key.slice(5)) - 1), value: b.balance })), currency), [balances, currency])
  const savingsBuild = useMemo(() => savingsRateLine(months.map((m) => ({ key: m.key, rate: m.savingsRate }))), [months])
  const hasMonths = months.some((m) => m.income || m.expenses)

  return (
    <>
      <Segmented<PeriodType>
        label="Periodo"
        value={type}
        onChange={(v) => {
          setType(v)
          setOffset(0)
          setPicked(null)
        }}
        options={[
          { value: 'mes', label: 'Mes' },
          { value: 'trimestre', label: 'Trimestre' },
          { value: 'año', label: 'Año' },
          { value: 'personalizado', label: 'Otro' },
        ]}
      />
      {type === 'personalizado' ? (
        <div className="form-grid">
          <label className="field">
            <span>Desde</span>
            <input className="input" type="date" value={custom.start} max={custom.end} onChange={(e) => e.target.value && setCustom({ ...custom, start: e.target.value })} />
          </label>
          <label className="field">
            <span>Hasta</span>
            <input className="input" type="date" value={custom.end} min={custom.start} onChange={(e) => e.target.value && setCustom({ ...custom, end: e.target.value })} />
          </label>
        </div>
      ) : (
        <div className="row" style={{ justifyContent: 'center' }}>
          <PeriodSwitch label={period.label} onPrev={() => setOffset(offset - 1)} onNext={() => setOffset(offset + 1)} nextDisabled={offset >= 0} />
        </div>
      )}

      <section className="card flush" aria-label="Resumen del periodo">
        <div className="kpis">
          <div className="kpi">
            <div className="card-label">Ingresos</div>
            <Money cents={sum.income} sign />
            <DeltaLine cur={sum.income} prev={prev.income} />
          </div>
          <div className="kpi">
            <div className="card-label">Gastos</div>
            <Money cents={-sum.expenses} plain />
            <DeltaLine cur={sum.expenses} prev={prev.expenses} lowerIsBetter />
          </div>
          <div className="kpi">
            <div className="card-label">Balance</div>
            <Money cents={sum.balance} sign />
            <DeltaLine cur={sum.balance} prev={prev.balance} />
          </div>
          <div className="kpi">
            <div className="card-label">Tasa de ahorro</div>
            <span className="money" style={{ fontSize: 21, fontWeight: 600, color: sum.savingsRate === null ? 'var(--faint)' : undefined }}>
              {sum.savingsRate === null ? '—' : formatPercent(sum.savingsRate)}
            </span>
            <div className="meta">{prev.savingsRate === null ? 'Sin ingresos antes' : `Antes: ${formatPercent(prev.savingsRate)}`}</div>
          </div>
        </div>
      </section>

      <section className="card">
        <div className="card-head">
          <h2>Gastos por categoría</h2>
          <span className="meta">Toca para ver el detalle</span>
        </div>
        <div style={{ position: 'relative' }}>
          <ChartCanvas build={donutBuild} height={200} isEmpty={!slices.length} emptyText="Sin gastos en este periodo" label="Gastos por categoría" />
          {slices.length > 0 && (
            <div className="chart-empty" style={{ flexDirection: 'column' }}>
              <span className="meta">Total</span>
              <Money cents={-sum.expenses} plain className="mid" />
            </div>
          )}
        </div>
        <div className="list" style={{ marginTop: 8 }}>
          {byCat.map((c) => {
            const cat = c.categoryId ? categoryById.get(c.categoryId) : undefined
            const id = c.categoryId ?? 'none'
            const open = picked === id
            return (
              <div key={id}>
                <button className="list-item" style={{ padding: '8px 0', minHeight: 52 }} onClick={() => setPicked(open ? null : id)} aria-expanded={open}>
                  <CategoryTile category={cat} size="sm" />
                  <div className="grow">
                    <div className="primary-line ellipsis">{cat?.name ?? 'Sin categoría'}</div>
                    <div className="secondary-line">
                      {formatPercent(sum.expenses ? c.amount / sum.expenses : 0)} · {c.count} mov.
                    </div>
                  </div>
                  <Money cents={-c.amount} plain />
                </button>
                {open && (
                  <div className="stack" style={{ gap: 0, padding: '0 0 8px 44px' }}>
                    {c.children.map((ch) => (
                      <button
                        key={ch.categoryId ?? 'none'}
                        className="row between small"
                        style={{ minHeight: 40 }}
                        onClick={() => navigate(`/movimientos?cat=${ch.categoryId ?? 'none'}`)}
                      >
                        <span className="muted">{ch.categoryId === c.categoryId ? 'General' : categoryLabel(ch.categoryId ? categoryById.get(ch.categoryId) : null, categoryById).split(' · ').pop()}</span>
                        <Money cents={-ch.amount} plain />
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </section>

      <section className="card">
        <div className="card-head">
          <h2>Ingresos y gastos</h2>
          <span className="meta">Últimos 12 meses</span>
        </div>
        <div className="legend">
          <span>
            <i style={{ background: 'var(--chart-income)' }} />
            Ingresos
          </span>
          <span>
            <i style={{ background: 'var(--accent)' }} />
            Gastos
          </span>
        </div>
        <ChartCanvas build={barsBuild} height={190} isEmpty={!hasMonths} emptyText="Cuando importes movimientos verás aquí cada mes" label="Ingresos frente a gastos por mes" />
      </section>

      <section className="card">
        <div className="card-head">
          <h2>Saldo total</h2>
          <Money cents={balances[balances.length - 1]?.balance ?? 0} plain />
        </div>
        <ChartCanvas build={balanceBuild} height={180} isEmpty={!accounts.length} emptyText="Crea una cuenta para ver su evolución" label="Evolución del saldo total" />
        <p className="meta" style={{ marginTop: 6 }}>Saldo de bancos, tarjetas y efectivo al final de cada mes. Las inversiones están en Patrimonio.</p>
      </section>

      <section className="card">
        <div className="card-head">
          <h2>Tasa de ahorro mensual</h2>
          <span className="meta">% de los ingresos</span>
        </div>
        <ChartCanvas build={savingsBuild} height={160} isEmpty={!months.some((m) => m.income)} emptyText="Aparecerá cuando haya ingresos" label="Tasa de ahorro mensual" />
      </section>

      <section className="card flush">
        <div className="card-head" style={{ padding: 'var(--pad) var(--pad) 0' }}>
          <h2>Mayores gastos</h2>
        </div>
        <div className="list">
          {top.length ? (
            top.map((t) => (
              <div key={t.id} className="list-item">
                <CategoryTile category={t.categoryId ? categoryById.get(t.categoryId) : null} size="sm" />
                <div className="grow">
                  <div className="primary-line ellipsis">{txTitle(t)}</div>
                  <div className="secondary-line">{formatShortDate(t.date)}</div>
                </div>
                <Money cents={t.amount} plain />
              </div>
            ))
          ) : (
            <p className="empty small">Sin gastos en este periodo</p>
          )}
        </div>
      </section>

      <section className="card flush">
        <div className="card-head" style={{ padding: 'var(--pad) var(--pad) 0' }}>
          <h2>Dónde más gastas</h2>
        </div>
        <div className="list">
          {merchants.length ? (
            merchants.map((m) => (
              <div key={m.key} className="list-item" style={{ display: 'block' }}>
                <div className="row between">
                  <span className="primary-line ellipsis">{m.name}</span>
                  <Money cents={-m.amount} plain />
                </div>
                <div className="secondary-line">
                  {m.count} compra{m.count === 1 ? '' : 's'} · {categoryLabel(m.categoryId ? categoryById.get(m.categoryId) : null, categoryById)}
                </div>
                <div className="rank-bar" style={{ width: `${(m.amount / merchants[0].amount) * 100}%` }} />
              </div>
            ))
          ) : (
            <p className="empty small">Sin compras en este periodo</p>
          )}
        </div>
      </section>
    </>
  )
}

function Budgets() {
  const { budgets, transactions, categories, categoryById, settings } = useData()
  const toast = useToast()
  const [offset, setOffset] = useState(0)
  const [editing, setEditing] = useState<Partial<Budget> | null>(null)
  const today = todayISO()
  const curKey = accountingMonth(today, settings.monthStartDay).key
  const { year, month0 } = shiftMonth(curKey, offset)
  const range = monthRange(year, month0, settings.monthStartDay)
  const statuses = budgets
    .map((b) => budgetStatus(b, transactions, range, categories))
    .sort((a, b) => b.ratio - a.ratio)
  const total = budgets.reduce((s, b) => s + b.amount, 0)
  const spent = statuses.reduce((s, x) => s + x.spent, 0)

  return (
    <>
      <div className="row between">
        <PeriodSwitch label={monthLabel(range.key)} onPrev={() => setOffset(offset - 1)} onNext={() => setOffset(offset + 1)} nextDisabled={offset >= 0} />
        <button className="btn small primary" onClick={() => setEditing({})}>
          <Plus size={16} /> Presupuesto
        </button>
      </div>
      {budgets.length === 0 ? (
        <div className="card">
          <div className="empty">
            <strong>Sin presupuestos</strong>
            <p>Pon un límite mensual a las categorías que quieras vigilar (supermercado, restaurantes, ocio…). Te avisaremos al llegar al 80 % y al pasarte.</p>
          </div>
        </div>
      ) : (
        <>
          <section className="card">
            <div className="row between">
              <div>
                <div className="card-label">Gastado en categorías con presupuesto</div>
                <Money cents={-spent} plain className="mid" />
              </div>
              <div className="right">
                <div className="card-label">de</div>
                <Money cents={total} plain />
              </div>
            </div>
          </section>
          <section className="card flush list">
            {statuses.map((s) => {
              const cat = categoryById.get(s.budget.categoryId)
              return (
                <button key={s.budget.id} className="list-item" style={{ display: 'block', paddingTop: 14, paddingBottom: 14 }} onClick={() => setEditing(s.budget)}>
                  <div className="row">
                    <CategoryTile category={cat} size="sm" />
                    <div className="grow">
                      <div className="row between">
                        <span className="primary-line ellipsis">{cat?.name ?? 'Categoría borrada'}</span>
                        <span className="small">
                          <Money cents={s.spent} plain /> <span className="muted">/ {formatMoney(s.budget.amount, { currency: settings.currency, compact: s.budget.amount % 100 === 0 })}</span>
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className={`track ${s.level === 'superado' ? 'over' : s.level === 'aviso' ? 'warn' : ''}`} style={{ marginTop: 10 }} role="progressbar" aria-valuenow={Math.round(s.ratio * 100)} aria-valuemin={0} aria-valuemax={100}>
                    <i style={{ width: `${Math.min(100, s.ratio * 100)}%` }} />
                  </div>
                  <div className="plan-caption">
                    <span>
                      {s.level === 'superado' ? (
                        <span className="pill neg">Superado en {formatMoney(-s.remaining, { currency: settings.currency })}</span>
                      ) : s.level === 'aviso' ? (
                        <span className="pill warn">{Math.round(s.ratio * 100)} % usado</span>
                      ) : (
                        `${Math.round(s.ratio * 100)} % usado`
                      )}
                    </span>
                    {s.remaining > 0 && <span>Quedan {formatMoney(s.remaining, { currency: settings.currency })}</span>}
                  </div>
                </button>
              )
            })}
          </section>
        </>
      )}
      {editing && (
        <BudgetEditor
          budget={editing}
          onClose={() => setEditing(null)}
          onSaved={(msg) => toast.show(msg)}
          taken={new Set(budgets.filter((b) => b.id !== editing.id).map((b) => b.categoryId))}
        />
      )}
    </>
  )
}

function BudgetEditor({ budget, onClose, onSaved, taken }: { budget: Partial<Budget>; onClose: () => void; onSaved: (m: string) => void; taken: Set<string> }) {
  const { categoryById } = useData()
  const [categoryId, setCategoryId] = useState<string | null>(budget.categoryId ?? null)
  const [amount, setAmount] = useState(budget.amount ? (budget.amount / 100).toFixed(2).replace('.', ',') : '')
  const [picking, setPicking] = useState(false)
  const cents = Math.abs(parseAmount(amount) ?? 0)
  const cat = categoryId ? categoryById.get(categoryId) : undefined
  const dup = !!categoryId && taken.has(categoryId)
  return (
    <Sheet
      title={budget.id ? 'Editar presupuesto' : 'Nuevo presupuesto'}
      onClose={onClose}
      footer={
        <>
          {budget.id && (
            <button
              className="btn danger"
              onClick={async () => {
                await db.budgets.delete(budget.id!)
                onSaved('Presupuesto borrado')
                onClose()
              }}
            >
              Borrar
            </button>
          )}
          <button
            className="btn primary block"
            disabled={!categoryId || !cents || dup}
            onClick={async () => {
              await db.budgets.put({ id: budget.id ?? uid(), categoryId: categoryId!, amount: cents })
              onSaved('Presupuesto guardado')
              onClose()
            }}
          >
            Guardar
          </button>
        </>
      }
    >
      <div className="field">
        <span className="field-label">Categoría</span>
        <button className="card row" style={{ padding: 10 }} onClick={() => setPicking(true)}>
          <CategoryTile category={cat} size="sm" />
          <span className="grow" style={{ textAlign: 'left', fontWeight: 500 }}>
            {cat ? categoryLabel(cat, categoryById) : 'Elegir categoría'}
          </span>
        </button>
        {dup && <span className="small" style={{ color: 'var(--warning)' }}>Esa categoría ya tiene presupuesto.</span>}
        {cat && !cat.parentId && <span className="meta">Incluye todas sus subcategorías.</span>}
      </div>
      <label className="field">
        <span>Límite mensual</span>
        <input className="input" inputMode="decimal" placeholder="300,00" value={amount} onChange={(e) => setAmount(e.target.value)} />
      </label>
      {picking && (
        <CategoryPicker
          value={categoryId}
          kind="gasto"
          onClose={() => setPicking(false)}
          onPick={(id) => {
            setCategoryId(id)
            setPicking(false)
          }}
        />
      )}
    </Sheet>
  )
}

function RecurringList() {
  const { transactions, categoryById, settings } = useData()
  const toast = useToast()
  const list = useMemo(() => detectRecurring(transactions, todayISO()).filter((r) => !settings.dismissedRecurring.includes(r.key)), [transactions, settings.dismissedRecurring])
  const totals = recurringTotals(list)
  return (
    <>
      <section className="card">
        <div className="row between">
          <div>
            <div className="card-label">Suscripciones y recibos al mes</div>
            <Money cents={-totals.monthly} plain className="big" />
          </div>
          <div className="right">
            <div className="card-label">Al año</div>
            <Money cents={-totals.annual} plain className="mid" />
          </div>
        </div>
        <p className="meta" style={{ marginTop: 8 }}>Detectados automáticamente: mismo comercio, importe parecido y unos 30 días entre cargos.</p>
      </section>
      {list.length === 0 ? (
        <div className="card">
          <div className="empty">
            <strong>Nada recurrente todavía</strong>
            <p>Hacen falta al menos dos o tres meses de movimientos para detectar las suscripciones y los recibos.</p>
          </div>
        </div>
      ) : (
        <section className="card flush list">
          {list.map((r) => {
            const cat = r.categoryId ? categoryById.get(r.categoryId) : undefined
            return (
              <div key={r.key} className="list-item">
                <CategoryTile category={cat} size="sm" />
                <div className="grow">
                  <div className="primary-line ellipsis">{r.name}</div>
                  <div className="secondary-line">
                    Próximo hacia el {formatShortDate(r.nextDate)}
                    {r.changed ? ' · el importe ha cambiado' : ''}
                  </div>
                </div>
                <div className="trail">
                  <Money cents={-r.monthly} plain />
                  <div className="meta">{formatMoney(r.annual, { currency: settings.currency, compact: true })}/año</div>
                </div>
                <button
                  className="icon-btn plain"
                  aria-label={`Ocultar ${r.name}`}
                  onClick={async () => {
                    await setSetting('dismissedRecurring', [...settings.dismissedRecurring, r.key])
                    toast.show(`${r.name} oculto`, { action: { label: 'Deshacer', run: () => void setSetting('dismissedRecurring', settings.dismissedRecurring) } })
                  }}
                >
                  <EyeOff size={18} />
                </button>
              </div>
            )
          })}
        </section>
      )}
      {settings.dismissedRecurring.length > 0 && (
        <button className="btn small ghost" onClick={() => void setSetting('dismissedRecurring', [])}>
          <Pencil size={14} /> Mostrar los {settings.dismissedRecurring.length} ocultos
        </button>
      )}
    </>
  )
}
