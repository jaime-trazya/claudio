import { useLiveQuery } from 'dexie-react-hooks'
import { RotateCcw } from 'lucide-react'
import { BackBar } from '../ui/components'
import { useToast } from '../ui/toast'
import { listRestorePoints, restorePoint } from '../db/history'
import { relativeTime } from '../lib/dates'

const when = (ts: number) => new Date(ts).toLocaleString('es-ES', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })

/** Historial: volver a como estaba antes de una acción o hace X días */
export function HistoryScreen() {
  const toast = useToast()
  const points = useLiveQuery(() => listRestorePoints(), [])
  const daily = (points ?? []).filter((p) => p.kind === 'diaria')
  const actions = (points ?? []).filter((p) => p.kind === 'accion')

  async function go(id: string, label: string) {
    const ok = await toast.confirm({
      title: 'Volver a este punto',
      message: `Tus datos volverán a como estaban: «${label}». Lo de después se guarda antes como otro punto, por si quieres rehacerlo.`,
      confirmLabel: 'Volver',
    })
    if (!ok) return
    try {
      await restorePoint(id)
      toast.show('Datos restaurados')
    } catch (e) {
      toast.show((e as Error).message)
    }
  }

  const Row = ({ p }: { p: (typeof actions)[number] }) => (
    <button className="list-item" onClick={() => void go(p.id, p.label)}>
      <RotateCcw size={18} className="muted" />
      <div className="grow">
        <div className="primary-line ellipsis">{p.kind === 'diaria' ? `Como estaba ${relativeTime(p.createdAt)}` : p.label}</div>
        <div className="secondary-line">
          {when(p.createdAt)} · {p.transactions} movimientos
        </div>
      </div>
    </button>
  )

  return (
    <main className="screen sub">
      <BackBar label="Ajustes" fallback="/ajustes" />
      <h1 className="title">Deshacer</h1>
      <p className="muted small">La app guarda un punto antes de cada importación, regla o borrado, y una foto al día de los últimos 30 días. Todo se queda en este iPhone y no entra en la copia de seguridad.</p>
      <div className="section-head">
        <h2 className="section-title">Volver a hace unos días</h2>
      </div>
      <section className="card flush list">{daily.length ? daily.map((p) => <Row key={p.id} p={p} />) : <p className="empty small">La primera foto diaria se guarda al abrir la app con datos.</p>}</section>
      <div className="section-head">
        <h2 className="section-title">Antes de cada acción</h2>
      </div>
      <section className="card flush list">{actions.length ? actions.map((p) => <Row key={p.id} p={p} />) : <p className="empty small">Aún no hay acciones que deshacer.</p>}</section>
    </main>
  )
}
