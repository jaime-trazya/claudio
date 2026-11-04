import { createBackup, backupFileName, restoreBackup } from '../db/backup'
import { setSetting } from '../db/settings'
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
    const ok = await toast.confirm({
      title: 'Restaurar copia de seguridad',
      message: `Se sustituirán TODOS los datos actuales por los de «${file.name}». Esta acción no se puede deshacer.`,
      confirmLabel: 'Restaurar',
      danger: true,
    })
    if (!ok) return
    try {
      const res = await restoreBackup(data)
      toast.show(`Copia restaurada · ${res.transactions} movimientos`)
    } catch (e) {
      toast.show((e as Error).message || 'No se ha podido restaurar la copia')
    }
  }
}
