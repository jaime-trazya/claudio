import fs from 'node:fs'
import path from 'node:path'
import type { Account, Transaction } from '../db/types'

export const EJEMPLOS = path.resolve(__dirname, '../../ejemplos')

export function sample(name: string): ArrayBuffer {
  const buf = fs.readFileSync(path.join(EJEMPLOS, name))
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer
}

let n = 0
export function tx(p: Partial<Transaction> & Pick<Transaction, 'date' | 'amount'>): Transaction {
  n++
  return {
    id: p.id ?? `t${n}`,
    accountId: 'a1',
    description: 'Movimiento',
    categoryId: null,
    kind: p.amount < 0 ? 'gasto' : 'ingreso',
    status: 'confirmado',
    source: 'manual',
    tags: [],
    createdAt: n,
    updatedAt: n,
    ...p,
  }
}

export function account(p: Partial<Account> & Pick<Account, 'id'>): Account {
  return { name: p.id, type: 'banco', initialBalance: 0, color: '#1d5fd6', order: 0, createdAt: 0, ...p }
}
