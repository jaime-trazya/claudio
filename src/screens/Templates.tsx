import { Trash2 } from 'lucide-react'
import { useData } from '../ui/useData'
import { useToast } from '../ui/toast'
import { BackBar } from '../ui/components'
import { db } from '../db/db'

const col = (i: number | null) => (i === null ? '—' : String.fromCharCode(65 + (i % 26)))

export function TemplatesScreen() {
  const { templates } = useData()
  const toast = useToast()
  return (
    <main className="screen sub">
      <BackBar label="Ajustes" fallback="/ajustes" />
      <h1 className="title">Plantillas de bancos</h1>
      <p className="muted small">Se guardan al elegir las columnas a mano durante una importación. Cuando un archivo tiene la misma cabecera, se usa la plantilla automáticamente.</p>
      <section className="card flush list">
        {templates.length ? (
          templates.map((t) => (
            <div key={t.id} className="list-item">
              <div className="grow">
                <div className="primary-line">{t.name}</div>
                <div className="secondary-line">
                  Cabecera en fila {t.mapping.headerRow + 1} · fecha {col(t.mapping.dateCol)} · concepto {col(t.mapping.descCol)} ·{' '}
                  {t.mapping.amountCol !== null ? `importe ${col(t.mapping.amountCol)}` : `cargo ${col(t.mapping.debitCol)}, abono ${col(t.mapping.creditCol)}`}
                </div>
              </div>
              <button
                className="icon-btn plain"
                aria-label={`Borrar plantilla ${t.name}`}
                onClick={async () => {
                  await db.templates.delete(t.id)
                  toast.show('Plantilla borrada')
                }}
              >
                <Trash2 size={18} />
              </button>
            </div>
          ))
        ) : (
          <p className="empty small">Aún no hay plantillas. La mayoría de extractos se reconocen solos.</p>
        )}
      </section>
    </main>
  )
}
