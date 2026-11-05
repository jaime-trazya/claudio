import { useCallback, useMemo, useState } from 'react'
import { EyeOff, Pencil, Plus } from 'lucide-react'
import { useData } from '../ui/useData'
import { useToast } from '../ui/toast'
import { CategoryPicker, CategoryTile, Money, PeriodSwitch, Segmented, Sheet } from '../ui/components'
import { navigate, routeParams } from '../ui/router'
import { categoryLabel, txTitle } from '../ui/format'
import { ChartCanvas } from '../charts/ChartCanvas'
import { donut, incomeExpenseBars, lineSeries, savingsRateLine, singleBars } from '../charts/configs'
import { balanceSeries, categoryMonthly, comparableRange, delta, expensesByCategory, monthlySeries, periodRange, summarize, topExpenses, topMerchants, type PeriodType } from '../domain/stats'
import { budgetStatus } from '../domain/budgets'
import { isExternalTransfer } from '../domain/transfers'
import { detectRecurring, recurringTotals } from '../domain/recurring'
import { chargesCalendar } from '../domain/insights'
import { netWorth } from '../domain/investments'
import { addDays, formatDay } from '../lib/dates'
import { accountingMonth, formatShortDate, monthRange, monthsBetween, shiftMonth, todayISO, monthShort, monthLabel, type DateRange } from '../lib/dates'
import { formatMoney, formatPercent, formatRate, parseAmount } from '../lib/money'
import { db } from '../db/db'
import { setSetting } from '../db/settings'
import { uid } from '../lib/text'
import type { Budget } from '../db/types'

type View = 'resumen' | 'presupuestos' | 'recurrentes' | 'calendario'

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
          { value: 'recurrentes', label: 'Recibos' },
          { value: 'calendario', label: 'Calendario' },
        ]}
      />
      {view === 'resumen' && <Summary />}
      {view === 'presupuestos' && <Budgets />}
      {view === 'recurrentes' && <RecurringList />}
      {view === 'calendario' && <ChargesCalendar />}
    </main>
  )
}

/** Variación frente al periodo anterior. El % solo se muestra si tiene sentido (base positiva y no diminuta). */
function DeltaLine({ cur, prev, lowerIsBetter = false, percent = true, label }: { cur: number; prev: number; lowerIsBetter?: boolean; percent?: boolean; label: string }) {
  const { settings } = useData()
  const d = delta(cur, prev)
  if (d.diff === 0) return <div className="meta">Igual que {label}</div>
  if (prev === 0 && percent) return <div className="meta">Nada {label}</div>
  const good = lowerIsBetter ? d.diff < 0 : d.diff > 0
  const showPct = percent && prev > 0 && d.ratio !== null && Math.abs(d.ratio) < 10
  return (
    <div className="meta" style={{ color: good ? 'var(--positive)' : undefined }}>
      {d.diff > 0 ? '▲' : '▼'} {formatMoney(Math.abs(d.diff), { currency: settings.currency })}
      {showPct ? ` (${formatPercent(Math.abs(d.ratio!))})` : ''} vs. {label}
    </div>
  )
}

