import { useState } from 'react'
import { Plus } from 'lucide-react'
import { useData } from '../ui/useData'
import { useToast } from '../ui/toast'
import { BackBar, CategoryTile, Segmented, Sheet } from '../ui/components'
import { CategoryIcon } from '../ui/icons'
import { CATEGORY_COLORS, CATEGORY_ICON_NAMES } from '../ui/iconNames'
import { db } from '../db/db'
import { deleteCategory } from '../db/actions'
import { uid } from '../lib/text'
import type { Category, CategoryKind } from '../db/types'

export function CategoriesScreen() {
  const { categories } = useData()
  const [editing, setEditing] = useState<Partial<Category> | null>(null)
  const [kind, setKind] = useState<CategoryKind>('gasto')
  const parents = categories.filter((c) => !c.parentId && c.kind === kind)
  return (
    <main className="screen sub">
      <BackBar label="Ajustes" fallback="/ajustes" />
      <div className="title-row">
        <h1 className="title">Categorías</h1>
        <button className="icon-btn primary" onClick={() => setEditing({ kind, parentId: null })} aria-label="Nueva categoría">
          <Plus size={22} />
        </button>
      </div>
      <Segmented
        label="Tipo"
        value={kind}
        onChange={setKind}
        options={[
          { value: 'gasto', label: 'Gastos' },
          { value: 'ingreso', label: 'Ingresos' },
        ]}
      />
      {parents.map((p) => {
        const children = categories.filter((c) => c.parentId === p.id)
        return (
          <section key={p.id} className="card flush list">
            <button className="list-item" onClick={() => setEditing(p)}>
              <CategoryTile category={p} />
              <span className="grow primary-line" style={{ fontWeight: 600 }}>
                {p.name}
              </span>
              <span className="meta">{children.length ? `${children.length} sub` : ''}</span>
            </button>
            {children.map((c) => (
              <button key={c.id} className="list-item" style={{ paddingLeft: 36 }} onClick={() => setEditing(c)}>
                <CategoryTile category={c} size="sm" />
                <span className="grow">{c.name}</span>
              </button>
            ))}
            <button className="list-item small" style={{ paddingLeft: 36, minHeight: 48, color: 'var(--accent)' }} onClick={() => setEditing({ parentId: p.id, kind: p.kind, color: p.color })}>
              <Plus size={16} /> Añadir subcategoría
            </button>
          </section>
        )
      })}
      {editing && <CategoryEditor category={editing} onClose={() => setEditing(null)} />}
    </main>
  )
}

function CategoryEditor({ category, onClose }: { category: Partial<Category>; onClose: () => void }) {
  const { categories, transactions } = useData()
  const toast = useToast()
  const [name, setName] = useState(category.name ?? '')
  const [icon, setIcon] = useState(category.icon ?? 'tag')
  const [color, setColor] = useState(category.color ?? CATEGORY_COLORS[0])
  const [parentId, setParentId] = useState<string | null>(category.parentId ?? null)
  const kind = category.kind ?? 'gasto'
  const parents = categories.filter((c) => !c.parentId && c.kind === kind && c.id !== category.id)
  const hasChildren = !!category.id && categories.some((c) => c.parentId === category.id)
  const used = category.id ? transactions.filter((t) => t.categoryId === category.id).length : 0
  const preview: Category = { id: 'p', name, icon, color, parentId, kind, order: 0 }

  return (
    <Sheet
      title={category.id ? 'Editar categoría' : 'Nueva categoría'}
      onClose={onClose}
      full
      footer={
        <>
          {category.id && (
            <button
              className="btn danger"
              onClick={async () => {
                const ok = await toast.confirm({
                  title: `Borrar «${category.name}»`,
                  message: `${used ? `Sus ${used} movimientos pasarán a ${category.parentId ? 'la categoría principal' : '«Sin categoría»'}. ` : ''}También se borrarán sus reglas y su presupuesto.`,
                  confirmLabel: 'Borrar',
                  danger: true,
                })
                if (!ok) return
                await deleteCategory(category.id!)
                onClose()
              }}
            >
              Borrar
            </button>
          )}
          <button
            className="btn primary block"
            disabled={!name.trim()}
            onClick={async () => {
              await db.categories.put({
                id: category.id ?? uid(),
                name: name.trim(),
                icon,
                color,
                parentId: hasChildren ? null : parentId,
                kind,
                order: category.order ?? categories.length + 1,
              })
              // Las subcategorías heredan el color de la principal
              if (category.id && !parentId) await db.categories.where('parentId').equals(category.id).modify({ color })
              toast.show('Categoría guardada')
              onClose()
            }}
          >
            Guardar
          </button>
        </>
      }
    >
      <div className="row" style={{ justifyContent: 'center', padding: 8 }}>
        <CategoryTile category={preview} />
      </div>
      <label className="field">
        <span>Nombre</span>
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} autoFocus={!category.id} />
      </label>
      {!hasChildren && (
        <label className="field">
          <span>Dentro de</span>
          <select className="select" value={parentId ?? ''} onChange={(e) => setParentId(e.target.value || null)}>
            <option value="">Ninguna (categoría principal)</option>
            {parents.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
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
      <div className="field">
        <span className="field-label">Icono</span>
        <div className="icon-grid">
          {CATEGORY_ICON_NAMES.map((k) => (
            <button key={k} aria-pressed={k === icon} aria-label={k} onClick={() => setIcon(k)}>
              <CategoryIcon name={k} size={20} />
            </button>
          ))}
        </div>
      </div>
    </Sheet>
  )
}
