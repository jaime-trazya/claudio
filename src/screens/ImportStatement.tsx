import { useMemo, useState } from 'react'
import { CircleCheck, FileUp, Settings2, TriangleAlert } from 'lucide-react'
import { useData } from '../ui/useData'
import { useToast } from '../ui/toast'
import { useEditor } from '../ui/editor'
import { BackBar, CategoryPicker, CategoryTile, Money, Notice, Segmented } from '../ui/components'
import { navigate, routeParams } from '../ui/router'
import { categoryLabel } from '../ui/format'
import { ACCEPT_STATEMENT, pickFile } from '../ui/files'
import type { Row } from '../import/readSheet'
import type { PdfTable } from '../import/pdfTable'
import { applyMapping, detectColumns, headerSignature, type ParsedMovement } from '../import/detect'
import { planImport, summarizePlan, type PlanRow } from '../import/reconcile'
import { categorize, effectiveRules } from '../domain/categorize'
import { applyStatementImport, saveTemplate } from '../db/actions'
import { setSetting } from '../db/settings'
import { formatShortDate } from '../lib/dates'
import type { ColumnMapping } from '../db/types'

type Step = 'inicio' | 'columnas' | 'vista'

const STATUS_PILL: Record<PlanRow['status'], { label: string; cls: string }> = {
  nuevo: { label: 'Nuevo', cls: 'accent' },
  duplicado: { label: 'Duplicado', cls: '' },
  conciliar: { label: 'Ya estaba (pendiente)', cls: 'pos' },
  dudoso: { label: 'Elige', cls: 'warn' },
}