function Summary() {
  const { transactions: rawTxs, statTxs: transactions, categories, categoryById, accounts, settings } = useData()
  const [type, setType] = useState<PeriodType>('mes')
  const [offset, setOffset] = useState(0)
  const today = todayISO()
  const [custom, setCustom] = useState<DateRange>(() => ({ start: accountingMonth(today, settings.monthStartDay).start, end: today }))
  const [picked, setPicked] = useState<string | null>(null)
  const [detail, setDetail] = useState<string | null>(null)
  const currency = settings.currency

  const period = periodRange(type, offset, settings.monthStartDay, today, custom)
  const cmp = comparableRange(period, period.previous, today)
  const cmpLabel = cmp.partial ? 'mismos días antes' : 'periodo anterior'
  const sum = useMemo(() => summarize(transactions, period, categoryById), [transactions, period.start, period.end, categoryById]) // eslint-disable-line react-hooks/exhaustive-deps
  const prev = useMemo(() => summarize(transactions, cmp, categoryById), [transactions, cmp.start, cmp.end, categoryById]) // eslint-disable-line react-hooks/exhaustive-deps
  const byCat = useMemo(() => expensesByCategory(transactions, period, categories), [transactions, period.start, period.end, categories]) // eslint-disable-line react-hooks/exhaustive-deps
  const external = useMemo(() => {
    let inn = 0
    let out = 0
    for (const t of transactions) {
      if (!isExternalTransfer(t) || t.date < period.start || t.date > period.end) continue
      if (t.amount > 0) inn += t.amount
      else out -= t.amount
    }
    return { in: inn, out }
  }, [transactions, period.start, period.end])  
  // Las gráficas mensuales siguen al periodo: el año elegido, o los 12 meses que acaban en el periodo
  const chartEnd = period.end < today ? period.end : today
  const [span, setSpan] = useState<6 | 12>(() => (typeof window !== 'undefined' && window.innerWidth < 560 ? 6 : 12))
  const [selMonth, setSelMonth] = useState<number | null>(null)
  const nMonths = type === 'personalizado' ? Math.min(24, Math.max(1, monthsBetween(period.start, period.end))) : type === 'año' ? 12 : span
  const months = useMemo(() => monthlySeries(transactions, nMonths, settings.monthStartDay, type === 'año' ? period.end : chartEnd, categoryById), [transactions, nMonths, settings.monthStartDay, type, period.end, chartEnd, categoryById])  
  const monthsLabel = `${monthLabel(months[0].key)} – ${monthLabel(months[months.length - 1].key)}`
  const balances = useMemo(() => balanceSeries(accounts, rawTxs, months), [accounts, rawTxs, months])
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
  const sel = selMonth !== null && selMonth < months.length ? selMonth : null
  const barsBuild = useMemo(() => incomeExpenseBars(months, currency, sel), [months, currency, sel])
  const balanceBuild = useMemo(() => lineSeries(balances.map((b) => ({ label: monthShort(Number(b.key.slice(5)) - 1), value: b.balance })), currency), [balances, currency])
  const savingsBuild = useMemo(() => savingsRateLine(months.map((m) => ({ key: m.key, rate: m.savingsRate })), sel), [months, sel])
  const pickMonth = useCallback((i: number) => setSelMonth((cur) => (cur === i ? null : i)), [])
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
            <DeltaLine cur={sum.income} prev={prev.income} label={cmpLabel} />
          </div>
          <div className="kpi">
            <div className="card-label">Gastos</div>
            <Money cents={-sum.expenses} plain />
            <DeltaLine cur={sum.expenses} prev={prev.expenses} lowerIsBetter label={cmpLabel} />
          </div>
          <div className="kpi">
            <div className="card-label">Balance</div>
            <Money cents={sum.balance} sign />
            <DeltaLine cur={sum.balance} prev={prev.balance} percent={false} label={cmpLabel} />
          </div>
          <div className="kpi">
            <div className="card-label">Tasa de ahorro</div>
            <span className="money" style={{ fontSize: 21, fontWeight: 600, color: sum.savingsRate === null ? 'var(--faint)' : sum.savingsRate < 0 ? 'var(--negative)' : undefined }}>
              {formatRate(sum.savingsRate)}
            </span>
            <div className="meta">{prev.savingsRate === null ? 'Sin ingresos antes' : `Antes: ${formatRate(prev.savingsRate)}`}</div>
          </div>
        </div>
      </section>

      {(external.in > 0 || external.out > 0) && (
        <p className="meta" style={{ padding: '0 4px' }}>
          Incluye {external.in > 0 && <><Money cents={external.in} sign /> que entraron</>}
          {external.in > 0 && external.out > 0 ? ' y ' : ' '}
          {external.out > 0 && <><Money cents={-external.out} plain /> que salieron</>} con cuentas que no tienes en la app (traspasos sin pareja, por ejemplo una recarga con otra tarjeta). Si añades esa cuenta, se emparejan solos y dejan de contar.
        </p>
      )}

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
                    <button className="btn small" style={{ alignSelf: 'flex-start', margin: '2px 0 6px' }} onClick={() => setDetail(c.categoryId ?? 'none')}>
                      Ver evolución y comercios
                    </button>
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
          <span className="meta">{monthsLabel}</span>
        </div>
        <div className="row between" style={{ marginBottom: 8 }}>
          <div className="legend" style={{ marginBottom: 0 }}>
            <span>
              <i style={{ background: 'var(--chart-income)' }} />
              Ingresos
            </span>
            <span>
              <i style={{ background: 'var(--accent)' }} />
              Gastos
            </span>
          </div>
          {type !== 'año' && type !== 'personalizado' && (
            <div className="segmented" style={{ padding: 2 }}>
              {([6, 12] as const).map((n) => (
                <button key={n} aria-pressed={span === n} style={{ minHeight: 28, padding: '0 10px', fontSize: 13, whiteSpace: 'nowrap' }} onClick={() => { setSpan(n); setSelMonth(null) }}>
                  {n}M
                </button>
              ))}
            </div>
          )}
        </div>
        <ChartCanvas build={barsBuild} height={200} isEmpty={!hasMonths} emptyText="Cuando importes movimientos verás aquí cada mes" label="Ingresos frente a gastos por mes" onSelect={pickMonth} />
        <MonthDetail month={sel !== null ? months[sel] : null} hint={hasMonths} />
      </section>

      <section className="card">
        <div className="card-head">
          <h2>Saldo total</h2>
          <Money cents={balances[balances.length - 1]?.balance ?? 0} plain />
        </div>
        <ChartCanvas build={balanceBuild} height={180} isEmpty={!accounts.length} emptyText="Crea una cuenta para ver su evolución" label="Evolución del saldo total" onSelect={pickMonth} />
        {sel !== null && balances[sel] && (
          <p className="small" style={{ marginTop: 8 }}>
            <strong>Fin de {monthLabel(balances[sel].key)}:</strong> <Money cents={balances[sel].balance} plain />
          </p>
        )}
        <p className="meta" style={{ marginTop: 6 }}>Saldo de bancos, tarjetas y efectivo al final de cada mes. Las inversiones están en Patrimonio.</p>
      </section>

      <section className="card">
        <div className="card-head">
          <h2>Tasa de ahorro mensual</h2>
          <span className="meta">{monthsLabel}</span>
        </div>
        <ChartCanvas build={savingsBuild} height={170} isEmpty={!months.some((m) => m.income)} emptyText="Aparecerá cuando haya ingresos" label="Tasa de ahorro mensual" onSelect={pickMonth} />
        {sel !== null && (
          <p className="small" style={{ marginTop: 8 }}>
            <strong>{monthLabel(months[sel].key)}:</strong> {months[sel].savingsRate === null ? 'sin ingresos' : `ahorro ${formatRate(months[sel].savingsRate)}`}
          </p>
        )}
        <p className="meta" style={{ marginTop: 6 }}>Lo que te queda de lo que ingresas cada mes. Por debajo de cero, gastaste más de lo que entró (la barra se corta en −100 %).</p>
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
      {detail && <CategoryDetail categoryId={detail === 'none' ? null : detail} period={period} onClose={() => setDetail(null)} />}
    </>
  )
}

