import { db } from './db'
import type { Account, ImportTemplate, Rule, Snapshot, Transaction, TxKind } from './types'
import { categorize, effectiveRules, ruleMatches } from '../domain/categorize'
import { dupKey, type PlanRow } from '../import/reconcile'
import type { ShortcutPayment } from '../import/shortcut'
import { accountForCard } from '../import/shortcut'
import type { TRStatement } from '../import/tradeRepublic'
import { normalize, uid } from '../lib/text'
import { bankOrder } from '../domain/stats'
import { getSettings, setSetting } from './settings'
import { todayISO } from '../lib/dates'
import { reseed } from './db'
import { createRestorePoint } from './history'

const now = () => Date.now()

export function newTransaction(p: Partial<Transaction> & Pick<Transaction, 'accountId' | 'date' | 'amount' | 'description'>): Transaction {
  const t = now()
  return {
    id: uid(),
    categoryId: null,
    kind: p.amount < 0 ? 'gasto' : 'ingreso',
    status: 'confirmado',
    source: 'manual',
    tags: [],
    createdAt: t,
    updatedAt: t,
    ...p,
  }
}

export async function saveTransaction(tx: Transaction) {
  await db.transactions.put({ ...tx, updatedAt: now() })
}

/** Borra un movimiento (y la otra pata si es una transferencia) */
export async function deleteTransaction(tx: Transaction) {
  await db.transaction('rw', db.transactions, async () => {
    if (tx.transferId) await db.transactions.where('transferId').equals(tx.transferId).delete()
    else await db.transactions.delete(tx.id)
  })
}

/** Transferencia entre cuentas: dos movimientos enlazados que no cuentan como gasto ni ingreso */
export async function createTransfer(p: { from: Account; to: Account; amount: number; date: string; description?: string; notes?: string }) {
  const transferId = uid()
  const kind: TxKind = p.to.type === 'inversion' ? 'aportacion' : 'transferencia'
  const desc = p.description?.trim() || `Transferencia ${p.from.name} → ${p.to.name}`
  const categoryId = kind === 'aportacion' ? 'cat-inversion' : 'cat-transferencia'
  const amount = Math.abs(p.amount)
  await db.transactions.bulkAdd([
    newTransaction({ accountId: p.from.id, date: p.date, amount: -amount, description: desc, kind, categoryId, transferId, notes: p.notes }),
    newTransaction({ accountId: p.to.id, date: p.date, amount, description: desc, kind, categoryId, transferId, notes: p.notes }),
  ])
}

/**
 * "Aplicar siempre a este concepto": crea (o actualiza) una regla del usuario y
 * recategoriza los movimientos anteriores que encajan. Devuelve cuántos cambió.
 */
export async function applyRuleEverywhere(keyword: string, categoryId: string, kind?: TxKind, savePoint = true): Promise<number> {
  const kw = normalize(keyword)
  if (!kw) return 0
  if (savePoint) await createRestorePoint(`Antes de la regla «${kw}»`)
  const existing = await db.rules.filter((r) => r.custom && normalize(r.keyword) === kw).first()
  const rule: Rule = existing
    ? { ...existing, categoryId, kind }
    : { id: uid(), keyword: kw, categoryId, kind, custom: true, createdAt: now() }
  await db.rules.put(rule)
  let changed = 0
  await db.transaction('rw', db.transactions, async () => {
    await db.transactions
      .filter((t) => !t.splits?.length && !t.transferId && ruleMatches(rule, t.description) && t.categoryId !== categoryId)
      .modify((t) => {
        t.categoryId = categoryId
        if (kind) t.kind = kind
        t.updatedAt = now()
        changed++
      })
  })
  return changed
}

/** Vuelve a aplicar todas las reglas a los movimientos sin categoría */
export async function recategorizeUncategorized(): Promise<number> {
  const rules = effectiveRules(await db.rules.toArray(), (await getSettings()).ownerName)
  let changed = 0
  await db.transactions
    .filter((t) => !t.categoryId && !t.transferId && !t.splits?.length)
    .modify((t) => {
      const c = categorize(t.description, t.amount, rules, true)
      if (c.categoryId) {
        t.categoryId = c.categoryId
        if (c.kind === 'aportacion') t.kind = 'aportacion'
        changed++
      }
    })
  return changed
}

