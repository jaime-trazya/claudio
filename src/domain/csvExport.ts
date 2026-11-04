import type { Account, Category, Transaction } from '../db/types'
import { formatDMY } from '../lib/dates'

const KIND: Record<Transaction['kind'], string> = { gasto: 'Gasto', ingreso: 'Ingreso', transferencia: 'Transferencia', aportacion: 'Aportación' }

const esc = (v: string) => (/[";\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)
const num = (cents: number) => (cents / 100).toFixed(2).replace('.', ',')

/** CSV con ";" y coma decimal, listo para abrir en Numbers o Excel en español */
export function transactionsToCSV(txs: Transaction[], accounts: Account[], categories: Category[]): string {
  const acc = new Map(accounts.map((a) => [a.id, a.name]))
  const cat = new Map(categories.map((c) => [c.id, c]))
  const catName = (id: string | null) => {
    if (!id) return ''
    const c = cat.get(id)
    if (!c) return ''
    const parent = c.parentId ? cat.get(c.parentId) : undefined
    return parent ? `${parent.name} › ${c.name}` : c.name
  }
  const header = ['Fecha', 'Cuenta', 'Concepto', 'Importe', 'Categoría', 'Tipo', 'Estado', 'Notas', 'Etiquetas', 'Concepto del banco']
  const lines = [header.join(';')]
  const sorted = [...txs].sort((a, b) => a.date.localeCompare(b.date) || a.createdAt - b.createdAt)
  for (const t of sorted) {
    const rows = t.splits?.length ? t.splits.map((s) => ({ amount: s.amount, categoryId: s.categoryId })) : [{ amount: t.amount, categoryId: t.categoryId }]
    for (const r of rows) {
      lines.push(
        [
          formatDMY(t.date),
          acc.get(t.accountId) ?? '',
          t.description,
          num(r.amount),
          catName(r.categoryId),
          KIND[t.kind] + (t.excluded ? ' (no cuenta)' : ''),
          t.status === 'pendiente' ? 'Pendiente' : 'Confirmado',
          t.notes ?? '',
          t.tags.join(', '),
          t.bankDescription ?? '',
        ]
          .map((v) => esc(String(v)))
          .join(';'),
      )
    }
  }
  return '﻿' + lines.join('\r\n') + '\r\n'
}