/** Evolución de una categoría en los últimos 12 meses, su media y dónde se gasta */
function CategoryDetail({ categoryId, period, onClose }: { categoryId: string | null; period: DateRange; onClose: () => void }) {
  const { statTxs: transactions, categories, categoryById, settings } = useData()
  const cat = categoryId ? categoryById.get(categoryId) : undefined
  const months = useMemo(() => monthlySeries([], 12, settings.monthStartDay, period.end < todayISO() ? period.end : todayISO()), [settings.monthStartDay, period.end])
  const series = useMemo(() => categoryMonthly(transactions, categoryId, months, categories), [transactions, categoryId, months, categories])
  const build = useMemo(() => singleBars(series, settings.currency, cat?.color), [series, settings.currency, cat?.color])
  const active = series.filter((m) => m.amount > 0)
  const avg = active.length ? Math.round(series.reduce((s, m) => s + m.amount, 0) / series.length) : 0
  const ids = categoryId ? new Set([categoryId, ...categories.filter((c) => c.parentId === categoryId).map((c) => c.id)]) : null
  const inCat = transactions.filter((t) => (ids ? !!t.categoryId && ids.has(t.categoryId) : !t.categoryId && t.kind === 'gasto'))
  const merchants = topMerchants(inCat, period, 6)
  const year = { start: months[0].start, end: months[months.length - 1].end }
  const total12 = series.reduce((s, m) => s + m.amount, 0)
  return (
    <Sheet title={cat?.name ?? 'Sin categoría'} onClose={onClose} full>
      <div className="card flush">
        <div className="kpis">
          <div className="kpi">
            <div className="card-label">Media al mes</div>
            <Money cents={-avg} plain />
            <div className="meta">últimos 12 meses</div>
          </div>
          <div className="kpi">
            <div className="card-label">En 12 meses</div>
            <Money cents={-total12} plain />
            <div className="meta">{formatShortDate(year.start)} – {formatShortDate(year.end)}</div>
          </div>
        </div>
      </div>
      <div className="card">
        <div className="card-head">
          <h3>Mes a mes</h3>
        </div>
        <ChartCanvas build={build} height={180} isEmpty={!active.length} emptyText="Sin gastos en estos meses" label={`Gasto mensual en ${cat?.name ?? 'sin categoría'}`} />
      </div>
      <div className="card flush">
        <div className="card-head" style={{ padding: 'var(--pad) var(--pad) 0' }}>
          <h3>Dónde, en el periodo elegido</h3>
        </div>
        <div className="list">
          {merchants.length ? (
            merchants.map((m) => (
              <div key={m.key} className="list-item">
                <div className="grow">
                  <div className="primary-line ellipsis">{m.name}</div>
                  <div className="secondary-line">{m.count} compra{m.count === 1 ? '' : 's'}</div>
                </div>
                <Money cents={-m.amount} plain />
              </div>
            ))
          ) : (
            <p className="empty small">Nada en este periodo</p>
          )}
        </div>
      </div>
      <a className="btn block" href={`#/movimientos?cat=${categoryId ?? 'none'}`} onClick={onClose}>
        Ver todos los movimientos
      </a>
    </Sheet>
  )
}

