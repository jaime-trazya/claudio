import type { Account } from '../db/types'
import { useData } from './useData'
import { Money } from './components'
import { BankBadge } from './BankBadge'
import { navigate } from './router'
import { accountBalance, groupByBank, lastStatementDate } from '../domain/stats'
import { bankById } from '../domain/banks'
import { formatShortDate } from '../lib/dates'

const TYPE_LABEL: Record<Account['type'], string> = { banco: 'Banco', tarjeta: 'Tarjeta', efectivo: 'Efectivo', inversion: 'Inversión' }

/** Nombre corto dentro de su banco: "Revolut · Cuenta remunerada" → "Cuenta remunerada"; "Revolut" → "Cuenta principal" */
function shortName(a: Account, bankName?: string): string {
  if (!bankName) return a.name
  if (a.name.trim().toLowerCase() === bankName.toLowerCase()) return 'Cuenta principal'
  return a.name.replace(new RegExp(`^${bankName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*[·\\-–:]\\s*`, 'i'), '') || a.name
}

/** Lista de cuentas: las de un mismo banco van juntas con su total */
export function AccountList({ accounts, compact = false }: { accounts: Account[]; compact?: boolean }) {
  const { transactions } = useData()
  const groups = groupByBank(accounts)
  return (
    <section className="card flush list">
      {groups.map((g) => {
        const bank = bankById(g.bank ?? undefined)
        if (g.accounts.length < 2 || !bank) {
          return g.accounts.map((a) => <Row key={a.id} a={a} compact={compact} />)
        }
        const total = g.accounts.reduce((s, a) => s + accountBalance(a, transactions), 0)
        return (
          <div key={g.bank} style={{ borderTop: '1px solid var(--rule)' }}>
            <div className="list-item" style={{ borderTop: 0, minHeight: 56 }}>
              <BankBadge bank={bank.id} size={compact ? 34 : 36} />
              <div className="grow">
                <div className="primary-line">{bank.name}</div>
                <div className="secondary-line">Total de {g.accounts.length} cuentas</div>
              </div>
              <Money cents={total} plain className="mid" />
            </div>
            {g.accounts.map((a) => (
              <Row key={a.id} a={a} compact={compact} nested label={shortName(a, bank.name)} />
            ))}
          </div>
        )
      })}
    </section>
  )
}

function Row({ a, nested, label, compact: c }: { a: Account; nested?: boolean; label?: string; compact?: boolean }) {
  const { transactions } = useData()
  const date = lastStatementDate(a, transactions)
    return (
      <button className="list-item" style={nested ? { paddingLeft: 'calc(var(--pad) + 48px)', minHeight: 52, borderTop: '1px dashed var(--rule)' } : undefined} onClick={() => navigate(`/movimientos?cuenta=${a.id}`)}>
        {!nested && <BankBadge account={a} size={c ? 34 : 36} />}
        <div className="grow">
          <div className="primary-line ellipsis">{label ?? a.name}</div>
          <div className="secondary-line ellipsis">{date ? `Según el extracto del ${formatShortDate(date)}` : TYPE_LABEL[a.type]}</div>
        </div>
        <Money cents={accountBalance(a, transactions)} plain />
      </button>
    )
  }