export function ImportStatement({ route }: { route: string }) {
  const { accounts, transactions, templates, rules, categoryById, settings } = useData()
  const toast = useToast()
  const { openAccount } = useEditor()
  const usable = accounts.filter((a) => !a.archived && a.type !== 'inversion')
  const initial = routeParams(route).get('cuenta') ?? settings.defaultAccountId ?? usable[0]?.id ?? ''
  const [accountId, setAccountId] = useState(usable.some((a) => a.id === initial) ? initial : (usable[0]?.id ?? ''))
  const [step, setStep] = useState<Step>('inicio')
  const [fileName, setFileName] = useState('')
  const [rows, setRows] = useState<Row[]>([])
  const [mapping, setMapping] = useState<ColumnMapping | null>(null)
  const [templateName, setTemplateName] = useState('')
  const [plan, setPlan] = useState<PlanRow[]>([])
  const [overrides, setOverrides] = useState<Record<number, string | null>>({})
  const [picking, setPicking] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const [tables, setTables] = useState<PdfTable[] | null>(null)
  const sorted = useMemo(() => effectiveRules(rules, settings.ownerName), [rules, settings.ownerName])
  const [limit, setLimit] = useState(200)
  const autos = useMemo(() => plan.map((r) => categorize(r.movement.description, r.movement.amount, sorted, true)), [plan, sorted])
  const txById = useMemo(() => new Map(transactions.map((t) => [t.id, t])), [transactions])

  function buildPlan(m: ColumnMapping, data: Row[] = rows, acc = accountId) {
    const movements: ParsedMovement[] = applyMapping(data, m)
    const p = planImport(movements, acc, transactions)
    setPlan(p)
    setOverrides({})
    return p
  }

  async function chooseFile() {
    const file = await pickFile(ACCEPT_STATEMENT)
    if (!file) return
    setBusy(true)
    setFileName(file.name)
    try {
      const buf = await file.arrayBuffer()
      const isPdf = file.name.toLowerCase().endsWith('.pdf') || new Uint8Array(buf.slice(0, 4)).every((b, i) => b === [0x25, 0x50, 0x44, 0x46][i])
      if (isPdf) {
        const { readPdfLinesInBrowser } = await import('../import/pdfText')
        const { pdfToTables } = await import('../import/pdfTable')
        const lines = await readPdfLinesInBrowser(buf)
        if (lines.some((l) => /extracto del patrimonio neto/i.test(l.text))) {
          const inv = accounts.find((a) => a.type === 'inversion')
          toast.show('Este PDF es el extracto del patrimonio de Trade Republic: impórtalo desde Patrimonio')
          if (inv) navigate(`/patrimonio/${inv.id}?importar=1`, true)
          return
        }
        const found = pdfToTables(lines)
        if (!found.length) {
          toast.show(lines.length ? 'No se ha encontrado ninguna tabla de movimientos en el PDF. Prueba a descargar el extracto en Excel o CSV.' : 'El PDF no tiene texto (¿es una foto escaneada?). Descárgalo en Excel o CSV.')
          return
        }
        if (found.length > 1) {
          setTables(found.sort((a, b) => b.movements - a.movements))
          return
        }
        loadRows(found[0].rows)
        return
      }
      // SheetJS se carga solo al importar, para que la app arranque más rápido
      const { readSheet } = await import('../import/readSheet')
      loadRows(readSheet(buf, file.name))
    } catch {
      toast.show('No se ha podido leer el archivo')
    } finally {
      setBusy(false)
    }
  }

  function loadRows(data: Row[]) {
    setTables(null)
    setRows(data)
    if (!data.length) {
      toast.show('El archivo está vacío o no se puede leer')
      return
    }
    // 1) Plantilla guardada para este banco
    const tpl = templates.find((t) => t.mapping.headerRow < data.length && headerSignature(data, t.mapping.headerRow) === t.signature)
    if (tpl) {
      setMapping(tpl.mapping)
      setTemplateName(tpl.name)
      const p = buildPlan(tpl.mapping, data)
      if (p.length) {
        setStep('vista')
        return
      }
    }
    // 2) Detección automática
    const det = detectColumns(data)
    if (det && det.confidence >= 0.6 && det.validRows > 0) {
      setMapping(det.mapping)
      buildPlan(det.mapping, data)
      setStep('vista')
    } else {
      setMapping(
        det?.mapping ?? { headerRow: -1, dateCol: 0, descCol: Math.min(1, (data[0]?.length ?? 1) - 1), amountCol: Math.min(2, (data[0]?.length ?? 1) - 1), debitCol: null, creditCol: null },
      )
      setStep('columnas')
      toast.show('No hemos reconocido las columnas: indícalas tú')
    }
  }

  async function save() {
    setBusy(true)
    try {
      const res = await applyStatementImport({ rows: plan, accountId, fileName, categoryOverrides: overrides })
      await setSetting('defaultAccountId', accountId)
      toast.show(`Importado: ${res.added} nuevos${res.reconciled ? ` · ${res.reconciled} conciliados` : ''}${res.skipped ? ` · ${res.skipped} omitidos` : ''}`)
      navigate(`/movimientos?cuenta=${accountId}`, true)
    } finally {
      setBusy(false)
    }
  }

  const summary = summarizePlan(plan)

  if (!usable.length) {
    return (
      <main className="screen sub">
        <BackBar label="Inicio" />
        <h1 className="title">Importar extracto</h1>
        <div className="card stack">
          <p className="muted">Primero crea la cuenta del banco a la que pertenece el extracto.</p>
          <button className="btn primary" onClick={() => openAccount()}>
            Crear cuenta
          </button>
        </div>
      </main>
    )
  }

  return (
    <main className="screen sub" style={{ paddingBottom: 'calc(var(--safe-bottom) + 110px)' }}>
      <BackBar label={step === 'inicio' ? 'Inicio' : 'Atrás'} />
      <div className="title-row">
        <div>
          <h1 className="title">Importar extracto</h1>
          {fileName && <p className="title-sub ellipsis">{fileName}</p>}
        </div>
      </div>

      {step === 'inicio' && (
        <>
          <label className="field">
            <span>Cuenta del extracto</span>
            <select className="select" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
              {usable.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </label>
          <button className="btn primary block" onClick={() => void chooseFile()} disabled={busy}>
            <FileUp size={18} /> {busy ? 'Leyendo…' : 'Elegir archivo (PDF, CSV, XLS o XLSX)'}
          </button>
          {tables && (
            <div className="stack" style={{ gap: 8 }}>
              <span className="field-label">Este PDF tiene varias tablas. ¿Cuál quieres importar en «{usable.find((a) => a.id === accountId)?.name}»?</span>
              <div className="card flush list">
                {tables.map((t, i) => (
                  <button key={i} className="list-item" onClick={() => loadRows(t.rows)}>
                    <div className="grow">
                      <div className="primary-line">{t.label}</div>
                      <div className="secondary-line ellipsis">
                        {t.movements} filas · {t.rows[0].filter(Boolean).slice(0, 4).join(' · ')}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
          <div className="card stack" style={{ gap: 8 }}>
            <strong>Qué hace la importación</strong>
            <ul className="muted small" style={{ margin: 0, paddingLeft: 18, display: 'grid', gap: 6 }}>
              <li>Lee extractos en PDF (CaixaBank, Trade Republic, Revolut…), Excel y CSV, y detecta las columnas de fecha, concepto e importe (también entradas y salidas por separado).</li>
              <li>Marca los duplicados de importaciones anteriores y los deja fuera.</li>
              <li>Empareja los pagos del Atajo y los añadidos a mano (mismo importe, hasta 3 días de diferencia) y los confirma sin duplicarlos.</li>
              <li>Antes de guardar verás una vista previa.</li>
            </ul>
          </div>
        </>
      )}

      {step === 'columnas' && mapping && (
        <MappingStep
          rows={rows}
          mapping={mapping}
          onChange={setMapping}
          templateName={templateName}
          onTemplateName={setTemplateName}
          onContinue={async () => {
            if (templateName.trim()) {
              await saveTemplate({ name: templateName.trim(), signature: headerSignature(rows, mapping.headerRow), mapping })
              toast.show(`Plantilla «${templateName.trim()}» guardada`)
            }
            const p = buildPlan(mapping)
            if (!p.length) toast.show('Con estas columnas no sale ningún movimiento. Revisa la selección.')
            else setStep('vista')
          }}
        />
      )}

      {step === 'vista' && (
        <>
          <section className="card flush">
            <div className="kpis">
              <div className="kpi">
                <div className="card-label">Nuevos</div>
                <span className="money" style={{ fontSize: 21, fontWeight: 600 }}>{summary.nuevos}</span>
              </div>
              <div className="kpi">
                <div className="card-label">Conciliados</div>
                <span className="money" style={{ fontSize: 21, fontWeight: 600 }}>{summary.conciliados}</span>
                <div className="meta">pendientes que se confirman</div>
              </div>
              <div className="kpi">
                <div className="card-label">Duplicados</div>
                <span className="money" style={{ fontSize: 21, fontWeight: 600, color: summary.duplicados ? undefined : 'var(--faint)' }}>{summary.duplicados}</span>
                <div className="meta">excluidos por defecto</div>
              </div>
              <div className="kpi">
                <div className="card-label">Con dudas</div>
                <span className="money" style={{ fontSize: 21, fontWeight: 600, color: summary.dudosos ? 'var(--warning)' : 'var(--faint)' }}>{summary.dudosos}</span>
                <div className="meta">elige abajo</div>
              </div>
            </div>
          </section>
          <button className="btn small ghost" style={{ alignSelf: 'flex-start' }} onClick={() => setStep('columnas')}>
            <Settings2 size={15} /> Ajustar columnas
          </button>
          {summary.dudosos > 0 && (
            <Notice tone="warn" icon={<TriangleAlert size={20} />} title="Hay movimientos con varias coincidencias">
              Tienen el mismo importe que varios pagos pendientes. Elige con cuál se corresponde o créalo como nuevo.
            </Notice>
          )}
          <section className="card flush list">
            {plan.slice(0, limit).map((r, i) => {
              const auto = autos[i]
              const match = r.matchId ? txById.get(r.matchId) : undefined
              const catId = i in overrides ? overrides[i] : (match?.categoryId ?? auto.categoryId)
              const cat = catId ? categoryById.get(catId) : undefined
              const pill = STATUS_PILL[r.status]
              return (
                <div key={i} className="list-item" style={{ display: 'block', opacity: r.include ? 1 : 0.55 }}>
                  <div className="row" style={{ alignItems: 'flex-start' }}>
                    <input
                      type="checkbox"
                      checked={r.include}
                      aria-label="Incluir"
                      style={{ width: 22, height: 22, marginTop: 2, accentColor: 'var(--accent)', flex: 'none' }}
                      onChange={(e) => setPlan(plan.map((x, j) => (j === i ? { ...x, include: e.target.checked } : x)))}
                    />
                    <div className="grow">
                      <div className="row between" style={{ alignItems: 'flex-start' }}>
                        <span className="primary-line" style={{ wordBreak: 'break-word' }}>{r.movement.description}</span>
                        <Money cents={r.movement.amount} sign={r.movement.amount > 0} plain={r.movement.amount < 0} />
                      </div>
                      <div className="row" style={{ gap: 6, marginTop: 4, flexWrap: 'wrap' }}>
                        <span className="meta">{formatShortDate(r.movement.date)}</span>
                        <span className={`pill ${pill.cls}`}>{r.status === 'dudoso' && r.matchId ? 'Duda: revisa' : pill.label}</span>
                        {auto.kind === 'aportacion' && <span className="pill accent">Aportación</span>}
                        <button className="row small" style={{ gap: 6, minHeight: 32 }} onClick={() => setPicking(i)}>
                          <CategoryTile category={cat} size="sm" />
                          <span className="muted ellipsis" style={{ maxWidth: 160 }}>{categoryLabel(cat, categoryById)}</span>
                        </button>
                      </div>
                      {r.status === 'conciliar' && match && (
                        <p className="meta" style={{ marginTop: 4 }}>
                          Se confirma «{match.description}» del {formatShortDate(match.date)}
                        </p>
                      )}
                      {r.status === 'dudoso' && (
                        <div className="stack" style={{ gap: 4, marginTop: 8 }}>
                          {r.options.map((id) => {
                            const t = txById.get(id)
                            if (!t) return null
                            const takenElsewhere = plan.some((x, j) => j !== i && x.matchId === id)
                            return (
                              <label key={id} className="check-row small" style={{ minHeight: 36, opacity: takenElsewhere ? 0.45 : 1 }}>
                                <input
                                  type="radio"
                                  name={`m${i}`}
                                  checked={r.matchId === id}
                                  disabled={takenElsewhere}
                                  onChange={() => setPlan(plan.map((x, j) => (j === i ? { ...x, matchId: id } : x)))}
                                  style={{ width: 20, height: 20, accentColor: 'var(--accent)' }}
                                />
                                Es «{t.description}» del {formatShortDate(t.date)}
                              </label>
                            )
                          })}
                          <label className="check-row small" style={{ minHeight: 36 }}>
                            <input type="radio" name={`m${i}`} checked={!r.matchId} onChange={() => setPlan(plan.map((x, j) => (j === i ? { ...x, matchId: null } : x)))} style={{ width: 20, height: 20, accentColor: 'var(--accent)' }} />
                            Es otro: crear como nuevo
                          </label>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </section>
          {plan.length > limit && (
            <button className="btn" onClick={() => setLimit(limit + 400)}>
              Mostrar más ({plan.length - limit} restantes)
            </button>
          )}
          <div className="tabbar" style={{ padding: '10px calc(16px + var(--safe-right)) calc(10px + var(--safe-bottom)) calc(16px + var(--safe-left))' }}>
            <div style={{ maxWidth: 720, margin: '0 auto' }}>
              <button className="btn primary block" disabled={busy || plan.every((r) => !r.include)} onClick={() => void save()}>
                <CircleCheck size={18} /> Guardar {plan.filter((r) => r.include).length} movimientos
              </button>
            </div>
          </div>
        </>
      )}

      {picking !== null && (
        <CategoryPicker
          value={picking in overrides ? overrides[picking] : null}
          kind={plan[picking]?.movement.amount > 0 ? 'ingreso' : 'gasto'}
          onClose={() => setPicking(null)}
          onPick={(id) => {
            setOverrides({ ...overrides, [picking]: id })
            setPicking(null)
          }}
        />
      )}
    </main>
  )
}

function ColSelect({ value, onPick, allowNone, cols, colName }: { value: number | null; onPick: (v: number | null) => void; allowNone?: boolean; cols: number[]; colName: (i: number) => string }) {
  return (
    <select className="select" value={value ?? ''} onChange={(e) => onPick(e.target.value === '' ? null : Number(e.target.value))}>
      {allowNone && <option value="">Ninguna</option>}
      {cols.map((i) => (
        <option key={i} value={i}>
          {colName(i)}
        </option>
      ))}
    </select>
  )
}

function MappingStep({
  rows,
  mapping,
  onChange,
  templateName,
  onTemplateName,
  onContinue,
}: {
  rows: Row[]
  mapping: ColumnMapping
  onChange: (m: ColumnMapping) => void
  templateName: string
  onTemplateName: (s: string) => void
  onContinue: () => void
}) {
  const width = Math.max(1, ...rows.slice(0, 50).map((r) => r.length))
  const header = mapping.headerRow >= 0 ? rows[mapping.headerRow] : null
  const colName = (i: number) => {
    const h = header?.[i]
    return `${String.fromCharCode(65 + (i % 26))}${h ? ` · ${String(h).slice(0, 24)}` : ''}`
  }
  const cols = Array.from({ length: width }, (_, i) => i)
  const separate = mapping.amountCol === null
  const preview = applyMapping(rows, mapping).slice(0, 3)
  const show = (c: unknown) => (c instanceof Date ? c.toLocaleDateString('es-ES') : c === null || c === undefined ? '' : String(c))

  return (
    <>
      <p className="muted small">Indica qué columna es cada cosa. La fila de cabecera aparece resaltada.</p>
      <div className="mapping-table">
        <table>
          <thead>
            <tr>
              <th>#</th>
              {cols.map((i) => (
                <th key={i}>{String.fromCharCode(65 + (i % 26))}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, 12).map((r, ri) => (
              <tr key={ri} className={ri === mapping.headerRow ? 'is-header' : ''}>
                <td className="meta">{ri + 1}</td>
                {cols.map((ci) => (
                  <td key={ci} className={ci === mapping.dateCol ? 'col-date' : ''}>
                    {show(r[ci])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <label className="field">
        <span>Fila de cabecera</span>
        <select className="select" value={mapping.headerRow} onChange={(e) => onChange({ ...mapping, headerRow: Number(e.target.value) })}>
          <option value={-1}>No hay cabecera</option>
          {rows.slice(0, 30).map((r, i) => (
            <option key={i} value={i}>
              Fila {i + 1}: {r.slice(0, 3).map(show).join(' · ').slice(0, 40)}
            </option>
          ))}
        </select>
      </label>
      <div className="form-grid">
        <label className="field">
          <span>Fecha</span>
          <ColSelect cols={cols} colName={colName} value={mapping.dateCol} onPick={(v) => onChange({ ...mapping, dateCol: v ?? 0 })} />
        </label>
        <label className="field">
          <span>Concepto</span>
          <ColSelect cols={cols} colName={colName} value={mapping.descCol} onPick={(v) => onChange({ ...mapping, descCol: v ?? 0 })} />
        </label>
      </div>
      <Segmented
        label="Importe"
        value={separate ? 'dos' : 'una'}
        onChange={(v) => onChange(v === 'dos' ? { ...mapping, amountCol: null, debitCol: mapping.debitCol ?? 0, creditCol: mapping.creditCol ?? null } : { ...mapping, amountCol: mapping.amountCol ?? 0, debitCol: null, creditCol: null })}
        options={[
          { value: 'una', label: 'Una columna de importe' },
          { value: 'dos', label: 'Cargo y abono' },
        ]}
      />
      {separate ? (
        <div className="form-grid">
          <label className="field">
            <span>Cargo (gastos)</span>
            <ColSelect cols={cols} colName={colName} value={mapping.debitCol} onPick={(v) => onChange({ ...mapping, debitCol: v })} allowNone />
          </label>
          <label className="field">
            <span>Abono (ingresos)</span>
            <ColSelect cols={cols} colName={colName} value={mapping.creditCol} onPick={(v) => onChange({ ...mapping, creditCol: v })} allowNone />
          </label>
        </div>
      ) : (
        <>
          <label className="field">
            <span>Importe</span>
            <ColSelect cols={cols} colName={colName} value={mapping.amountCol} onPick={(v) => onChange({ ...mapping, amountCol: v ?? 0 })} />
          </label>
          <label className="check-row small">
            <input type="checkbox" checked={!!mapping.invertSign} onChange={(e) => onChange({ ...mapping, invertSign: e.target.checked })} />
            Los gastos vienen en positivo (invertir el signo)
          </label>
        </>
      )}
      <div className="card stack" style={{ gap: 6 }}>
        <span className="field-label">Así se leerán</span>
        {preview.length ? (
          preview.map((m, i) => (
            <div key={i} className="row between small">
              <span className="ellipsis grow">
                {formatShortDate(m.date)} · {m.description}
              </span>
              <Money cents={m.amount} sign={m.amount > 0} plain={m.amount < 0} />
            </div>
          ))
        ) : (
          <p className="small" style={{ color: 'var(--warning)' }}>
            Ninguna fila tiene fecha, concepto e importe válidos con esta selección.
          </p>
        )}
      </div>
      <label className="field">
        <span>Guardar como plantilla del banco (opcional)</span>
        <input className="input" placeholder="Nombre del banco" value={templateName} onChange={(e) => onTemplateName(e.target.value)} />
        <span className="meta">La próxima vez que importes un archivo de este banco se usarán estas columnas automáticamente.</span>
      </label>
      <button className="btn primary block" onClick={onContinue}>
        Continuar a la vista previa
      </button>
    </>
  )
}
