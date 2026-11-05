// Hojas abiertas, de abajo arriba. La página no se desplaza mientras haya alguna abierta y Escape
// cierra solo la de arriba. Antes cada hoja guardaba y restauraba el bloqueo por su cuenta: con una
// hoja encima de otra (elegir categoría al editar un movimiento) la página se quedaba bloqueada.
export const openSheets: symbol[] = []
let otherLocks = 0
export function syncScrollLock() {
  document.body.style.overflow = openSheets.length || otherLocks ? 'hidden' : ''
}

/** Bloquea el desplazamiento de la página (p. ej. la pantalla de bloqueo) sin pisar el de las hojas */
export function lockPageScroll(): () => void {
  otherLocks++
  syncScrollLock()
  let done = false
  return () => {
    if (done) return
    done = true
    otherLocks--
    syncScrollLock()
  }
}
