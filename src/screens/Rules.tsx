import { useMemo, useState } from 'react'
import { Plus, Search } from 'lucide-react'
import { useData } from '../ui/useData'
import { useToast } from '../ui/toast'
import { BackBar, CategoryPicker, CategoryTile, Sheet, Switch } from '../ui/components'
import { categoryLabel } from '../ui/format'
import { db } from '../db/db'
import { applyRuleEverywhere, exportRules, importRules, recategorizeUncategorized } from '../db/actions'
import { ACCEPT_JSON, pickFile, saveFile } from '../ui/files'
import { todayISO } from '../lib/dates'
import { normalize } from '../lib/text'
import { ruleMatches } from '../domain/categorize'
import type { Rule } from '../db/types'

export function RulesScreen() {
  const { rules, categoryById, transactions } = useData()
  const toast = useToast()
  const [q, setQ] = useState('')
  const [editing, setEditing] = useState<Partial<Rule> | null>(null)
  const list = useMemo(() => {
    const nq = normalize(q)
    return [...rules]
      .filter((r) => !nq || normalize(r.keyword).includes(nq) || normalize(categoryById.get(r.categoryId)?.name ?? '').includes(nq))
      .sort((a, b) => (a.custom !== b.custom ? (a.custom ? -1 : 1) : a.keyword.localeCompare(b.keyword)))
  }, [rules, q, categoryById])
  const custom = list.filter((r) => r.custom)
  const builtIn = list.filter((r) => !r.custom)
  const uncategorized = transactions.filter((t) => !t.categoryId && !t.transferId && !t.splits?.length).length

  const RuleRow = ({ r }: { r: Rule }) => {
    const cat = categoryById.get(r.categoryId)
    return (
      <button className="list-item" onClick={() => setEditing(r)}>
        <CategoryTile category={cat} size="sm" />
        <div className="grow">
          <div className="primary-line ellipsis">«{r.keyword}»</div>
          <div className="secondary-line ellipsis">
            {categoryLabel(cat, categoryById)}
            {r.kind === 'aportacion' ? ' · aportación' : ''}
          </div>
        </div>
      </button>
    )
  }

  return (
    <main className="screen sub">
      <BackBar label="Ajustes" fallback="/ajustes" />
      <div className="title-row">
        <h1 className="title">Reglas</h1>
        <button className="icon-btn primary" onClick={() => setEditing({})} aria-label="Nueva regla">
          <Plus size={22} />
        </button>
      </div>
      <p className="muted small">Si el concepto contiene la palabra clave, el movimiento recibe la categoría. Tus reglas tienen prioridad sobre las predefinidas.</p>
      {uncategorized > 0 && (
        <button
          className="btn"
          onClick={async () => {
            const n = await recategorizeUncategorized()
            toast.show(n ? `${n} movimientos categorizados` : 'Ninguna regla encaja con los movimientos sin categoría')
          }}
        >
          Aplicar reglas a los {uncategorized} movimientos sin categoría
        </button>
      )}
      <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
        <button
          className="btn small"
          onClick={async () => {
            const file = await pickFile(ACCEPT_JSON)
            if (!file) return
            try {
              const res = await importRules(JSON.parse(await file.text()))
              toast.show(`${res.added} reglas importadas · ${res.changed} movimientos recategorizados${res.skipped ? ` · ${res.skipped} omitidas` : ''}`)
            } catch (e) {
              toast.show((e as Error).message || 'No se ha podido leer el archivo')
            }
          }}
        >
          Importar reglas
        </button>
        <button
          className="btn small"
          disabled={!custom.length}
          onClick={async () => {
            const ok = await saveFile(JSON.stringify(await exportRules(), null, 1), `reglas-claudio-${todayISO()}.json`, 'application/json')
            if (ok) toast.show('Reglas exportadas')
          }}
        >
          Exportar mis reglas
        </button>
      </div>
      <div className="search">
        <Search size={18} />
        <input className="input" type="search" placeholder="Buscar palabra o categoría" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <div className="section-head">
        <h2 className="section-title">Tus reglas</h2>
      </div>
      <section className="card flush list">
        {custom.length ? custom.map((r) => <RuleRow key={r.id} r={r} />) : <p className="empty small">Se crean al cambiar la categoría de un movimiento y pulsar «Aplicar siempre», o con el botón +.</p>}
      </section>
      <div className="section-head">
        <h2 className="section-title">Predefinidas</h2>
        <span className="meta">{builtIn.length}</span>
      </div>
      <section className="card flush list">
        {builtIn.map((r) => (
          <RuleRow key={r.id} r={r} />
        ))}
      </section>
      {editing && <RuleEditor rule={editing} onClose={() => setEditing(null)} />}
    </main>
  )
}

