import type { Category, Transaction } from '../db/types'
import { prettyMerchant } from '../lib/text'

export function categoryLabel(cat: Category | undefined | null, byId: Map<string, Category>): string {
  if (!cat) return 'Sin categoría'
  const parent = cat.parentId ? byId.get(cat.parentId) : undefined
  return parent ? `${parent.name} · ${cat.name}` : cat.name
}

/** Nombre legible del movimiento: los conceptos del banco se limpian ("COMPRA TARJ… MERCADONA" → "Mercadona") */
export function txTitle(tx: Transaction): string {
  if (tx.source === 'extracto' && tx.description === tx.bankDescription) {
    const pretty = prettyMerchant(tx.description)
    return pretty.length >= 3 ? pretty : tx.description
  }
  return tx.description
}

export const KIND_LABEL: Record<Transaction['kind'], string> = {
  gasto: 'Gasto',
  ingreso: 'Ingreso',
  transferencia: 'Transferencia',
  aportacion: 'Aportación a inversión',
}
