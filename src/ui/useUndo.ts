import { undoLast } from '../db/history'
import { useToast } from './toast'

/** Acción "Deshacer" para los avisos: vuelve al punto guardado justo antes de la última acción */
export function useUndo() {
  const toast = useToast()
  return {
    label: 'Deshacer',
    run: () => {
      void undoLast().then((l) => toast.show(l ? `Deshecho: ${l.replace(/^Antes de /, '')}` : 'No hay nada que deshacer'))
    },
  }
}
