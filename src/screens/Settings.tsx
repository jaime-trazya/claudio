import { useEffect, useState } from 'react'
import { ChevronRight, Download, HardDrive, History, Smartphone, Trash2, Undo2, Upload } from 'lucide-react'
import { useLiveQuery } from 'dexie-react-hooks'
import { listRestorePoints, undoLast } from '../db/history'
import { relativeTime } from '../lib/dates'
import { useUndo } from '../ui/useUndo'
import { useData } from '../ui/useData'
import { useToast } from '../ui/toast'
import { Segmented } from '../ui/components'
import { setSetting } from '../db/settings'
import { wipeAll } from '../db/actions'
import { saveFile, isStandalone } from '../ui/files'
import { useBackupExport, useBackupRestore } from '../ui/useBackup'
import { transactionsToCSV } from '../domain/csvExport'
import { todayISO } from '../lib/dates'
import type { Settings } from '../db/types'
import { ACCENT_PRESETS, isValidHex } from '../ui/theme'

const CURRENCIES = [
  ['EUR', 'Euro (€)'],
  ['USD', 'Dólar estadounidense ($)'],
  ['GBP', 'Libra esterlina (£)'],
  ['CHF', 'Franco suizo (CHF)'],
  ['MXN', 'Peso mexicano (MX$)'],
]

/** "Antes de importar «x»" → "Deshacer: importar «x»"; "Antes de deshacer: …" → "Rehacer: …" */
function actionText(label: string): string {
  if (label.startsWith('Antes de deshacer: ')) return `Rehacer: ${label.slice('Antes de deshacer: '.length)}`
  return `Deshacer: ${label.replace(/^Antes de /, '')}`
}

function Row({ href, label, value }: { href: string; label: string; value?: string }) {
  return (
    <a className="list-item" href={href} style={{ color: 'inherit' }}>
      <span className="grow primary-line">{label}</span>
      {value && <span className="muted small">{value}</span>}
      <ChevronRight size={18} className="chev" />
    </a>
  )
}