export interface StatementImportInput {
  rows: PlanRow[]
  accountId: string
  fileName: string
  /** Categoría elegida a mano en la vista previa (por índice de fila) */
  categoryOverrides?: Record<number, string | null>
  /** Saldo del banco al final del extracto: si se indica, se ajusta el saldo inicial para cuadrar */
  bankBalance?: { date: string; balance: number } | null
  fingerprint?: string
  /** false si ya se guardó un punto de restauración antes (importación de varias tablas) */
  savePoint?: boolean
}

/** Guarda el extracto según la vista previa: crea los nuevos y concilia los emparejados */
export async function applyStatementImport({ rows, accountId, fileName, categoryOverrides = {}, bankBalance, fingerprint, savePoint = true }: StatementImportInput) {
  if (savePoint) await createRestorePoint(`Antes de importar «${fileName}»`)
  const rules = effectiveRules(await db.rules.toArray(), (await getSettings()).ownerName)
  const importId = uid()
  let added = 0
  let reconciled = 0
  let skipped = 0
  // Orden del banco para usar sus saldos (ver accountBalance)
  const order = bankOrder(rows.map((r) => r.movement.date))
  const seqBase = Math.floor(Date.now() / 1000) * 100000
  const bankFields = (i: number) =>
    rows[i].movement.balance !== undefined ? { bankBalance: rows[i].movement.balance, bankEffDate: order[i].effDate, bankSeq: seqBase + order[i].seq } : {}
  await db.transaction('rw', db.transactions, db.imports, async () => {
    for (const [i, r] of rows.entries()) {
      if (!r.include) {
        skipped++
        continue
      }
      const mv = r.movement
      const auto = categorize(mv.description, mv.amount, rules, true)
      const override = categoryOverrides[i]
      const key = dupKey(accountId, mv.date, mv.amount, mv.description)
      if (r.matchId && (r.status === 'conciliar' || r.status === 'dudoso')) {
        const existing = await db.transactions.get(r.matchId)
        if (existing) {
          await db.transactions.put({
            ...existing,
            accountId,
            date: mv.date,
            status: 'confirmado',
            bankDate: mv.date,
            bankDescription: mv.description,
            dupKey: key,
            ...bankFields(i),
            categoryId: override !== undefined ? override : (existing.categoryId ?? auto.categoryId),
            kind: existing.kind === 'gasto' || existing.kind === 'ingreso' ? (auto.kind === 'aportacion' ? 'aportacion' : existing.kind) : existing.kind,
            importId,
            updatedAt: now(),
          })
          reconciled++
          continue
        }
      }
      await db.transactions.add(
        newTransaction({
          accountId,
          date: mv.date,
          amount: mv.amount,
          description: mv.description,
          categoryId: override !== undefined ? override : auto.categoryId,
          kind: auto.kind,
          source: 'extracto',
          status: 'confirmado',
          bankDate: mv.date,
          bankDescription: mv.description,
          dupKey: key,
          importId,
          ...bankFields(i),
        }),
      )
      added++
    }
    await db.imports.add({ id: importId, type: 'extracto', fileName, accountId, added, reconciled, skipped, fingerprint, createdAt: now() })
  })
  const adjusted = bankBalance ? await matchBankBalance(accountId, bankBalance) : 0
  return { added, reconciled, skipped, adjusted }
}

/**
 * Ajusta el saldo inicial de la cuenta para que el saldo de la app en esa fecha sea el del banco.
 * Así el saldo es correcto aunque el extracto no empiece el día que se abrió la cuenta.
 * Devuelve el ajuste aplicado (céntimos).
 */
