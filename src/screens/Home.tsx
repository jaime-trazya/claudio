import { ArrowLeftRight, CircleCheck, CloudUpload, FileUp, Plus, Smartphone, TrendingUp, TriangleAlert, Info } from 'lucide-react'
import { useData } from '../ui/useData'
import { useEditor } from '../ui/editor'
import { useToast } from '../ui/toast'
import { CategoryTile, Money, Notice } from '../ui/components'
import { detectRecurring } from '../domain/recurring'
import { TxRow } from '../ui/TxRow'
import { navigate } from '../ui/router'
import { useShortcutImport } from '../ui/useShortcutImport'
import { isIOS, isStandalone } from '../ui/files'
import { accountingMonth, daysBetween, formatShortDate, fromISO, monthLabel, shiftMonth, monthRange, todayISO, monthName } from '../lib/dates'
import { formatMoney, formatRate } from '../lib/money'
import { comparableRange, cumulativeExpenses, projectedExpenses, summarize } from '../domain/stats'
import { ChartCanvas } from '../charts/ChartCanvas'
import { cumulativeMonth } from '../charts/configs'
import { netWorth } from '../domain/investments'
import { budgetStatus } from '../domain/budgets'
import { backupOverdue } from '../db/backup'
import { confirmTransactions } from '../db/actions'
import { useBackupExport } from '../ui/useBackup'
import { QuickSetup } from './Accounts'
import { AccountList } from '../ui/AccountList'
import { useState } from 'react'
import { useTRImport } from '../ui/useTRImport'

function deltaWords(cur: number, prev: number, currency: string, lowerIsBetter = false) {
  const d = cur - prev
  if (prev === 0 && cur === 0) return { text: 'Sin movimientos', tone: '' }
  if (d === 0) return { text: 'Igual', tone: '' }
  const better = lowerIsBetter ? d < 0 : d > 0
  return { text: `${formatMoney(Math.abs(d), { currency, compact: Math.abs(d) >= 100000 })} ${d > 0 ? 'más' : 'menos'}`, tone: better ? 'var(--positive)' : 'var(--muted)' }
}

