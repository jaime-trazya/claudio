import { db, type FinanzasDB } from './db'
import { createBackup, restoreBackup } from './backup'
import { hash, uid } from '../lib/text'
import { todayISO } from '../lib/dates'

/**
 * Historial para deshacer: puntos de restauración guardados en el propio dispositivo.
 * - "accion": antes de importar, aplicar reglas, borrar…
 * - "diaria": una foto al día (al abrir la app), para "volver a como estaba hace X días".
 * Se guardan comprimidos (gzip) cuando el navegador lo permite. No entran en la copia de seguridad.
 */
export interface RestorePoint {
  id: string
  createdAt: number
  day: string
  kind: 'accion' | 'diaria'
  label: string
  data: ArrayBuffer | string
  compressed: boolean
  size: number
  transactions: number
  /** Huella de los datos para no guardar dos fotos diarias iguales */
  signature: string
}

const KEEP = { accion: 25, diaria: 30 }

async function gzip(text: string): Promise<ArrayBuffer | null> {
  if (typeof CompressionStream === 'undefined') return null
  try {
    const stream = new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'))
    return await new Response(stream).arrayBuffer()
  } catch {
    return null
  }
}

async function gunzip(data: ArrayBuffer): Promise<string> {
  const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream('gzip'))
  return await new Response(stream).text()
}

/**
 * Huella de todos los datos: contenido completo de las tablas pequeñas (cuentas, categorías, reglas,
 * presupuestos, objetivos, ajustes, plantillas, fotos de inversión) y, para los movimientos, número,
 * fechas de cambio e ids. Detecta cualquier cambio, también el nombre o el saldo inicial de una cuenta.
 */
async function signatureOf(database: FinanzasDB): Promise<string> {
  const [accounts, categories, rules, budgets, goals, settings, templates, snapshots, txs] = await Promise.all([
    database.accounts.toArray(),
    database.categories.toArray(),
    database.rules.toArray(),
    database.budgets.toArray(),
    database.goals.toArray(),
    database.settings.toArray(),
    database.templates.toArray(),
    database.snapshots.toArray(),
    database.transactions.toArray(),
  ])
  const small = JSON.stringify([accounts, categories, rules, budgets, goals, settings.filter((s) => s.key !== 'lastBackupAt'), templates, snapshots.map((s) => [s.id, s.total, s.date])])
  let txPart = String(txs.length)
  for (const t of txs) txPart += `|${t.id}:${t.updatedAt}`
  return `${hash(small)}-${hash(txPart)}`
}

export async function createRestorePoint(label: string, kind: RestorePoint['kind'] = 'accion', database: FinanzasDB = db): Promise<string | null> {
  const transactions = await database.transactions.count()
  const accounts = await database.accounts.count()
  if (!transactions && !accounts) return null // nada que guardar
  const json = JSON.stringify(await createBackup(database))
  const packed = await gzip(json)
  const point: RestorePoint = {
    id: uid(),
    createdAt: Date.now(),
    day: todayISO(),
    kind,
    label,
    data: packed ?? json,
    compressed: !!packed,
    size: packed ? packed.byteLength : json.length,
    transactions,
    signature: await signatureOf(database),
  }
  await database.restorePoints.add(point)
  // Borra los más antiguos de cada tipo
  const all = await database.restorePoints.where('kind').equals(kind).sortBy('createdAt')
  const extra = all.length - KEEP[kind]
  if (extra > 0) await database.restorePoints.bulkDelete(all.slice(0, extra).map((p) => p.id))
  return point.id
}

/** Una foto al día como mucho, y solo si los datos han cambiado desde la anterior */
export async function dailyRestorePoint(database: FinanzasDB = db): Promise<boolean> {
  const today = todayISO()
  const last = (await database.restorePoints.where('kind').equals('diaria').sortBy('createdAt')).pop()
  if (last?.day === today) return false
  if (last && last.signature === (await signatureOf(database))) return false
  return !!(await createRestorePoint('Copia automática del día', 'diaria', database))
}

export async function listRestorePoints(database: FinanzasDB = db): Promise<Omit<RestorePoint, 'data'>[]> {
  const all = await database.restorePoints.orderBy('createdAt').reverse().toArray()
  return all.map(({ data: _data, ...rest }) => rest)
}

const REDO_PREFIX = 'Antes de deshacer: '

/**
 * Los puntos «Antes de deshacer…» sirven para rehacer desde el historial, pero no son una acción que
 * deshacer: si «Deshacer lo último» los tomara, pulsarlo dos veces rehacía en vez de retroceder dos pasos.
 */
export const isRedoPoint = (p: Pick<RestorePoint, 'label'>) => p.label.startsWith(REDO_PREFIX)

/** Vuelve a un punto. Antes guarda el estado actual, para poder rehacer si te equivocas. */
export async function restorePoint(id: string, database: FinanzasDB = db): Promise<void> {
  const p = await database.restorePoints.get(id)
  if (!p) throw new Error('Ese punto de restauración ya no existe')
  const json = p.compressed ? await gunzip(p.data as ArrayBuffer) : (p.data as string)
  await createRestorePoint(`${REDO_PREFIX}${p.kind === 'diaria' ? 'volver a una foto diaria' : p.label.replace(/^Antes de (deshacer: )?/, '')}`, 'accion', database)
  await restoreBackup(JSON.parse(json), database)
}

/** Deshace la última acción: vuelve al punto guardado justo antes */
export async function undoLast(database: FinanzasDB = db): Promise<string | null> {
  const last = (await database.restorePoints.where('kind').equals('accion').sortBy('createdAt')).filter((p) => !isRedoPoint(p)).pop()
  if (!last) return null
  await restorePoint(last.id, database)
  // El punto "Antes de volver…" que acaba de crearse sirve para rehacer; el deshecho ya no hace falta
  await database.restorePoints.delete(last.id)
  return last.label
}

export async function clearHistory(database: FinanzasDB = db) {
  await database.restorePoints.clear()
}
