import { createContext, useContext } from 'react'
import type { Transaction } from '../db/types'

export interface EditorApi {
  /** Abre el editor: sin argumento crea un movimiento nuevo */
  openTx(tx?: Transaction, defaults?: Partial<Transaction>): void
  openAccount(id?: string): void
}

export const EditorCtx = createContext<EditorApi | null>(null)

export function useEditor(): EditorApi {
  const v = useContext(EditorCtx)
  if (!v) throw new Error('useEditor fuera de App')
  return v
}
