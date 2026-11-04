import { useMemo, useState } from 'react'
import { ArrowLeftRight, FileUp, Pencil, Plus, Trash2, TriangleAlert } from 'lucide-react'
import { useData } from '../ui/useData'
import { useEditor } from '../ui/editor'
import { useToast } from '../ui/toast'
import { BackBar, Money, Notice, Sheet } from '../ui/components'
import { navigate, routeParams, useRoute } from '../ui/router'
import { ChartCanvas } from '../charts/ChartCanvas'
import { lineSeries } from '../charts/configs'
import { accountBalance, monthlySeries } from '../domain/stats'
import { netWorth, netWorthSeries, portfolioEvolution, portfolioSummary } from '../domain/investments'
import { formatNumber, formatPercent, parseAmount, formatMoney } from '../lib/money'
import { formatShortDate, monthShort, todayISO } from '../lib/dates'
import { ACCEPT_PDF, pickFile } from '../ui/files'
import { parseTradeRepublic, type TRStatement } from '../import/tradeRepublic'
import { readPdfInBrowser } from '../import/pdfText'
import { saveSnapshot } from '../db/actions'
import { db } from '../db/db'
import { hash } from '../lib/text'
import type { Account, PositionKind } from '../db/types'

const TYPE_LABEL: Record<Account['type'], string> = { banco: 'Banco', tarjeta: 'Tarjeta', efectivo: 'Efectivo', inversion: 'Inversión' }
const ALLOC_COLOR: Record<PositionKind | 'efectivo', string> = { etf: 'var(--accent)', accion: '#5b8de8', cripto: 'var(--chart-2)', otro: '#8a8f94', efectivo: '#a9b3bd' }

export function Wealth() {
  const { accounts, transactions, snapshots, settings } = useData()
  const { openAccount, openTx } = useEditor()
  const active = accounts.filter((a) => !a.archived)
  const nw = useMemo(() => netWorth(active, transactions, snapshots), [active, transactions, snapshots])
  const months = useMemo(() => monthlySeries(transactions, 12, settings.monthStartDay, todayISO()), [transactions, settings.monthStartDay])
  const series = useMemo(() => netWorthSeries(active, transactions, snapshots, months), [active, transactions, snapshots, months])
  const build = useMemo(() => lineSeries(series.map((s) => ({ label: monthShort(Number(s.key.slice(5)) - 1), value: s.total })), settings.currency, { mainLabel: 'Patrimonio' }), [series, settings.currency])
  const investments = active.filter((a) => a.type === 'inversion')
  const others = active.filter((a) => a.type !== 'inversion')

  return (
    <main className="screen">
      <div className="title-row">
        <h1 className="title">Patrimonio</h1>
        <button className="icon-btn primary" onClick={() => openAccount()} aria-label="Nueva cuenta">
          <Plus size={22} />
        </button>
      </div>

      <section className="card">
        <div className="card-label">Patrimonio total</div>
        <Money cents={nw.total} plain className="big" />
        <div className="row" style={{ gap: 20, marginTop: 10 }}>
          <div>
            <div className="meta">Cuentas</div>
            <Money cents={nw.cash} plain />
          </div>
          <div>
            <div className="meta">Inversiones</div>
            <Money cents={nw.investments} plain />
          </div>
        </div>
        <div style={{ marginTop: 14 }}>
          <ChartCanvas build={build} height={170} isEmpty={!active.length} emptyText="Crea tus cuentas para ver la evolución" label="Evolución del patrimonio" />
        </div>
        <p className="meta" style={{ marginTop: 6 }}>Saldo de las cuentas más el valor de las inversiones al final de cada mes.</p>
      </section>

      <div className="section-head">
        <h2 className="section-title">Cuentas</h2>
        {others.length > 1 && (
          <button className="btn small ghost" onClick={() => openTx(undefined, { kind: 'transferencia' })}>
            <ArrowLeftRight size={15} /> Transferir
          </button>
        )}
      </div>
      <section className="card flush list">
        {others.length ? (
          others.map((a) => (
            <button key={a.id} className="list-item" onClick={() => navigate(`/movimientos?cuenta=${a.id}`)}>
              <span className="tile sm" style={{ '--c': a.color } as React.CSSProperties} aria-hidden>
                {a.name.slice(0, 1).toUpperCase()}
              </span>
              <div className="grow">
                <div className="primary-line ellipsis">{a.name}</div>
                <div className="secondary-line">{TYPE_LABEL[a.type]}</div>
              </div>
              <Money cents={accountBalance(a, transactions)} plain />
            </button>
          ))
        ) : (
          <div className="empty small">
            <strong>Sin cuentas</strong>
            Añade tu banco, tarjetas y efectivo con el botón +.
          </div>
        )}
      </section>

      <div className="section-head">
        <h2 className="section-title">Inversiones</h2>
      </div>
      {investments.length ? (
        investments.map((a) => <InvestmentCard key={a.id} account={a} />)
      ) : (
        <div className="card stack">
          <p className="muted">Crea una cuenta de tipo «Inversión» para Trade Republic. Las transferencias del banco con «Trade Republic» en el concepto contarán como aportación, no como gasto.</p>
          <button className="btn" onClick={() => openAccount()}>
            <Plus size={16} /> Crear cuenta de inversión
          </button>
        </div>
      )}
    </main>
  )
}