export async function matchBankBalance(accountId: string, bank: { date: string; balance: number }): Promise<number> {
  const account = await db.accounts.get(accountId)
  if (!account) return 0
  const txs = await db.transactions.where('accountId').equals(accountId).toArray()
  const computed = account.initialBalance + txs.filter((t) => t.date <= bank.date).reduce((s, t) => s + t.amount, 0)
  const diff = bank.balance - computed
  if (diff !== 0) await db.accounts.update(accountId, { initialBalance: account.initialBalance + diff })
  return diff
}

/** Importa los pagos nuevos del Atajo como pendientes de confirmar */
export async function importShortcutPayments(payments: ShortcutPayment[], accounts: Account[], fallbackAccountId: string | null, fileName: string) {
  await createRestorePoint('Antes de importar pagos del Atajo')
  const rules = effectiveRules(await db.rules.toArray(), (await getSettings()).ownerName)
  const known = new Set((await db.transactions.where('source').equals('atajo').toArray()).map((t) => t.externalId).filter(Boolean) as string[])
  const fresh = payments.filter((p) => !known.has(p.externalId))
  const usable = accounts.filter((a) => a.type !== 'inversion' && !a.archived)
  const toAdd: Transaction[] = []
  for (const p of fresh) {
    const accountId = accountForCard(p.card, usable, fallbackAccountId)
    if (!accountId) continue
    const c = categorize(p.merchant, p.amount, rules, true)
    toAdd.push(
      newTransaction({
        accountId,
        date: p.date,
        amount: p.amount,
        description: p.merchant,
        categoryId: c.categoryId,
        kind: c.kind,
        status: 'pendiente',
        source: 'atajo',
        externalId: p.externalId,
        notes: p.card ? `Apple Pay · ${p.card}` : 'Apple Pay',
      }),
    )
  }
  await db.transaction('rw', db.transactions, db.imports, async () => {
    if (toAdd.length) await db.transactions.bulkAdd(toAdd)
    await db.imports.add({ id: uid(), type: 'atajo', fileName, added: toAdd.length, reconciled: 0, skipped: payments.length - toAdd.length, createdAt: now() })
  })
  return { added: toAdd.length, skipped: payments.length - toAdd.length }
}

export async function confirmTransactions(ids: string[]) {
  await db.transactions.where('id').anyOf(ids).modify({ status: 'confirmado', updatedAt: now() })
}

export async function saveTemplate(t: Omit<ImportTemplate, 'id' | 'createdAt'> & { id?: string }) {
  const existing = await db.templates.where('signature').equals(t.signature).first()
  await db.templates.put({ ...t, id: existing?.id ?? t.id ?? uid(), createdAt: existing?.createdAt ?? now() })
}

export type SnapshotResult = { saved: true; snapshot: Snapshot } | { saved: false; reason: 'duplicado'; snapshot: Snapshot }

/** Guarda la foto de la cartera. Si el mismo extracto ya estaba, no lo duplica. */
export async function saveSnapshot(accountId: string, st: Pick<TRStatement, 'date' | 'positions' | 'cash' | 'total' | 'fingerprint'>, source: 'pdf' | 'manual'): Promise<SnapshotResult> {
  const dup = await db.snapshots.where('fingerprint').equals(st.fingerprint).filter((s) => s.accountId === accountId).first()
  if (dup) return { saved: false, reason: 'duplicado', snapshot: dup }
  const snapshot: Snapshot = {
    id: uid(),
    accountId,
    date: st.date ?? todayISO(),
    positions: st.positions,
    cash: st.cash,
    total: st.total,
    source,
    fingerprint: st.fingerprint,
    createdAt: now(),
  }
  await db.transaction('rw', db.snapshots, db.imports, db.settings, async () => {
    await db.snapshots.add(snapshot)
    await db.imports.add({ id: uid(), type: 'tradeRepublic', fileName: source === 'pdf' ? 'Extracto del patrimonio neto' : 'Valor manual', accountId, added: 1, reconciled: 0, skipped: 0, createdAt: now() })
    await setSetting('lastTRImportAt', now())
  })
  return { saved: true, snapshot }
}