export function SettingsScreen() {
  const { settings, accounts, categories, rules, templates, transactions } = useData()
  const toast = useToast()
  const exportBackup = useBackupExport()
  const restore = useBackupRestore()
  const [persisted, setPersisted] = useState<boolean | null>(null)
  const [usage, setUsage] = useState<string | null>(null)
  const points = useLiveQuery(() => listRestorePoints(), [])
  const lastAction = points?.find((p) => p.kind === 'accion')
  const dailyCount = points?.filter((p) => p.kind === 'diaria').length ?? 0
  const undo = useUndo()

  useEffect(() => {
    void navigator.storage?.persisted?.().then(setPersisted)
    void navigator.storage?.estimate?.().then((e) => e.usage !== undefined && setUsage(`${(e.usage / 1024 / 1024).toFixed(1)} MB`))
  }, [])

  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => void setSetting(k, v)
  const lastBackup = settings.lastBackupAt ? new Date(settings.lastBackupAt).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' }) : 'Nunca'

  return (
    <main className="screen">
      <div className="title-row">
        <h1 className="title">Ajustes</h1>
      </div>
      <div className="section-head">
        <h2 className="section-title">Tus datos</h2>
      </div>

      <section className="card flush list" aria-label="Deshacer y borrar">
        <button
          className="list-item"
          disabled={!lastAction}
          onClick={async () => {
            if (!lastAction) return
            const ok = await toast.confirm({ title: 'Deshacer lo último', message: `${actionText(lastAction.label)} (${relativeTime(lastAction.createdAt)}). Todo vuelve a como estaba justo antes.`, confirmLabel: 'Deshacer' })
            if (!ok) return
            const l = await undoLast()
            toast.show(l ? 'Hecho: todo está como antes' : 'No hay nada que deshacer')
          }}
        >
          <Undo2 size={20} className="muted" />
          <div className="grow">
            <div className="primary-line">Deshacer lo último</div>
            <div className="secondary-line ellipsis">{lastAction ? `${actionText(lastAction.label)} · ${relativeTime(lastAction.createdAt)}` : 'No hay acciones recientes'}</div>
          </div>
        </button>
        <a className="list-item" href="#/ajustes/historial" style={{ color: 'inherit' }}>
          <History size={20} className="muted" />
          <div className="grow">
            <div className="primary-line">Volver a como estaba hace…</div>
            <div className="secondary-line">{dailyCount ? `${dailyCount} días guardados · y antes de cada acción` : 'Historial de puntos de restauración'}</div>
          </div>
          <ChevronRight size={18} className="chev" />
        </a>
        <button
          className="list-item"
          style={{ color: 'var(--negative)' }}
          onClick={async () => {
            const first = await toast.confirm({
              title: '¿Eliminar todos los datos?',
              message: 'Se borrarán cuentas, movimientos, reglas, presupuestos, objetivos e inversiones de este dispositivo.',
              confirmLabel: 'Continuar',
              danger: true,
            })
            if (!first) return
            const second = await toast.confirm({
              title: 'Confirmación final',
              message: 'Podrás deshacerlo desde «Deshacer lo último» mientras no borres también el historial. Si quieres que no quede nada, usa «Eliminar también el historial» después.',
              confirmLabel: 'Eliminar todo',
              danger: true,
              typeToConfirm: 'BORRAR',
            })
            if (!second) return
            await wipeAll(true)
            toast.show('Datos eliminados', { action: undo })
          }}
        >
          <Trash2 size={20} />
          <div className="grow">
            <div className="primary-line">Eliminar todos los datos</div>
            <div className="secondary-line">Con doble confirmación. Se puede deshacer.</div>
          </div>
        </button>
        {(points?.length ?? 0) > 0 && (
          <button
            className="list-item"
            style={{ color: 'var(--negative)' }}
            onClick={async () => {
              const ok = await toast.confirm({
                title: 'Eliminar todo, también el historial',
                message: 'Se borran los datos y todos los puntos para deshacer. No se podrá recuperar nada salvo con una copia de seguridad.',
                confirmLabel: 'Eliminar para siempre',
                danger: true,
                typeToConfirm: 'BORRAR',
              })
              if (!ok) return
              await wipeAll(false)
              toast.show('Todo eliminado, también el historial')
            }}
          >
            <Trash2 size={20} />
            <div className="grow">
              <div className="primary-line">Eliminar también el historial</div>
              <div className="secondary-line">{points!.length} puntos para deshacer guardados</div>
            </div>
          </button>
        )}
      </section>


      <div className="section-head">
        <h2 className="section-title">Preferencias</h2>
      </div>
      <section className="card stack">
        <label className="field">
          <span>Moneda</span>
          <select className="select" value={settings.currency} onChange={(e) => set('currency', e.target.value)}>
            {CURRENCIES.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Primer día del mes contable</span>
          <select className="select" value={settings.monthStartDay} onChange={(e) => set('monthStartDay', Number(e.target.value))}>
            {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => (
              <option key={d} value={d}>
                {d === 1 ? 'Día 1 (mes natural)' : `Día ${d}`}
              </option>
            ))}
          </select>
          <span className="meta">Si cobras a final de mes, empieza el mes el día que cobras (por ejemplo, el 25).</span>
        </label>
        <label className="field">
          <span>Tu nombre (opcional)</span>
          <input
            className="input"
            defaultValue={settings.ownerName}
            placeholder="Nombre y apellidos"
            autoComplete="name"
            onBlur={(e) => e.target.value.trim() !== settings.ownerName && set('ownerName', e.target.value.trim())}
          />
          <span className="meta">Se guarda solo en este dispositivo. Sirve para reconocer como traspaso los envíos a ti mismo («To …», «Transferencia a …»).</span>
        </label>
        <div className="field">
          <span className="field-label">Apariencia</span>
          <Segmented
            label="Apariencia"
            value={settings.theme}
            onChange={(v) => set('theme', v)}
            options={[
              { value: 'sistema', label: 'Automática' },
              { value: 'claro', label: 'Clara' },
              { value: 'oscuro', label: 'Oscura' },
            ]}
          />
        </div>
        <div className="field">
          <span className="field-label">Color de la app</span>
          <div className="swatches">
            {ACCENT_PRESETS.map((p) => (
              <button
                key={p.color}
                className="swatch"
                style={{ background: p.color }}
                aria-pressed={(settings.accentColor || ACCENT_PRESETS[0].color).toLowerCase() === p.color}
                aria-label={p.name}
                title={p.name}
                onClick={() => set('accentColor', p.color === ACCENT_PRESETS[0].color ? '' : p.color)}
              />
            ))}
            <label className="swatch" style={{ display: 'grid', placeItems: 'center', background: 'conic-gradient(#e53935, #fdd835, #43a047, #1e88e5, #8e24aa, #e53935)', position: 'relative', overflow: 'hidden' }} title="Otro color">
              <input
                type="color"
                value={isValidHex(settings.accentColor) ? settings.accentColor : ACCENT_PRESETS[0].color}
                onChange={(e) => set('accentColor', e.target.value)}
                aria-label="Elegir otro color"
                style={{ opacity: 0, position: 'absolute', inset: 0, width: '100%', height: '100%', cursor: 'pointer' }}
              />
            </label>
          </div>
          <span className="meta">Botones, gráficas y resaltados. El modo claro u oscuro se ajusta solo.</span>
        </div>
        <label className="field">
          <span>Recordatorio de Trade Republic</span>
          <select className="select" value={settings.trReminderDay} onChange={(e) => set('trReminderDay', Number(e.target.value))}>
            {[1, 2, 3, 5, 7, 10, 15].map((d) => (
              <option key={d} value={d}>
                A partir del día {d} de cada mes
              </option>
            ))}
          </select>
        </label>
      </section>

      <section className="card flush list" aria-label="Datos">
        <Row href="#/ajustes/cuentas" label="Cuentas" value={String(accounts.length)} />
        <Row href="#/ajustes/categorias" label="Categorías" value={String(categories.length)} />
        <Row href="#/ajustes/reglas" label="Reglas de categorización" value={String(rules.length)} />
        <Row href="#/ajustes/plantillas" label="Plantillas de bancos" value={String(templates.length)} />
        <Row href="#/analisis?vista=presupuestos" label="Presupuestos" />
      </section>

      <div className="section-head">
        <h2 className="section-title">Copia de seguridad</h2>
      </div>
      <section className="card stack">
        <p className="muted small">
          Guarda un archivo con todos tus datos en iCloud Drive (en la hoja de compartir, elige «Guardar en Archivos»). Última copia: <strong>{lastBackup}</strong>.
        </p>
        <button className="btn primary" onClick={() => void exportBackup()}>
          <Download size={18} /> Exportar copia (JSON)
        </button>
        <button className="btn" onClick={() => void restore()}>
          <Upload size={18} /> Restaurar una copia
        </button>
        <button
          className="btn"
          disabled={!transactions.length}
          onClick={async () => {
            const ok = await saveFile(transactionsToCSV(transactions, accounts, categories), `movimientos-${todayISO()}.csv`, 'text/csv')
            if (ok) toast.show('Movimientos exportados')
          }}
        >
          Exportar movimientos a CSV
        </button>
      </section>

      <div className="section-head">
        <h2 className="section-title">Este dispositivo</h2>
      </div>
      <section className="card flush list">
        <a className="list-item" href="#/ajustes/instalar" style={{ color: 'inherit' }}>
          <Smartphone size={20} className="muted" />
          <div className="grow">
            <div className="primary-line">Instalar en el iPhone</div>
            <div className="secondary-line">{isStandalone() ? 'Instalada: estás usando la app desde el icono' : 'Añádela a la pantalla de inicio'}</div>
          </div>
          <ChevronRight size={18} className="chev" />
        </a>
        <div className="list-item">
          <HardDrive size={20} className="muted" />
          <div className="grow">
            <div className="primary-line">Almacenamiento</div>
            <div className="secondary-line">
              {persisted === null ? 'Comprobando…' : persisted ? 'Persistente: el sistema no borrará los datos' : 'Normal: instala la app y haz copias de seguridad'}
              {usage ? ` · ${usage} usados` : ''}
            </div>
          </div>
        </div>
      </section>

      <p className="meta" style={{ textAlign: 'center' }}>Claudio · sin servidor, todo se guarda en este dispositivo</p>
    </main>
  )
}