/** Detalle del mes tocado en la gráfica (en el móvil, en lugar de un globo encima de las barras) */
function MonthDetail({ month, hint }: { month: { key: string; income: number; expenses: number; balance: number; savingsRate: number | null } | null; hint: boolean }) {
  if (!month) return hint ? <p className="meta" style={{ marginTop: 8, textAlign: 'center' }}>Toca un mes para ver el detalle</p> : null
  return (
    <div className="card" style={{ marginTop: 10, padding: '12px 14px', background: 'var(--raised)', borderColor: 'transparent' }}>
      <div className="row between">
        <strong>{monthLabel(month.key)}</strong>
        <a className="small" href={`#/movimientos?mes=${month.key}`}>
          Ver movimientos
        </a>
      </div>
      <div className="row" style={{ gap: 16, marginTop: 6, flexWrap: 'wrap' }}>
        <span className="small">
          <span className="muted">Ingresos </span>
          <Money cents={month.income} sign />
        </span>
        <span className="small">
          <span className="muted">Gastos </span>
          <Money cents={-month.expenses} plain />
        </span>
        <span className="small">
          <span className="muted">Balance </span>
          <Money cents={month.balance} sign />
        </span>
      </div>
    </div>
  )
}

function Budgets() {
  const { budgets, statTxs: transactions, categories, categoryById, settings } = useData()
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

/** Los recibos de los próximos 30 días, día a día, con el dinero que te irá quedando */
function ChargesCalendar() {
  const { accounts, transactions, snapshots, categoryById, settings } = useData()
  const today = todayISO()
  const end = addDays(today, 30)
  const recurring = detectRecurring(transactions, today).filter((r) => !settings.dismissedRecurring.includes(r.key))
  const cash = netWorth(accounts, transactions, snapshots).cash
  const days = chargesCalendar(recurring, today, end, cash)
  const total = days.reduce((s, d) => s + d.items.reduce((x, i) => x + i.amount, 0), 0)
  const last = days.length ? days[days.length - 1].balance : cash
  return (
    <>
      <section className="card">
        <div className="card-label">Recibos de aquí a 30 días</div>
        <Money cents={-total} plain className="big" />
        <p className="meta" style={{ marginTop: 6 }}>
          Tienes <Money cents={cash} plain /> en tus cuentas; tras estos recibos te quedarían <Money cents={last} plain /> (sin contar ingresos ni el gasto del día a día).
        </p>
        {last < 0 && <p className="small" style={{ color: 'var(--negative)', marginTop: 6 }}>Con lo que tienes no llegas a pagarlos todos: revisa antes de que lleguen.</p>}
      </section>
      {days.length === 0 ? (
        <div className="card empty">
          <strong>Sin recibos a la vista</strong>
          <p>Cuando la app detecte pagos que se repiten cada mes (alquiler, luz, suscripciones…) aparecerán aquí con su fecha.</p>
        </div>
      ) : (
        <section className="card flush list" aria-label="Calendario de recibos">
          {days.map((d) => (
            <div key={d.date} className="calendar-day">
              <div className="calendar-date">
                <strong>{formatDay(d.date, today)}</strong>
                <span className="meta">
                  Quedarían <Money cents={d.balance} plain />
                </span>
              </div>
              {d.items.map((it, i) => (
                <div key={i} className="list-item">
                  <CategoryTile category={it.categoryId ? categoryById.get(it.categoryId) : null} size="sm" />
                  <div className="grow primary-line ellipsis">{it.name}</div>
                  <Money cents={-it.amount} plain />
                </div>
              ))}
            </div>
          ))}
        </section>
      )}
      <p className="meta">Fechas previstas a partir de los cargos de los meses anteriores. Si alguno no es un recibo, ocúltalo en «Recibos».</p>
    </>
  )
}