export async function deleteAccount(id: string) {
  await createRestorePoint(`Antes de borrar la cuenta «${(await db.accounts.get(id))?.name ?? ''}»`)
  await db.transaction('rw', db.accounts, db.transactions, db.snapshots, async () => {
    await db.transactions.where('accountId').equals(id).delete()
    await db.snapshots.where('accountId').equals(id).delete()
    await db.accounts.delete(id)
  })
}

/** Borra la categoría: sus movimientos y subcategorías pasan a la categoría padre (o sin categoría) */
export async function deleteCategory(id: string) {
  const cat = await db.categories.get(id)
  if (!cat) return
  await createRestorePoint(`Antes de borrar la categoría «${cat.name}»`)
  const target = cat.parentId
  await db.transaction('rw', db.categories, db.transactions, db.rules, db.budgets, async () => {
    const children = await db.categories.where('parentId').equals(id).toArray()
    for (const ch of children) await db.categories.update(ch.id, { parentId: null })
    await db.transactions.where('categoryId').equals(id).modify({ categoryId: target })
    await db.transactions.filter((t) => !!t.splits?.some((s) => s.categoryId === id)).modify((t) => {
      t.splits = t.splits!.map((s) => (s.categoryId === id ? { ...s, categoryId: target } : s))
    })
    await db.rules.where('categoryId').equals(id).delete()
    await db.budgets.where('categoryId').equals(id).delete()
    await db.categories.delete(id)
  })
}

/**
 * Borra todos los datos y deja la app como recién instalada.
 * Con keepHistory (por defecto) guarda antes un punto para poder deshacerlo; si no, borra también el historial.
 */
export async function wipeAll(keepHistory = true) {
  if (keepHistory) await createRestorePoint('Antes de borrar todos los datos')
  await db.transaction('rw', db.tables, async () => {
    for (const t of db.tables) if (keepHistory ? t.name !== 'restorePoints' : true) await t.clear()
  })
  await reseed()
}

export const RULES_FILE_TYPE = 'claudio-reglas'

export interface RulesFile {
  type: typeof RULES_FILE_TYPE
  version: 1 | 2
  rules: { keyword: string; categoryId: string; kind?: TxKind }[]
  /** v2 (perfil): presupuestos mensuales y ajustes personales opcionales */
  budgets?: { categoryId: string; amount: number }[]
  settings?: { ownerName?: string }
}

/** Exporta tus reglas (las creadas por ti) para guardarlas o pasarlas a otro dispositivo */
export async function exportRules(): Promise<RulesFile> {
  const rules = await db.rules.filter((r) => r.custom).toArray()
  return { type: RULES_FILE_TYPE, version: 1, rules: rules.map((r) => ({ keyword: r.keyword, categoryId: r.categoryId, ...(r.kind ? { kind: r.kind } : {}) })) }
}

/**
 * Importa reglas de un archivo: las añade como tuyas y recategoriza los movimientos que encajan.
 * Se saltan las que apuntan a categorías que no existen.
 */
export async function importRules(data: unknown): Promise<{ added: number; skipped: number; changed: number; budgets: number }> {
  const file = data as Partial<RulesFile>
  if (!file || file.type !== RULES_FILE_TYPE || !Array.isArray(file.rules)) throw new Error('El archivo no es un archivo de reglas de esta app.')
  const cats = new Set(await db.categories.toCollection().primaryKeys())
  await createRestorePoint('Antes de importar reglas o perfil')
  let added = 0
  let skipped = 0
  let changed = 0
  for (const r of file.rules) {
    if (!r || typeof r.keyword !== 'string' || typeof r.categoryId !== 'string' || !cats.has(r.categoryId)) {
      skipped++
      continue
    }
    const kind = r.kind === 'aportacion' || r.kind === 'transferencia' || r.kind === 'ingreso' || r.kind === 'gasto' ? r.kind : undefined
    changed += await applyRuleEverywhere(r.keyword, r.categoryId, kind === 'aportacion' || kind === 'transferencia' ? kind : undefined, false)
    added++
  }
  // Perfil: presupuestos (solo para categorías que aún no tienen) y tu nombre (si no lo habías puesto)
  let budgets = 0
  for (const b of file.budgets ?? []) {
    if (!b || typeof b.categoryId !== 'string' || !cats.has(b.categoryId) || !(b.amount > 0)) continue
    if (await db.budgets.where('categoryId').equals(b.categoryId).count()) continue
    await db.budgets.add({ id: uid(), categoryId: b.categoryId, amount: Math.round(b.amount) })
    budgets++
  }
  const owner = file.settings?.ownerName?.trim()
  if (owner && !(await getSettings()).ownerName) await setSetting('ownerName', owner)
  return { added, skipped, changed, budgets }
}

