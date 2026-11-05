import { useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { ChevronLeft, ChevronRight, X } from 'lucide-react'
import { formatMoney, splitMoney } from '../lib/money'
import type { Category } from '../db/types'
import { CategoryIcon } from './icons'
import { useData } from './useData'
import { back } from './router'

/** Importe con los céntimos más pequeños. Ingresos en verde con "+", gastos en tinta. */
export function Money({ cents: raw, className = '', sign = false, plain = false, currency }: { cents: number; className?: string; sign?: boolean; plain?: boolean; currency?: string }) {
  const { settings } = useData()
  const cents = raw === 0 ? 0 : raw // evita "−0,00 €"

  const cur = currency ?? settings.currency
  const { main, decimals } = splitMoney(cents, cur)
  const tone = plain ? '' : cents > 0 && sign ? 'pos' : cents === 0 ? 'zero' : ''
  return (
    <span className={`money ${tone} ${className}`} aria-label={formatMoney(cents, { currency: cur, sign: sign && cents > 0 })}>
      {sign && cents > 0 ? '+' : ''}
      {main.replace('-', '−')}
      {decimals && <span className="dec">{decimals}</span>}
    </span>
  )
}

export function CategoryTile({ category, size = 'md' }: { category?: Category | null; size?: 'sm' | 'md' }) {
  if (!category) {
    return (
      <span className={`tile none ${size === 'sm' ? 'sm' : ''}`} aria-hidden>
        <CategoryIcon name="tag" size={size === 'sm' ? 16 : 19} />
      </span>
    )
  }
  return (
    <span className={`tile ${size === 'sm' ? 'sm' : ''}`} style={{ '--c': category.color } as React.CSSProperties} aria-hidden>
      <CategoryIcon name={category.icon} size={size === 'sm' ? 16 : 19} />
    </span>
  )
}

interface SheetProps {
  title?: ReactNode
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
  full?: boolean
  headerAction?: ReactNode
}

// Hojas abiertas, de abajo arriba. La página no se desplaza mientras haya alguna abierta y Escape
// cierra solo la de arriba. Antes cada hoja guardaba y restauraba el bloqueo por su cuenta: con una
// hoja encima de otra (elegir categoría al editar un movimiento) la página se quedaba bloqueada.
const openSheets: symbol[] = []
function syncScrollLock() {
  document.body.style.overflow = openSheets.length ? 'hidden' : ''
}

/** Hoja inferior al estilo iOS. Se cierra con el fondo, la X o Escape. */
export function Sheet({ title, onClose, children, footer, full, headerAction }: SheetProps) {
  const [closing, setClosing] = useState(false)
  const closeRef = useRef(onClose)
  const closingRef = useRef(false)
  useEffect(() => {
    closeRef.current = onClose
  }, [onClose])
  const close = () => {
    if (closingRef.current) return
    closingRef.current = true
    setClosing(true)
    window.setTimeout(() => closeRef.current(), 200)
  }
  const closeFnRef = useRef(close)
  useEffect(() => {
    closeFnRef.current = close
  })
  useEffect(() => {
    const id = Symbol('hoja')
    openSheets.push(id)
    syncScrollLock()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && openSheets[openSheets.length - 1] === id) closeFnRef.current()
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      openSheets.splice(openSheets.indexOf(id), 1)
      syncScrollLock()
    }
  }, [])
  // Se pinta directamente en <body>: dentro de otra hoja (que tiene su propio desplazamiento y
  // animación) Safari de iOS la recorta y los gestos de deslizar se cruzan entre las dos.
  return createPortal(
    <div className={`sheet-root ${closing ? 'sheet-closing' : ''}`} role="dialog" aria-modal="true" aria-label={typeof title === 'string' ? title : undefined}>
      <div className="sheet-scrim" onClick={close} />
      <div className={`sheet ${full ? 'full' : ''}`}>
        <div className="sheet-grabber" />
        <div className="sheet-head">
          <h2>{title}</h2>
          <div className="row" style={{ gap: 4 }}>
            {headerAction}
            <button className="icon-btn plain" onClick={close} aria-label="Cerrar">
              <X size={22} />
            </button>
          </div>
        </div>
        <div className="sheet-body">{children}</div>
        {footer && <div className="sheet-foot">{footer}</div>}
      </div>
    </div>,
    document.body,
  )
}