function InvestmentCard({ account }: { account: Account }) {
  const { snapshots, transactions, accounts } = useData()
  const inv = accounts.filter((a) => a.type === 'inversion')
  const p = portfolioSummary(account, snapshots, transactions, inv)
  return (
    <button className="card" style={{ textAlign: 'left', display: 'block', width: '100%' }} onClick={() => navigate(`/patrimonio/${account.id}`)}>
      <div className="row between">
        <span style={{ fontWeight: 600 }}>{account.name}</span>
        <span className="meta">{p.date ? `Extracto del ${formatShortDate(p.date)}` : 'Sin extracto'}</span>
      </div>
      <Money cents={p.value} plain className="big" />
      <GainLine gain={p.gain} ratio={p.gainRatio} contributed={p.contributed} />
      {p.allocation.length > 0 && <Allocation items={p.allocation} />}
    </button>
  )
}

function GainLine({ gain, ratio, contributed }: { gain: number; ratio: number | null; contributed: number }) {
  const { settings } = useData()
  const tone = gain > 0 ? 'var(--positive)' : gain < 0 ? 'var(--negative)' : 'var(--muted)'
  return (
    <p className="small" style={{ marginTop: 4 }}>
      <span style={{ color: tone, fontWeight: 600 }}>
        {gain > 0 ? '▲ +' : gain < 0 ? '▼ ' : ''}
        {formatMoney(gain, { currency: settings.currency })}
        {ratio !== null ? ` (${gain > 0 ? '+' : ''}${formatPercent(ratio, 1)})` : ''}
      </span>
      <span className="muted"> sobre {formatMoney(contributed, { currency: settings.currency })} aportados</span>
    </p>
  )
}

function Allocation({ items }: { items: { kind: PositionKind | 'efectivo'; label: string; value: number; ratio: number }[] }) {
  return (
    <div style={{ marginTop: 12 }}>
      <div className="stacked" aria-hidden>
        {items.map((a) => (
          <i key={a.kind} style={{ width: `${a.ratio * 100}%`, background: ALLOC_COLOR[a.kind] }} />
        ))}
      </div>
      <div className="legend" style={{ marginTop: 8, marginBottom: 0 }}>
        {items.map((a) => (
          <span key={a.kind}>
            <i style={{ background: ALLOC_COLOR[a.kind] }} />
            {a.label} {formatPercent(a.ratio)}
          </span>
        ))}
      </div>
    </div>
  )
}