/** Traspasos hacia o desde una cuenta de ahorro ("To/From Cuenta Remunerada", "A EUR Cuenta Remunerada") */
export const SAVINGS_TRANSFER = /cuenta remunerada|cuenta de ahorro|\bahorros?\b|savings|hucha|pocket|vault/i

/**
 * Crea en la cuenta de destino la otra pata de los traspasos de la cuenta de origen
 * (p. ej. los envíos a la Cuenta Remunerada de Revolut) y los enlaza. No duplica si ya existen.
 */
export async function mirrorTransfers(fromId: string, toId: string, pattern: RegExp = SAVINGS_TRANSFER): Promise<number> {
  const from = await db.transactions.where('accountId').equals(fromId).toArray()
  const existing = new Set((await db.transactions.where('accountId').equals(toId).toArray()).map((t) => t.externalId).filter(Boolean))
  const legs: Transaction[] = []
  const updates: Transaction[] = []
  for (const t of from) {
    if (!pattern.test(t.bankDescription ?? t.description)) continue
    const ext = `espejo-${t.id}`
    if (existing.has(ext)) continue
    const transferId = t.transferId ?? uid()
    legs.push(newTransaction({ accountId: toId, date: t.date, amount: -t.amount, description: t.description, kind: 'transferencia', categoryId: 'cat-transferencia', transferId, externalId: ext, source: 'extracto' }))
    updates.push({ ...t, kind: 'transferencia', categoryId: 'cat-transferencia', transferId, updatedAt: now() })
  }
  await db.transaction('rw', db.transactions, async () => {
    if (legs.length) await db.transactions.bulkAdd(legs)
    if (updates.length) await db.transactions.bulkPut(updates)
  })
  return legs.length
}

/**
 * "Corregir saldo": crea un ajuste para que el saldo de la cuenta sea el real.
 * Cuenta como traspaso: no altera ingresos ni gastos.
 */
export async function correctBalance(account: Account, current: number, real: number, date: string): Promise<number> {
  const diff = real - current
  if (!diff) return 0
  await createRestorePoint(`Antes de corregir el saldo de «${account.name}»`)
  await db.transactions.add(
    newTransaction({ accountId: account.id, date, amount: diff, description: 'Ajuste de saldo', kind: 'transferencia', categoryId: 'cat-transferencia', externalId: `ajuste-${uid()}`, notes: 'Corrección manual para que coincida con el saldo real' }),
  )
  return diff
}

/**
 * Cuenta de inversión para el extracto de patrimonio: la de Trade Republic (o la primera de inversión).
 * Si no hay ninguna, crea «Trade Republic · inversión», enlazada a «Trade Republic · efectivo» si existe.
 */
export async function ensureInvestmentAccount(accounts: Account[]): Promise<Account> {
  const inv = accounts.filter((a) => a.type === 'inversion' && !a.archived)
  const found = inv.find((a) => a.bank === 'traderepublic') ?? inv[0]
  if (found) return found
  const cash = accounts.find((a) => a.bank === 'traderepublic' && a.type !== 'inversion')
  const acc: Account = {
    id: uid(),
    name: 'Trade Republic · inversión',
    type: 'inversion',
    bank: 'traderepublic',
    initialBalance: 0,
    color: '#000000',
    cashAccountId: cash?.id,
    order: accounts.length,
    createdAt: now(),
  }
  await db.accounts.add(acc)
  return acc
}
