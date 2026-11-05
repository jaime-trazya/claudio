import { useState } from 'react'
import { ChevronDown, Plus, Search, X } from 'lucide-react'
import { useData } from '../ui/useData'
import { useEditor } from '../ui/editor'
import { Money, Sheet } from '../ui/components'
import { TxRow } from '../ui/TxRow'
import { routeParams, navigate } from '../ui/router'
import { categoryLabel, KIND_LABEL } from '../ui/format'
import { accountingMonth, formatDay, monthLabel, todayISO } from '../lib/dates'
import { normalize } from '../lib/text'
import { parseSearch } from '../domain/insights'
import { accountBalance, isCountable, summarize } from '../domain/stats'
import type { Transaction } from '../db/types'

type FilterKey = 'mes' | 'cuenta' | 'cat' | 'tipo' | 'estado'

interface Option {
  value: string
  label: string
}

export function Movements({ route }: { route: string }) {
  const { transactions, statTxs, accounts, categories, categoryById, settings } = useData()
  const { openTx } = useEditor()
  const params = routeParams(route)
  const [q, setQ] = useState('')
  const [open, setOpen] = useState<FilterKey | null>(null)
  const [limit, setLimit] = useState(150)

  const fMes = params.get('mes') ?? ''
  const fCuenta = params.get('cuenta') ?? ''
  const fCat = params.get('cat') ?? ''
  const fTipo = params.get('tipo') ?? ''
  const fEstado = params.get('estado') ?? ''
  const filters: Record<FilterKey, string> = { mes: fMes, cuenta: fCuenta, cat: fCat, tipo: fTipo, estado: fEstado }
  const startDay = settings.monthStartDay
  const setFilter = (k: FilterKey, v: string) => {
    const p = new URLSearchParams(params)
    if (v) p.set(k, v)
    else p.delete(k)
    const s = p.toString()
    navigate(`/movimientos${s ? `?${s}` : ''}`, true)
  }

  const monthOptions: Option[] = (() => {
    const keys = new Set<string>([accountingMonth(todayISO(), startDay).key])
    for (const t of transactions) keys.add(accountingMonth(t.date, startDay).key)
    return [...keys].sort().reverse().map((k) => ({ value: k, label: monthLabel(k) }))
  })()

  const catIds = (() => {
    if (!fCat) return null
    if (fCat === 'none') return new Set(['none'])
    return new Set([fCat, ...categories.filter((c) => c.parentId === fCat).map((c) => c.id)])
  })()

  // «¿Cuánto gasté en Mercadona este año?»: el periodo se separa del texto que se busca
  const search = parseSearch(q, todayISO(), startDay)
  const nq = normalize(search.text)
  const list = (() => {
    return transactions.filter((t) => {
      if (fCuenta && t.accountId !== fCuenta) return false
      if (fTipo && t.kind !== fTipo) return false
      if (fEstado === 'excluido' ? !t.excluded : fEstado && t.status !== fEstado) return false
      if (fMes && accountingMonth(t.date, startDay).key !== fMes) return false
      if (catIds) {
        const ids = t.splits?.length ? t.splits.map((s) => s.categoryId ?? 'none') : [t.categoryId ?? 'none']
        if (!ids.some((id) => catIds.has(id))) return false
      }
      if (search.range && (t.date < search.range.start || t.date > search.range.end)) return false
      if (nq) {
        const hay = normalize([t.description, t.bankDescription, t.notes, t.tags.join(' '), categoryById.get(t.categoryId ?? '')?.name].filter(Boolean).join(' '))
        if (!hay.includes(nq) && !String(Math.abs(t.amount) / 100).replace('.', ',').includes(search.text.trim())) return false
      }
      return true
    })
  })()

  const groups = (() => {
    const out: { date: string; items: Transaction[]; total: number }[] = []
    for (const t of list.slice(0, limit)) {
      const last = out[out.length - 1]
      if (last && last.date === t.date) {
        last.items.push(t)
        last.total += t.amount
      } else out.push({ date: t.date, items: [t], total: t.amount })
    }
    return out
  })()

  // Resumen: sin cuenta elegida, ingresos y gastos reales (sin traspasos ni aportaciones);
  // con cuenta elegida, el dinero que entra y sale de esa cuenta y su saldo actual
  const statById = new Map(statTxs.map((t) => [t.id, t]))
  const summary = summarize(list.map((t) => statById.get(t.id) ?? t), { start: '0000-01-01', end: '9999-12-31' }, categoryById)
  const inflow = list.reduce((s, t) => s + (t.amount > 0 ? t.amount : 0), 0)
  const outflow = list.reduce((s, t) => s + (t.amount < 0 ? -t.amount : 0), 0)
  const filteredAccount = fCuenta ? accounts.find((a) => a.id === fCuenta) : undefined
  const dayTotal = (items: Transaction[]) => items.reduce((s, t) => s + (fCuenta || isCountable(t) ? t.amount : 0), 0)
  const today = todayISO()

  const options: Record<FilterKey, { title: string; all: string; items: Option[] }> = {
    mes: { title: 'Mes', all: 'Todos los meses', items: monthOptions },
    cuenta: { title: 'Cuenta', all: 'Todas las cuentas', items: accounts.map((a) => ({ value: a.id, label: a.name })) },
    cat: {
      title: 'Categoría',
      all: 'Todas las categorías',
      items: [{ value: 'none', label: 'Sin categoría' }, ...categories.map((c) => ({ value: c.id, label: c.parentId ? `   ${c.name}` : c.name }))],
    },
    tipo: { title: 'Tipo', all: 'Todos los tipos', items: (Object.keys(KIND_LABEL) as Transaction['kind'][]).map((k) => ({ value: k, label: KIND_LABEL[k] })) },
    estado: {
      title: 'Estado',
      all: 'Todos',
      items: [
        { value: 'confirmado', label: 'Confirmados' },
        { value: 'pendiente', label: 'Pendientes de confirmar' },
        { value: 'excluido', label: 'Que no cuentan en gastos' },
      ],
    },
  }
  const chipLabel = (k: FilterKey) => {
    const v = filters[k]
    if (!v) return options[k].title
    if (k === 'cat') return v === 'none' ? 'Sin categoría' : categoryLabel(categoryById.get(v), categoryById)
    return options[k].items.find((o) => o.value === v)?.label.trim() ?? options[k].title
  }
  const anyFilter = Object.values(filters).some(Boolean)

  return (
    <main className="screen">
      <div className="title-row">
        <h1 className="title">Movimientos</h1>
        <button className="icon-btn primary" onClick={() => openTx(undefined, filters.cuenta ? { accountId: filters.cuenta } : undefined)} aria-label="Añadir movimiento">
          <Plus size={22} />
        </button>
      </div>
      <div className="search">
        <Search size={18} />
        <input className="input" type="search" placeholder="Busca o pregunta: «Mercadona este año»" value={q} onChange={(e) => setQ(e.target.value)} enterKeyHint="search" />
      </div>
      <div className="chips" role="toolbar" aria-label="Filtros">
        {(Object.keys(options) as FilterKey[]).map((k) => (
          <button key={k} className={`chip ${filters[k] ? 'on' : ''}`} onClick={() => setOpen(k)}>
            {chipLabel(k)} <ChevronDown size={15} />
          </button>
        ))}
        {anyFilter && (
          <button className="chip" onClick={() => navigate('/movimientos', true)} aria-label="Quitar filtros">
            <X size={15} /> Quitar
          </button>
        )}
      </div>
      {list.length > 0 && (
        <section className="card flush" aria-label="Resumen">
          <div className="kpis">
            {filteredAccount ? (
              <>
                <div className="kpi">
                  <div className="card-label">Saldo de {filteredAccount.name}</div>
                  <Money cents={accountBalance(filteredAccount, transactions)} plain />
                  <div className="meta">{list.length} movimientos</div>
                </div>
                <div className="kpi" style={{ borderRight: 0 }}>
                  <div className="card-label">Entra / sale</div>
                  <Money cents={inflow} sign className="small" />
                  <div>
                    <Money cents={-outflow} plain className="small" />
                  </div>
                </div>
              </>
            ) : (
              <div className="kpi-row">
                <div>
                  <div className="card-label">Ingresos</div>
                  <Money cents={summary.income} sign />
                </div>
                <div>
                  <div className="card-label">Gastos</div>
                  <Money cents={-summary.expenses} plain />
                </div>
                <div>
                  <div className="card-label">Ahorro</div>
                  <Money cents={summary.balance} sign />
                </div>
              </div>
            )}
          </div>
          <p className="meta" style={{ padding: '0 var(--pad) 10px' }}>
            {search.label ? `${search.text ? `«${search.text}» · ` : ''}${search.label} · ` : ''}
            {list.length} movimiento{list.length === 1 ? '' : 's'}
            {filteredAccount ? '' : ' · sin traspasos entre tus cuentas. El ahorro es lo que te ha sobrado, no lo que tienes (eso está en Inicio).'}
          </p>
        </section>
      )}

      {groups.length === 0 && (
        <div className="card">
          <div className="empty">
            <strong>{transactions.length ? 'Nada coincide con la búsqueda' : 'Aún no hay movimientos'}</strong>
            <p>{transactions.length ? 'Prueba con otro filtro o quita los filtros.' : 'Importa un extracto desde Inicio o añade un movimiento con el botón +.'}</p>
          </div>
        </div>
      )}

      {groups.length > 0 && (
        // Una sola lista con la fecha de cada día fija arriba al desplazar (antes, una tarjeta por día)
        <section className="card flush tx-days" aria-label="Movimientos">
          {groups.map((g) => (
            <div key={g.date} className="tx-day" role="group" aria-label={formatDay(g.date, today)}>
              <div className="day-head">
                <span>{formatDay(g.date, today)}</span>
                {g.items.length > 1 && <Money cents={dayTotal(g.items)} plain className="small" />}
              </div>
              <div className="list">
                {g.items.map((t) => (
                  <TxRow key={t.id} tx={t} showAccount={!filters.cuenta} />
                ))}
              </div>
            </div>
          ))}
        </section>
      )}
      {list.length > limit && (
        <button className="btn" onClick={() => setLimit(limit + 300)}>
          Mostrar más ({list.length - limit} restantes)
        </button>
      )}

      {open && (
        <Sheet title={options[open].title} onClose={() => setOpen(null)}>
          <div className="card flush list">
            {[{ value: '', label: options[open].all }, ...options[open].items].map((o) => (
              <button
                key={o.value || 'all'}
                className="list-item"
                style={{ minHeight: 50, fontWeight: filters[open] === o.value ? 700 : 500, whiteSpace: 'pre' }}
                onClick={() => {
                  setFilter(open, o.value)
                  setOpen(null)
                }}
              >
                <span className="grow">{o.label}</span>
                {filters[open] === o.value && <span className="pill accent">Elegido</span>}
              </button>
            ))}
          </div>
        </Sheet>
      )}
    </main>
  )
}