export function InvestmentDetail({ id }: { id: string }) {
  const { accounts, snapshots, transactions, settings } = useData()
  const { openAccount } = useEditor()
  const toast = useToast()
  const route = useRoute()
  const account = accounts.find((a) => a.id === id)
  const inv = accounts.filter((a) => a.type === 'inversion')
  const [preview, setPreview] = useState<{ st: TRStatement; fileName: string } | null>(null)
  const [manual, setManual] = useState(false)
  const [busy, setBusy] = useState(false)
  const autoImport = routeParams(route).get('importar') === '1'

  const evolution = useMemo(() => (account ? portfolioEvolution(account, snapshots, transactions, inv) : []), [account, snapshots, transactions, inv])
  const build = useMemo(
    () =>
      lineSeries(
        evolution.map((e) => ({ label: formatShortDate(e.date).replace(/ \d{4}$/, ''), value: e.value })),
        settings.currency,
        { mainLabel: 'Valor', second: { label: 'Aportado', values: evolution.map((e) => e.contributed) } },
      ),
    [evolution, settings.currency],
  )

  async function importPdf() {
    const file = await pickFile(ACCEPT_PDF)
    if (!file) return
    setBusy(true)
    try {
      const lines = await readPdfInBrowser(await file.arrayBuffer())
      const st = parseTradeRepublic(lines)
      if (!st.positions.length && !st.cash) {
        toast.show('No se ha podido leer el extracto. Puedes meter el valor total a mano.')
        setManual(true)
      } else setPreview({ st, fileName: file.name })
    } catch {
      toast.show('No se ha podido abrir el PDF. Puedes meter el valor total a mano.')
      setManual(true)
    } finally {
      setBusy(false)
      if (autoImport) navigate(`/patrimonio/${id}`, true)
    }
  }

  if (!account) {
    return (
      <main className="screen sub">
        <BackBar label="Patrimonio" fallback="/patrimonio" />
        <p className="muted">Esta cuenta ya no existe.</p>
      </main>
    )
  }
  const p = portfolioSummary(account, snapshots, transactions, inv)
  const snap = snapshots.filter((s) => s.accountId === account.id).sort((a, b) => b.date.localeCompare(a.date))
  const latest = snap[0]

  return (
    <main className="screen sub">
      <BackBar label="Patrimonio" fallback="/patrimonio" />
      <div className="title-row">
        <h1 className="title">{account.name}</h1>
        <button className="icon-btn" onClick={() => openAccount(account.id)} aria-label="Editar cuenta">
          <Pencil size={18} />
        </button>
      </div>

      {autoImport && !preview && !busy && (
        <Notice icon={<FileUp size={20} />} title="Elige el PDF «Extracto del patrimonio neto»" actions={<button className="btn small primary" onClick={() => void importPdf()}>Elegir archivo</button>}>
          Lo encontrarás en la app de Trade Republic › Perfil › Documentos, guardado en Archivos.
        </Notice>
      )}

      <section className="card">
        <div className="card-label">Valor actual</div>
        <Money cents={p.value} plain className="big" />
        <GainLine gain={p.gain} ratio={p.gainRatio} contributed={p.contributed} />
        {p.allocation.length > 0 && <Allocation items={p.allocation} />}
        <div className="row" style={{ gap: 8, marginTop: 16, flexWrap: 'wrap' }}>
          <button className="btn small primary" onClick={() => void importPdf()} disabled={busy}>
            <FileUp size={16} /> {busy ? 'Leyendo PDF…' : 'Importar extracto de Trade Republic'}
          </button>
          <button className="btn small" onClick={() => setManual(true)}>
            Meter valor a mano
          </button>
        </div>
      </section>

      <section className="card">
        <div className="card-head">
          <h2>Valor frente a lo aportado</h2>
        </div>
        <div className="legend">
          <span>
            <i style={{ background: 'var(--accent)' }} />
            Valor
          </span>
          <span>
            <i className="dash" />
            Aportado
          </span>
        </div>
        <ChartCanvas build={build} height={190} isEmpty={evolution.length === 0} emptyText="Importa tu primer extracto para empezar la gráfica" label="Evolución del valor frente a lo aportado" />
      </section>

      {latest && latest.positions.length > 0 && (
        <section className="card flush">
          <div className="card-head" style={{ padding: 'var(--pad) var(--pad) 0' }}>
            <h2>Posiciones</h2>
            <span className="meta">{formatShortDate(latest.date)}</span>
          </div>
          <div className="list">
            {latest.positions.map((pos, i) => (
              <div key={`${pos.isin ?? pos.symbol ?? pos.name}-${i}`} className="list-item">
                <div className="grow">
                  <div className="primary-line ellipsis">{pos.name}</div>
                  <div className="secondary-line ellipsis">
                    {formatNumber(pos.units)} uds. × {formatMoney(Math.round(pos.price * 100), { currency: 'EUR' })} · {pos.isin ?? pos.symbol ?? (pos.kind === 'cripto' ? 'Cripto' : '')}
                  </div>
                </div>
                <div className="trail">
                  <Money cents={pos.value} plain />
                  <div className="meta">{formatPercent(latest.total ? pos.value / latest.total : 0)}</div>
                </div>
              </div>
            ))}
            {latest.cash > 0 && (
              <div className="list-item">
                <div className="grow">
                  <div className="primary-line">Efectivo</div>
                </div>
                <Money cents={latest.cash} plain />
              </div>
            )}
          </div>
        </section>
      )}

      <section className="card flush">
        <div className="card-head" style={{ padding: 'var(--pad) var(--pad) 0' }}>
          <h2>Extractos importados</h2>
        </div>
        <div className="list">
          {snap.length ? (
            snap.map((s) => (
              <div key={s.id} className="list-item">
                <div className="grow">
                  <div className="primary-line">{formatShortDate(s.date)}</div>
                  <div className="secondary-line">{s.source === 'pdf' ? `PDF · ${s.positions.length} posiciones` : 'Valor metido a mano'}</div>
                </div>
                <Money cents={s.total} plain />
                <button
                  className="icon-btn plain"
                  aria-label="Borrar extracto"
                  onClick={async () => {
                    const ok = await toast.confirm({ title: 'Borrar este extracto', message: `Foto de la cartera del ${formatShortDate(s.date)}.`, confirmLabel: 'Borrar', danger: true })
                    if (ok) await db.snapshots.delete(s.id)
                  }}
                >
                  <Trash2 size={18} />
                </button>
              </div>
            ))
          ) : (
            <p className="empty small">Aún no hay extractos. Importa uno cada mes: la app te lo recordará.</p>
          )}
        </div>
      </section>

      {preview && <TRPreview account={account} st={preview.st} onClose={() => setPreview(null)} />}
      {manual && <ManualValue account={account} onClose={() => setManual(false)} />}
    </main>
  )
}