function RuleEditor({ rule, onClose }: { rule: Partial<Rule>; onClose: () => void }) {
  const { categoryById, transactions } = useData()
  const toast = useToast()
  const [keyword, setKeyword] = useState(rule.keyword ?? '')
  const [categoryId, setCategoryId] = useState<string | null>(rule.categoryId ?? null)
  const [aportacion, setAportacion] = useState(rule.kind === 'aportacion')
  const [picking, setPicking] = useState(false)
  const cat = categoryId ? categoryById.get(categoryId) : undefined
  const matches = keyword.trim() ? transactions.filter((t) => ruleMatches({ id: '', keyword, categoryId: '', custom: true, createdAt: 0 }, t.description)).length : 0

  return (
    <Sheet
      title={rule.id ? 'Editar regla' : 'Nueva regla'}
      onClose={onClose}
      footer={
        <>
          {rule.id && (
            <button
              className="btn danger"
              onClick={async () => {
                await db.rules.delete(rule.id!)
                toast.show('Regla borrada')
                onClose()
              }}
            >
              Borrar
            </button>
          )}
          <button
            className="btn primary block"
            disabled={!keyword.trim() || !categoryId}
            onClick={async () => {
              if (rule.id && normalize(rule.keyword ?? '') !== normalize(keyword)) await db.rules.delete(rule.id)
              if (rule.id && !rule.custom) await db.rules.delete(rule.id)
              const n = await applyRuleEverywhere(keyword, categoryId!, aportacion ? 'aportacion' : undefined)
              toast.show(`Regla guardada${n ? ` · ${n} movimientos actualizados` : ''}`)
              onClose()
            }}
          >
            Guardar y aplicar
          </button>
        </>
      }
    >
      <label className="field">
        <span>Si el concepto contiene</span>
        <input className="input" value={keyword} onChange={(e) => setKeyword(e.target.value)} placeholder="mercadona" autoCapitalize="none" autoCorrect="off" />
        <span className="meta">{keyword.trim() ? `Encaja con ${matches} movimiento${matches === 1 ? '' : 's'} guardados` : 'Sin distinguir mayúsculas ni tildes, palabras completas'}</span>
      </label>
      <div className="field">
        <span className="field-label">Categoría</span>
        <button className="card row" style={{ padding: 10 }} onClick={() => setPicking(true)}>
          <CategoryTile category={cat} size="sm" />
          <span className="grow" style={{ textAlign: 'left', fontWeight: 500 }}>
            {cat ? categoryLabel(cat, categoryById) : 'Elegir categoría'}
          </span>
        </button>
      </div>
      <div className="card row between" style={{ padding: '10px 14px' }}>
        <div>
          <div style={{ fontWeight: 500 }}>Es una aportación a inversión</div>
          <div className="meta">No contará como gasto</div>
        </div>
        <Switch checked={aportacion} onChange={setAportacion} label="Aportación" />
      </div>
      {!rule.custom && rule.id && <p className="meta">Al guardar, esta regla predefinida pasa a ser tuya.</p>}
      {picking && (
        <CategoryPicker
          value={categoryId}
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
