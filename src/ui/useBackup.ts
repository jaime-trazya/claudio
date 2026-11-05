import { createBackup, backupFileName, backupSummary, restoreBackup, validateBackup } from '../db/backup'
import { setSetting } from '../db/settings'
import { createRestorePoint } from '../db/history'
import { ACCEPT_JSON, pickFile, saveFile } from './files'
import { useToast } from './toast'

export function useBackupExport() {
  const toast = useToast()
  return async () => {
    const backup = await createBackup()
    const ok = await saveFile(JSON.stringify(backup), backupFileName(), 'application/json')
    if (ok) {
      await setSetting('lastBackupAt', Date.now())
      toast.show('Copia de seguridad creada')
    }
  }
}

export function useBackupRestore() {
  const toast = useToast()
  return async () => {
    const file = await pickFile(ACCEPT_JSON)
    if (!file) return
    let data: unknown
    try {
      data = JSON.parse(await file.text())
    } catch {
      toast.show('El archivo no es un JSON válido')
      return
    }
    let backup
    try {
      backup = validateBackup(data)
    } catch (e) {
      toast.show((e as Error).message)
      return
    }
    const sum = backupSummary(backup)
    const when = sum.exportedAt ? new Date(sum.exportedAt).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' }) : 'fecha desconocida'
    const empty = sum.accounts === 0 && sum.transactions === 0
    const ok = await toast.confirm({
      title: empty ? 'Esta copia está vacía' : 'Restaurar copia de seguridad',
      message: `«${file.name}» (${when}) trae ${sum.accounts} cuentas y ${sum.transactions} movimientos. Se sustituirán TODOS los datos actuales por los de la copia. Podrás deshacerlo desde Ajustes → Deshacer lo último.`,
      confirmLabel: empty ? 'Restaurar igualmente' : 'Restaurar',
      danger: true,
    })
    if (!ok) return
    try {
      await createRestorePoint('Antes de restaurar una copia')
      const res = await restoreBackup(data)
      toast.show(`Copia restaurada · ${res.transactions} movimientos`)
    } catch (e) {
      toast.show((e as Error).message || 'No se ha podido restaurar la copia')
    }
  }
}