function TRPreview({ account, st, onClose }: { account: Account; st: TRStatement; onClose: () => void }) {
  const toast = useToast()
  return (
    <Sheet
      title="Extracto de Trade Republic"
      onClose={onClose}
      full
      footer={
        <button
          className="btn primary block"
          onClick={async () => {
            const res = await saveSnapshot(account.id, st, 'pdf')
            toast.show(res.saved ? 'Extracto guardado' : 'Este extracto ya estaba importado: no se ha duplicado')
            onClose()
          }}
        >
          Guardar foto de la cartera
        </button>
      }
    >
      {st.warnings.map((w) => (
        <Notice key={w} tone="warn" icon={<TriangleAlert size={20} />} title="Revisa los datos">
          {w}
        </Notice>
      ))}
      <div className="card">
        <div className="card-label">Total a {st.date ? formatShortDate(st.date) : 'fecha desconocida'}</div>
        <Money cents={st.total} plain className="big" />
      </div>
      <div className="card flush list">
        {st.positions.map((p, i) => (
          <div key={i} className="list-item">
            <div className="grow">
              <div className="primary-line ellipsis">{p.name}</div>
              <div className="secondary-line">
                {p.kind === 'cripto' ? `Cripto${p.symbol ? ` · ${p.symbol}` : ''}` : `${p.kind === 'etf' ? 'ETF' : 'Acción'}${p.isin ? ` · ${p.isin}` : ''}`} · {formatNumber(p.units)} uds. × {formatNumber(p.price, 4)} €
              </div>
            </div>
            <Money cents={p.value} plain />
          </div>
        ))}
        <div className="list-item">
          <span className="grow primary-line">Efectivo</span>
          <Money cents={st.cash} plain />
        </div>
      </div>
    </Sheet>
  )
}

function ManualValue({ account, onClose }: { account: Account; onClose: () => void }) {
  const toast = useToast()
  const [date, setDate] = useState(todayISO())
  const [value, setValue] = useState('')
  const cents = parseAmount(value)
  return (
    <Sheet
      title="Valor de la cartera a mano"
      onClose={onClose}
      footer={
        <button
          className="btn primary block"
          disabled={cents === null || cents <= 0}
          onClick={async () => {
            const res = await saveSnapshot(account.id, { date, positions: [], cash: 0, total: cents!, fingerprint: hash(`manual|${account.id}|${date}|${cents}`) }, 'manual')
            toast.show(res.saved ? 'Valor guardado' : 'Ya había un valor igual para esa fecha')
            onClose()
          }}
        >
          Guardar
        </button>
      }
    >
      <p className="muted small">Si el PDF no se puede leer, copia el «Total» del extracto o de la app de Trade Republic.</p>
      <label className="field">
        <span>Fecha del extracto</span>
        <input className="input" type="date" value={date} max={todayISO()} onChange={(e) => setDate(e.target.value)} />
      </label>
      <label className="field">
        <span>Valor total (euros)</span>
        <input className="input" inputMode="decimal" placeholder="5.829,77" value={value} onChange={(e) => setValue(e.target.value)} />
      </label>
    </Sheet>
  )
}
