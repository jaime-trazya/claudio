import type { Rule, TxKind } from '../db/types'
import { normalize } from '../lib/text'

export interface CategorizeResult {
  categoryId: string | null
  kind: TxKind
  ruleId?: string
}

const padded = (s: string) => ` ${normalize(s)} `

/** Ordena reglas: primero las del usuario, después las más específicas (más largas). */
export function sortRules(rules: Rule[]): Rule[] {
  return [...rules].sort((a, b) => {
    if (a.custom !== b.custom) return a.custom ? -1 : 1
    const la = normalize(a.keyword).length
    const lb = normalize(b.keyword).length
    if (la !== lb) return lb - la
    return b.createdAt - a.createdAt
  })
}

export function ruleMatches(rule: Rule, description: string): boolean {
  const kw = normalize(rule.keyword)
  if (!kw) return false
  return padded(description).includes(` ${kw} `)
}

/**
 * Busca la primera regla que encaja con el concepto.
 * Las reglas deben llegar ya ordenadas con sortRules (se ordenan si no).
 */
export function categorize(description: string, amount: number, rules: Rule[], presorted = false): CategorizeResult {
  const list = presorted ? rules : sortRules(rules)
  const baseKind: TxKind = amount >= 0 ? 'ingreso' : 'gasto'
  for (const rule of list) {
    if (ruleMatches(rule, description)) {
      let kind: TxKind = baseKind
      if (rule.kind === 'aportacion' || rule.kind === 'transferencia') kind = rule.kind
      return { categoryId: rule.categoryId, kind, ruleId: rule.id }
    }
  }
  return { categoryId: null, kind: baseKind }
}

/**
 * Propone la palabra clave para "aplicar siempre a este concepto":
 * el comercio limpio del concepto (sin "compra tarjeta", números, etc.).
 */
export { merchantKey as suggestKeyword } from '../lib/text'
