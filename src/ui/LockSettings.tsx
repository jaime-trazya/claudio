import { useEffect, useState } from 'react'
import { ScanFace } from 'lucide-react'
import { useData } from './useData'
import { useToast } from './toast'
import { Sheet, Switch } from './components'
import { setSetting } from '../db/settings'
import { biometricsAvailable, checkPin, newPin, PIN_RE, registerBiometrics } from '../lib/lock'

/** Ajustes › Bloqueo con Face ID: activar (código de respaldo + llave de Face ID) o desactivar */
export function LockSettings() {
  const { settings } = useData()
  const toast = useToast()
  const [setup, setSetup] = useState(false)
  const [available, setAvailable] = useState<boolean | null>(null)
  useEffect(() => {
    void biometricsAvailable().then(setAvailable)
  }, [])
  const on = settings.lockEnabled && !!settings.lockPinHash

  async function toggle(v: boolean) {
    if (v) return setSetup(true)
    const ok = await toast.confirm({ title: 'Quitar el bloqueo', message: 'La app se abrirá sin pedir Face ID ni código.', confirmLabel: 'Quitar' })
    if (!ok) return
    await Promise.all([setSetting('lockEnabled', false), setSetting('lockCredentialId', ''), setSetting('lockPinSalt', ''), setSetting('lockPinHash', '')])
    toast.show('Bloqueo quitado')
  }

  return (
    <>
      <div className="list-item">
        <ScanFace size={20} className="muted" />
        <div className="grow">
          <div className="primary-line">Bloquear con Face ID</div>
          <div className="secondary-line">{on ? (settings.lockCredentialId ? 'Activado · con código de respaldo' : 'Activado con código') : available === false ? 'Con código (este dispositivo no ofrece Face ID a la web)' : 'Pide Face ID al abrir la app'}</div>
        </div>
        <Switch checked={on} onChange={(v) => void toggle(v)} label="Bloquear con Face ID" />
      </div>
      {setup && <LockSetup biometrics={available !== false} onClose={() => setSetup(false)} />}
    </>
  )
}

function LockSetup({ biometrics, onClose }: { biometrics: boolean; onClose: () => void }) {
  const toast = useToast()
  const [pin, setPin] = useState('')
  const [repeat, setRepeat] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const valid = PIN_RE.test(pin) && pin === repeat

  async function activate() {
    if (!valid) return
    setBusy(true)
    setError('')
    let credentialId = ''
    if (biometrics) {
      try {
        credentialId = await registerBiometrics()
      } catch {
        setBusy(false)
        setError('No se ha podido activar Face ID. Puedes intentarlo otra vez o activar solo el código.')
        return
      }
    }
    await save(credentialId)
  }

  async function save(credentialId: string) {
    const { pinSalt, pinHash } = await newPin(pin)
    // Comprobación de que la huella guardada sirve antes de bloquear nada
    if (!(await checkPin(pin, pinSalt, pinHash))) {
      setBusy(false)
      setError('Algo ha fallado al guardar el código. Inténtalo otra vez.')
      return
    }
    await setSetting('lockPinSalt', pinSalt)
    await setSetting('lockPinHash', pinHash)
    await setSetting('lockCredentialId', credentialId)
    await setSetting('lockEnabled', true)
    toast.show(credentialId ? 'Face ID activado' : 'Bloqueo con código activado')
    onClose()
  }

  return (
    <Sheet title="Bloquear con Face ID" onClose={onClose}>
      <p className="muted small">
        Al abrir la app, y al volver después de más de un minuto, te pedirá Face ID. Elige también un código de 4 a 8 cifras por si Face ID falla: sin él podrías quedarte sin acceso a tus datos.
      </p>
      <label className="field">
        <span>Código de respaldo</span>
        <input className="input" type="password" inputMode="numeric" autoComplete="new-password" maxLength={8} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))} placeholder="4 a 8 cifras" />
      </label>
      <label className="field">
        <span>Repite el código</span>
        <input className="input" type="password" inputMode="numeric" autoComplete="new-password" maxLength={8} value={repeat} onChange={(e) => setRepeat(e.target.value.replace(/\D/g, ''))} />
      </label>
      {repeat.length >= 4 && pin !== repeat && <p className="small" style={{ color: 'var(--negative)' }}>Los códigos no coinciden</p>}
      {error && (
        <p className="small" role="alert" style={{ color: 'var(--negative)' }}>
          {error}
        </p>
      )}
      <button className="btn primary block" disabled={!valid || busy} onClick={() => void activate()}>
        <ScanFace size={18} /> {biometrics ? 'Activar Face ID' : 'Activar con código'}
      </button>
      {biometrics && error && (
        <button className="btn block" disabled={!valid || busy} onClick={() => void save('')}>
          Activar solo con código
        </button>
      )}
      <p className="meta">Es un bloqueo de privacidad: evita que alguien con tu iPhone desbloqueado vea tus finanzas. Los datos siguen guardados solo en este dispositivo.</p>
    </Sheet>
  )
}
