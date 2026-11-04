import { DEFAULT_SETTINGS, type Settings } from './types'
import { db, type FinanzasDB } from './db'

export async function getSettings(database: FinanzasDB = db): Promise<Settings> {
  const rows = await database.settings.toArray()
  const out: Record<string, unknown> = { ...DEFAULT_SETTINGS }
  for (const r of rows) if (r.key in DEFAULT_SETTINGS) out[r.key] = r.value
  return out as unknown as Settings
}

export async function setSetting<K extends keyof Settings>(key: K, value: Settings[K], database: FinanzasDB = db) {
  await database.settings.put({ key, value })
}
