import { useState } from 'react'
import { Share, SquarePlus } from 'lucide-react'
import { useData } from '../ui/useData'
import { BackBar, Sheet } from '../ui/components'
import { isIOS, isStandalone } from '../ui/files'
import { setSetting } from '../db/settings'

function Steps() {
  return (
    <ol className="steps">
      <li>
        <span>
          Abre esta página en <strong>Safari</strong> (no desde otra app).
        </span>
      </li>
      <li>
        <span>
          Pulsa el botón Compartir <span className="kbd"><Share size={15} /></span> en la barra de Safari.
        </span>
      </li>
      <li>
        <span>
          Elige <span className="kbd"><SquarePlus size={15} /> Añadir a pantalla de inicio</span> y pulsa <strong>Añadir</strong>.
        </span>
      </li>
      <li>
        <span>
          Abre la app <strong>siempre desde el icono</strong>. Funciona sin conexión.
        </span>
      </li>
    </ol>
  )
}

const WARNING = 'En iPhone, Safari y la app instalada guardan los datos por separado: lo que hagas en Safari no aparecerá en el icono. Usa siempre el icono y haz copias de seguridad en iCloud Drive.'

/** Instrucciones la primera vez que se abre desde Safari sin instalar */
export function InstallHint() {
  const { settings } = useData()
  // Se monta cuando los ajustes ya están cargados (ver App), así que basta con el estado inicial
  const [open, setOpen] = useState(() => isIOS() && !isStandalone() && !settings.installHintSeen)
  if (!open) return null
  const close = () => {
    setOpen(false)
    void setSetting('installHintSeen', true)
  }
  return (
    <Sheet title="Instala la app en tu iPhone" onClose={close} footer={<button className="btn primary block" onClick={close}>Entendido</button>}>
      <Steps />
      <div className="notice warn">
        <div>
          <strong>Úsala siempre desde el icono</strong>
          <p>{WARNING}</p>
        </div>
      </div>
    </Sheet>
  )
}

export function InstallGuide() {
  return (
    <main className="screen sub">
      <BackBar label="Ajustes" fallback="/ajustes" />
      <h1 className="title">Instalar en el iPhone</h1>
      {isStandalone() ? <p className="pill pos" style={{ alignSelf: 'flex-start' }}>Ya estás usando la app instalada</p> : null}
      <section className="card">
        <Steps />
      </section>
      <section className="card stack" style={{ gap: 8 }}>
        <strong>Tus datos</strong>
        <p className="muted small">{WARNING}</p>
        <p className="muted small">La app pide al sistema almacenamiento persistente para que iOS no borre los datos. Las actualizaciones de la app no tocan tus datos.</p>
      </section>
    </main>
  )
}
