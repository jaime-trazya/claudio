import type { Rule, TxKind } from '../db/types'
import { normalize } from '../lib/text'

export interface CategorizeResult {
  categoryId: string | null
  kind: TxKind
  ruleId?: string
}

const padded = (s: string) => ` ${normalize(s)} `
const kwCache = new Map<string, string>()
const normKw = (k: string) => {
  let v = kwCache.get(k)
  if (v === undefined) {
    v = normalize(k)
    kwCache.set(k, v)
  }
  return v
}

/**
 * Categoría equivalente según el signo: un Bizum que entra es "Bizum recibido",
 * una transferencia que sale es "Transferencias enviadas".
 */
const COUNTERPART: Record<string, { positive?: string; negative?: string }> = {
  'cat-bizum': { positive: 'cat-bizum-recibido' },
  'cat-bizum-recibido': { negative: 'cat-bizum' },
  'cat-transf-recibidas': { negative: 'cat-transf-enviadas' },
  'cat-transf-enviadas': { positive: 'cat-transf-recibidas' },
}

export function signedCategory(categoryId: string, amount: number): string {
  const c = COUNTERPART[categoryId]
  if (!c) return categoryId
  return (amount >= 0 ? c.positive : c.negative) ?? categoryId
}

/**
 * Ordena reglas: primero las del usuario; después las que marcan el tipo (aportación, traspaso,
 * ingreso), para que "Transferencia a Trade Republic" sea aportación y no un envío; y por último
 * las más específicas (más largas).
 */
export function sortRules(rules: Rule[]): Rule[] {
  return [...rules].sort((a, b) => {
    if (a.custom !== b.custom) return a.custom ? -1 : 1
    if (!!a.kind !== !!b.kind) return a.kind ? -1 : 1
    const la = normalize(a.keyword).length
    const lb = normalize(b.keyword).length
    if (la !== lb) return lb - la
    return b.createdAt - a.createdAt
  })
}

export function ruleMatches(rule: Rule, description: string, paddedDescription = padded(description)): boolean {
  const kw = normKw(rule.keyword)
  if (!kw) return false
  return paddedDescription.includes(` ${kw} `)
}

/**
 * Busca la primera regla que encaja con el concepto.
 * Las reglas deben llegar ya ordenadas con sortRules (se ordenan si no).
 */
export function categorize(description: string, amount: number, rules: Rule[], presorted = false): CategorizeResult {
  const list = presorted ? rules : sortRules(rules)
  const baseKind: TxKind = amount >= 0 ? 'ingreso' : 'gasto'
  const pd = padded(description)
  for (const rule of list) {
    if (ruleMatches(rule, description, pd)) {
      let kind: TxKind = baseKind
      if (rule.kind === 'aportacion' || rule.kind === 'transferencia') kind = rule.kind
      // Un ingreso con regla de gasto sigue siendo ingreso (p. ej. Bizum recibido) y viceversa
      return { categoryId: signedCategory(rule.categoryId, amount), kind, ruleId: rule.id }
    }
  }
  return { categoryId: null, kind: baseKind }
}

/**
 * Propone la palabra clave para "aplicar siempre a este concepto":
 * el comercio limpio del concepto (sin "compra tarjeta", números, etc.).
 */
export { merchantKey as suggestKeyword } from '../lib/text'

/**
 * Reglas virtuales a partir de tu nombre: "To Ana Ejemplo", "Outgoing transfer for Ana Ejemplo Prueba"
 * o "Ana Ejemplo Prueba" son traspasos a ti mismo. Usa nombre + primer apellido y el nombre completo.
 */
export function ownerRules(ownerName: string): Rule[] {
  const words = normalize(ownerName).split(' ').filter((w) => w.length > 1)
  if (words.length < 2) return []
  const keys = [...new Set([words.slice(0, 2).join(' '), words.join(' ')])]
  return keys.map((keyword) => ({ id: `owner-${keyword}`, keyword, categoryId: 'cat-transferencia', kind: 'transferencia' as const, custom: true, createdAt: 0 }))
}

/** Reglas guardadas + las de tu nombre, ya ordenadas por prioridad */
export function effectiveRules(rules: Rule[], ownerName = ''): Rule[] {
  return sortRules([...ownerRules(ownerName), ...rules])
}