export function Home() {
  const { accounts, transactions, statTxs, budgets, categories, settings, categoryById, snapshots } = useData()
  const { openTx, openAccount } = useEditor()
  const toast = useToast()
  const shortcut = useShortcutImport()
  const [quick, setQuick] = useState(false)
  const investment = accounts.find((a) => a.type === 'inversion' && !a.archived && a.bank === 'traderepublic') ?? accounts.find((a) => a.type === 'inversion' && !a.archived)
  const tr = useTRImport(investment)
  const exportBackup = useBackupExport()
  const today = todayISO()
  const month = accountingMonth(today, settings.monthStartDay)
  const prevKey = shiftMonth(month.key, -1)
  const prevRange = monthRange(prevKey.year, prevKey.month0, settings.monthStartDay)
  const prevName = monthName(prevKey.month0)
  const cur = summarize(statTxs, month, categoryById)
  const cmp = comparableRange(month, prevRange, today)
  const prev = summarize(statTxs, cmp, categoryById)
  const cmpLabel = cmp.partial ? `a día ${daysBetween(prevRange.start, cmp.end) + 1} de ${prevName}` : `${prevName} entero`
  const statuses = budgets.map((b) => budgetStatus(b, statTxs, month, categories))
  const budgetTotal = budgets.reduce((s, b) => s + b.amount, 0)
  const pending = transactions.filter((t) => t.status === 'pendiente')
  const upcoming = detectRecurring(transactions, today)
    .filter((r) => !settings.dismissedRecurring.includes(r.key) && daysBetween(today, r.nextDate) <= 10 && daysBetween(today, r.nextDate) >= -3)
    .sort((a, b) => a.nextDate.localeCompare(b.nextDate))
    .slice(0, 4)
  // Sin traspasos entre tus cuentas: en Inicio solo lo que de verdad entra o sale
  // (ni los intereses diarios de céntimos de la cuenta remunerada)
  const recent = transactions.filter((t) => t.kind !== 'transferencia' && !(t.categoryId === 'cat-intereses' && Math.abs(t.amount) < 100)).slice(0, 5)
  const hasInvestment = accounts.some((a) => a.type === 'inversion')
  const totalDays = daysBetween(month.start, month.end) + 1
  const dayN = daysBetween(month.start, today) + 1
  const currency = settings.currency

  const trDue = (() => {
    if (!hasInvestment) return false
    if (fromISO(today).getDate() < settings.trReminderDay) return false
    if (!settings.lastTRImportAt) return true
    const last = new Date(settings.lastTRImportAt)
    const now = fromISO(today)
    return last.getFullYear() < now.getFullYear() || last.getMonth() < now.getMonth()
  })()
  const showBackup = backupOverdue(settings.lastBackupAt, transactions.length > 0, undefined, settings.backupReminderDays)
  const atRisk = statuses.filter((s) => s.level !== 'ok')
  const inSafari = isIOS() && !isStandalone()

  // Gasto acumulado día a día: este mes frente al anterior entero
  const prevTitle = prevName[0].toUpperCase() + prevName.slice(1)
  const chartNow = cumulativeExpenses(statTxs, month, categoryById, today)
  const chartBefore = cumulativeExpenses(statTxs, prevRange, categoryById)
  // ChartCanvas actualiza la gráfica existente (no la recrea): no hace falta memorizar
  const chartBuild = cumulativeMonth(chartNow, chartBefore, totalDays, currency, prevTitle)

  if (!accounts.length) {
    return (
      <main className="screen">
        <div className="title-row">
          <div>
            <h1 className="title">Hola</h1>
            <p className="title-sub">Tus finanzas, guardadas solo en este iPhone</p>
          </div>
        </div>
        {inSafari && <SafariNotice />}
        <div className="card stack">
          <h2 className="section-title">Empieza por tus cuentas</h2>
          <p className="muted">
            Crea tu cuenta del banco, tus tarjetas, el efectivo y, si inviertes, tu cuenta de Trade Republic. Después podrás importar el extracto del banco cada mes.
          </p>
          <button className="btn primary" onClick={() => setQuick(true)}>
            <Plus size={18} /> Elegir mis bancos
          </button>
          <button className="btn" onClick={() => openAccount()}>
            Crear una cuenta a mano
          </button>
          <button className="btn" onClick={() => navigate('/ajustes')}>
            Restaurar una copia de seguridad
          </button>
        </div>
        <div className="card stack" style={{ gap: 8 }}>
          <strong>Sin servidor, sin registro</strong>
          <p className="muted small">Nada sale de tu dispositivo. Haz una copia de seguridad en iCloud Drive de vez en cuando desde Ajustes.</p>
        </div>
        {quick && <QuickSetup onClose={() => setQuick(false)} />}
      </main>
    )
  }

  // Solo lo gastado en las categorías con presupuesto (el alquiler sin presupuesto no llena la barra)
  const budgetSpent = statuses.reduce((s, b) => s + b.spent, 0)
  const spentRatio = budgetTotal ? budgetSpent / budgetTotal : 0
  const nw = netWorth(accounts, transactions, snapshots)
  const projected = projectedExpenses(cur.expenses, dayN, totalDays)
  const dayRatio = Math.min(1, dayN / totalDays)
  const incomeD = deltaWords(cur.income, prev.income, currency)
  const expD = deltaWords(cur.expenses, prev.expenses, currency, true)

  return (
    <main className="screen">
      <div className="title-row">
        <div>
          <h1 className="title">{monthLabel(month.key, false).replace(/^./, (c) => c.toUpperCase())}</h1>
          <p className="title-sub">
            Día {dayN} de {totalDays}
            {settings.monthStartDay > 1 ? ` · mes contable desde el ${settings.monthStartDay}` : ''}
          </p>
        </div>
        <button className="icon-btn primary" onClick={() => openTx()} aria-label="Añadir movimiento">
          <Plus size={22} />
        </button>
      </div>

      {inSafari && <SafariNotice />}

      {/* Lo primero al entrar: el dinero que tienes ahora, y justo debajo lo gastado este mes */}
      <a className="card hero-money" href="#/patrimonio" aria-label={`Tienes ${formatMoney(nw.cash, { currency })} en tus cuentas. Ver patrimonio`}>
        <div className="card-label">Tienes ahora</div>
        <Money cents={nw.cash} className="hero" plain />
        <div className="hero-money-foot">
          {hasInvestment ? (
            <>
              <span>
                Inversiones <Money cents={nw.investments} plain />
              </span>
              <span>
                Patrimonio <Money cents={nw.total} plain />
              </span>
            </>
          ) : (
            <span>En tus cuentas, con el saldo del último extracto</span>
          )}
        </div>
      </a>

      <section className="card hero-month" aria-label="Resumen del mes">
        <div className="figure-row">
          <div>
            <div className="card-label">Gastado este mes</div>
            <Money cents={cur.expenses} className="big" plain />
          </div>
          {budgetTotal > 0 && (
            <div className="right">
              <div className="card-label">Presupuestado</div>
              <Money cents={budgetSpent} plain className="mid" /> <span className="meta">de</span> <Money cents={budgetTotal} plain className="mid" />
            </div>
          )}
        </div>
        {budgetTotal > 0 ? (
          <div>
            <div className={`track ${spentRatio >= 1 ? 'over' : spentRatio >= 0.8 ? 'warn' : ''}`} role="progressbar" aria-valuenow={Math.round(spentRatio * 100)} aria-valuemin={0} aria-valuemax={100} aria-label="Presupuesto gastado">
              <i style={{ width: `${Math.min(100, spentRatio * 100)}%` }} />
              <span className="marker" style={{ left: `calc(${dayRatio * 100}% - 1px)` }} title="Hoy" />
            </div>
            <div className="plan-caption">
              <span>{Math.round(spentRatio * 100)} % del presupuesto</span>
              <span>{spentRatio > dayRatio + 0.05 ? 'Vas por delante del calendario' : 'Al ritmo del mes'}</span>
            </div>
          </div>
        ) : (
          <p className="small" style={{ color: expD.tone || 'var(--muted)' }}>
            {expD.text === 'Sin movimientos' ? 'Sin gastos todavía' : `${expD.text} que ${cmp.partial ? 'a estas alturas de' : 'en'} ${prevName}`}
          </p>
        )}
        {projected !== null && (
          <p className="small projection">
            A este ritmo, unos <strong>{formatMoney(projected, { currency })}</strong> a fin de mes
            {budgetTotal > 0 && projected > budgetTotal ? ' · por encima de lo presupuestado' : ''}
          </p>
        )}
        {(chartNow.some(Boolean) || chartBefore.some(Boolean)) && (
          <div>
            <ChartCanvas build={chartBuild} height={120} label={`Gasto acumulado de ${monthName(fromISO(today).getMonth())} frente a ${prevName}`} />
            <p className="meta chart-key">
              <span className="key key-now" /> Este mes <span className="key key-prev" /> {prevTitle}
            </p>
          </div>
        )}
        <div className="split3">
          <div>
            <div className="meta">Ingresos</div>
            <Money cents={cur.income} sign />
            <div className="meta" style={{ color: incomeD.tone || undefined }}>{cur.income || prev.income ? incomeD.text : '—'}</div>
          </div>
          <div>
            <div className="meta">Gastos</div>
            <Money cents={-cur.expenses} plain />
            <div className="meta" style={{ color: expD.tone || undefined }}>{cur.expenses || prev.expenses ? expD.text : '—'}</div>
          </div>
          <div>
            <div className="meta">Ahorro</div>
            <Money cents={cur.balance} sign />
            <div className="meta">{cur.savingsRate === null ? 'Sin ingresos aún' : cur.savingsRate < 0 ? 'Gastas más de lo que entra' : `Ahorras el ${formatRate(cur.savingsRate)}`}</div>
          </div>
        </div>
        <p className="meta">Comparado con {cmpLabel}. Sin contar traspasos entre tus cuentas ni aportaciones.</p>
      </section>

      <div className="actions">
        <button className="action" onClick={() => navigate('/importar')}>
          <FileUp size={22} strokeWidth={1.8} />
          Importar extracto
        </button>
        <button className="action" onClick={() => void shortcut.start()}>
          <Smartphone size={22} strokeWidth={1.8} />
          Importar pagos del Atajo
        </button>
        <button className="action" onClick={() => openTx()}>
          <Plus size={22} strokeWidth={1.8} />
          Añadir movimiento
        </button>
        {investment ? (
          <button className="action" onClick={() => void tr.start()} disabled={tr.busy}>
            <TrendingUp size={22} strokeWidth={1.8} />
            {tr.busy ? 'Leyendo…' : 'Extracto de inversión'}
          </button>
        ) : (
          <button className="action" onClick={() => openTx(undefined, { kind: 'transferencia' })}>
            <ArrowLeftRight size={22} strokeWidth={1.8} />
            Traspaso entre cuentas
          </button>
        )}
      </div>

      {showBackup && (
        <Notice
          tone="warn"
          icon={<CloudUpload size={20} />}
          title={settings.lastBackupAt ? `Hace más de ${settings.backupReminderDays} días de tu última copia` : 'Aún no has hecho ninguna copia'}
          actions={
            <button className="btn small primary" onClick={() => void exportBackup()}>
              Hacer copia ahora
            </button>
          }
        >
          Guárdala en iCloud Drive: es la única forma de recuperar tus datos si cambias de iPhone.
        </Notice>
      )}

      {trDue && (
        <Notice
          icon={<TrendingUp size={20} />}
          title={`Importa el extracto de Trade Republic de ${monthName((fromISO(today).getMonth() + 11) % 12)}`}
          actions={
            <button className="btn small" onClick={() => void tr.start()}>
              Importar ahora
            </button>
          }
        >
          Descarga el «Extracto del patrimonio neto» en la app de Trade Republic y súbelo aquí.
        </Notice>
      )}

      {atRisk.map((s) => {
        const cat = categoryById.get(s.budget.categoryId)
        return (
          <Notice
            key={s.budget.id}
            tone={s.level === 'superado' ? 'neg' : 'warn'}
            icon={<TriangleAlert size={20} />}
            title={s.level === 'superado' ? `${cat?.name ?? 'Categoría'}: presupuesto superado` : `${cat?.name ?? 'Categoría'}: ya llevas el ${Math.round(s.ratio * 100)} %`}
          >
            {s.level === 'superado'
              ? `Te has pasado en ${formatMoney(-s.remaining, { currency })} de ${formatMoney(s.budget.amount, { currency })}.`
              : `Quedan ${formatMoney(s.remaining, { currency })} de ${formatMoney(s.budget.amount, { currency })} para lo que queda de mes.`}
          </Notice>
        )
      })}

      {pending.length > 0 && (
        <section className="card flush" aria-label="Pagos por confirmar">
          <div className="card-head" style={{ padding: 'var(--pad) var(--pad) 0', marginBottom: 4 }}>
            <div>
              <h2>Por confirmar</h2>
              <p className="meta">Pagos con Apple Pay o añadidos a mano. Se confirman solos al importar el extracto.</p>
            </div>
            <span className="pill warn">{pending.length}</span>
          </div>
          <div className="list">
            {pending.slice(0, 4).map((t) => (
              <TxRow key={t.id} tx={t} />
            ))}
          </div>
          <div className="row" style={{ padding: '8px var(--pad) var(--pad)', gap: 8 }}>
            <button
              className="btn small"
              onClick={async () => {
                const ok = await toast.confirm({ title: `Confirmar ${pending.length} pagos`, message: 'Márcalos como confirmados sin esperar al extracto del banco.', confirmLabel: 'Confirmar' })
                if (ok) {
                  await confirmTransactions(pending.map((p) => p.id))
                  toast.show('Pagos confirmados')
                }
              }}
            >
              <CircleCheck size={16} /> Confirmar todos
            </button>
            {pending.length > 4 && (
              <button className="btn small ghost" onClick={() => navigate('/movimientos?estado=pendiente')}>
                Ver los {pending.length}
              </button>
            )}
          </div>
        </section>
      )}

      {upcoming.length > 0 && (
        <>
          <div className="section-head">
            <h2 className="section-title">Próximos cargos</h2>
            <a className="link" href="#/analisis?vista=recurrentes">
              Todos
            </a>
          </div>
          <section className="card flush list">
            {upcoming.map((r) => (
              <div key={r.key} className="list-item">
                <CategoryTile category={r.categoryId ? categoryById.get(r.categoryId) : null} size="sm" />
                <div className="grow">
                  <div className="primary-line ellipsis">{r.name}</div>
                  <div className="secondary-line">{daysBetween(today, r.nextDate) <= 0 ? 'Hoy o ya' : daysBetween(today, r.nextDate) === 1 ? 'Mañana' : `En ${daysBetween(today, r.nextDate)} días`} · {formatShortDate(r.nextDate)}</div>
                </div>
                <Money cents={-r.monthly} plain />
              </div>
            ))}
          </section>
        </>
      )}

      <div className="section-head">
        <h2 className="section-title">Últimos movimientos</h2>
        {transactions.length > 5 && (
          <a className="link" href="#/movimientos">
            Ver todos
          </a>
        )}
      </div>
      <section className="card flush">
        {recent.length ? (
          <div className="list">
            {recent.map((t) => (
              <TxRow key={t.id} tx={t} />
            ))}
          </div>
        ) : (
          <div className="empty">
            <strong>Aún no hay movimientos</strong>
            <p>Importa el extracto de tu banco o añade un gasto a mano.</p>
          </div>
        )}
      </section>

      <div className="section-head">
        <h2 className="section-title">Cuentas</h2>
        <a className="link" href="#/patrimonio">
          Patrimonio
        </a>
      </div>
      <AccountList accounts={accounts.filter((a) => !a.archived && a.type !== 'inversion')} compact />
      {shortcut.element}
      {tr.element}
    </main>
  )
}

function SafariNotice() {
  return (
    <Notice
      tone="warn"
      icon={<Info size={20} />}
      title="Estás usando la app desde Safari"
      actions={
        <a className="btn small primary" href="#/ajustes/instalar">
          Cómo añadirla a la pantalla de inicio
        </a>
      }
    >
      En iPhone, Safari y el icono de la pantalla de inicio guardan los datos por separado. Instálala y úsala siempre desde el icono.
    </Notice>
  )
}
