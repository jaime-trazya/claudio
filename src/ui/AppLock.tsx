import { useEffect, useRef, useState } from 'react'
import { Lock, ScanFace } from 'lucide-react'
import { useData } from './useData'
import { checkPin, pinWait, recordPinFailure, resetPinFailures, RELOCK_MS, verifyBiometrics } from '../lib/lock'
import { lockPageScroll } from './scrollLock'

/**
 * Pantalla de bloqueo: tapa toda la app al abrirla y al volver tras más de un minuto fuera.
 * Se desbloquea con Face ID o con el código de respaldo.
 */
export function AppLock() {
  const { settings } = useData()
  const enabled = settings.lockEnabled && !!settings.lockPinHash
  const [locked, setLocked] = useState(enabled)
  const [pin, setPin] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  // Tapa la app en cuanto pasa a segundo plano: así ni el selector de apps del iPhone ni el instante
  // de volver enseñan tus datos. Al volver antes de un minuto se destapa sin pedir nada.
  const [covered, setCovered] = useState(false)
  const hiddenAt = useRef<number | null>(null)

  useEffect(() => {
    if (!enabled) return
    const onVis = () => {
      if (document.visibilityState === 'hidden') {
        hiddenAt.current = Date.now()
        setCovered(true)
      } else {
        if (hiddenAt.current !== null && Date.now() - hiddenAt.current > RELOCK_MS) setLocked(true)
        setCovered(false)
      }
    }
    document.addEventListener('visibilitychange', onVis)
    window.addEventListener('pagehide', onVis)
    return () => {
      document.removeEventListener('visibilitychange', onVis)
      window.removeEventListener('pagehide', onVis)
    }
  }, [enabled])

  // Al activarlo en Ajustes no se bloquea en ese momento (ya estás dentro): el estado inicial es el del arranque
  const show = enabled && locked

  useEffect(() => (show ? lockPageScroll() : undefined), [show])

  if (!show) return enabled && covered ? <div className="app-lock" aria-hidden="true" /> : null

  async function faceId() {
    setBusy(true)
    setError('')
    const ok = await verifyBiometrics(settings.lockCredentialId)
    setBusy(false)
    if (ok) unlock()
    else setError('No se ha podido comprobar. Prueba otra vez o usa tu código.')
  }

  async function withPin(e: React.FormEvent) {
    e.preventDefault()
    const wait = pinWait()
    if (wait > 0) {
      setError(`Demasiados intentos. Espera ${Math.ceil(wait / 1000)} s.`)
      return
    }
    setBusy(true)
    const ok = await checkPin(pin, settings.lockPinSalt, settings.lockPinHash)
    setBusy(false)
    if (ok) {
      resetPinFailures()
      unlock()
    } else {
      const next = recordPinFailure()
      setError(next > 0 ? `Código incorrecto. Espera ${Math.ceil(next / 1000)} s para volver a probar.` : 'Código incorrecto')
      setPin('')
    }
  }

  function unlock() {
    setLocked(false)
    setPin('')
    setError('')
  }

  return (
    <div className="app-lock" role="dialog" aria-modal="true" aria-label="App bloqueada">
      <div className="app-lock-inner">
        <span className="app-lock-icon" aria-hidden="true">
          <Lock size={30} />
        </span>
        <h1>Claudio está bloqueada</h1>
        <p className="muted">Tus finanzas solo las ves tú.</p>
        {settings.lockCredentialId && (
          <button className="btn primary block" onClick={() => void faceId()} disabled={busy} autoFocus>
            <ScanFace size={20} /> Desbloquear con Face ID
          </button>
        )}
        <form className="app-lock-pin" onSubmit={(e) => void withPin(e)}>
          <label className="field">
            <span>{settings.lockCredentialId ? 'O con tu código' : 'Tu código'}</span>
            <input className="input" type="password" inputMode="numeric" autoComplete="off" pattern="[0-9]*" maxLength={8} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))} placeholder="Código" aria-label="Código de desbloqueo" />
          </label>
          <button className="btn block" type="submit" disabled={busy || pin.length < 4}>
            Desbloquear
          </button>
        </form>
        <p className="app-lock-error" role="alert">
          {error}
        </p>
      </div>
    </div>
  )
}