export function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; label?: string }) {
  return (
    <div className="segmented" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} type="button" aria-pressed={o.value === value} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function Notice({ tone = 'accent', icon, title, children, actions }: { tone?: 'warn' | 'accent' | 'neg'; icon: ReactNode; title: string; children?: ReactNode; actions?: ReactNode }) {
  return (
    <div className={`notice ${tone}`} role={tone === 'neg' ? 'alert' : 'status'}>
      <span className="notice-icon">{icon}</span>
      <div className="grow">
        <strong>{title}</strong>
        {children && <p>{children}</p>}
        {actions && <div className="notice-actions">{actions}</div>}
      </div>
    </div>
  )
}

export function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="switch">
      <input type="checkbox" role="switch" checked={checked} onChange={(e) => onChange(e.target.checked)} aria-label={label} />
      <span />
    </label>
  )
}

export function PeriodSwitch({ label, onPrev, onNext, nextDisabled }: { label: string; onPrev: () => void; onNext: () => void; nextDisabled?: boolean }) {
  return (
    <div className="month-switch">
      <button className="icon-btn plain" onClick={onPrev} aria-label="Periodo anterior">
        <ChevronLeft size={22} />
      </button>
      <span className="label">{label}</span>
      <button className="icon-btn plain" onClick={onNext} aria-label="Periodo siguiente" disabled={nextDisabled} style={{ opacity: nextDisabled ? 0.3 : 1 }}>
        <ChevronRight size={22} />
      </button>
    </div>
  )
}

export function BackBar({ label = 'Atrás', fallback = '/' }: { label?: string; fallback?: string }) {
  return (
    <div className="back-bar">
      <button onClick={() => back(fallback)}>
        <ChevronLeft size={24} />
        {label}
      </button>
    </div>
  )
}

export function Empty({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="empty">
      <strong>{title}</strong>
      {children && <p>{children}</p>}
      {action && <div style={{ marginTop: 14 }}>{action}</div>}
    </div>
  )
}

/** Selector de categoría en cuadrícula, agrupado por categoría principal */
export function CategoryPicker({ value, onPick, onClose, kind }: { value: string | null; onPick: (id: string | null) => void; onClose: () => void; kind?: 'gasto' | 'ingreso' }) {
  const { categories } = useData()
  const [q, setQ] = useState('')
  const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  const parents = categories.filter((c) => !c.parentId)
  const ordered = [...parents].sort((a, b) => (kind && a.kind !== b.kind ? (a.kind === kind ? -1 : 1) : a.order - b.order))
  const match = (c: Category) => !q || norm(c.name).includes(norm(q))
  return (
    <Sheet title="Categoría" onClose={onClose} full>
      <input className="input" placeholder="Buscar categoría" value={q} onChange={(e) => setQ(e.target.value)} />
      <button className="cat-option" style={{ flexDirection: 'row', justifyContent: 'center', padding: 12 }} aria-pressed={value === null} onClick={() => onPick(null)}>
        Sin categoría
      </button>
      {ordered.map((p) => {
        const children = categories.filter((c) => c.parentId === p.id)
        const items = [p, ...children].filter(match)
        if (!items.length) return null
        return (
          <div key={p.id} className="stack" style={{ gap: 8 }}>
            <div className="field-label">{p.name}</div>
            <div className="cat-grid">
              {items.map((c) => (
                <button key={c.id} className="cat-option" aria-pressed={value === c.id} onClick={() => onPick(c.id)}>
                  <CategoryTile category={c} size="sm" />
                  {c.id === p.id && children.length ? 'General' : c.name}
                </button>
              ))}
            </div>
          </div>
        )
      })}
    </Sheet>
  )
}
