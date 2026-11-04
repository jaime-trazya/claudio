import type { Transaction } from '../db/types'
import { CategoryTile, Money } from './components'
import { useData } from './useData'
import { categoryLabel, txTitle } from './format'
import { useEditor } from './editor'
import { ArrowLeftRight, Split } from 'lucide-react'

export function TxRow({ tx, showAccount = true }: { tx: Transaction; showAccount?: boolean }) {
  const { categoryById, accountById } = useData()
  const { openTx } = useEditor()
  const cat = tx.categoryId ? categoryById.get(tx.categoryId) : undefined
  const account = accountById.get(tx.accountId)
  const isTransfer = tx.kind === 'transferencia' || (tx.kind === 'aportacion' && tx.transferId)
  const second = [
    tx.splits?.length ? `Dividido en ${tx.splits.length}` : isTransfer ? 'Transferencia' : tx.kind === 'aportacion' ? 'Aportación' : categoryLabel(cat, categoryById),
    tx.excluded ? 'No cuenta' : null,
    showAccount && account ? account.name : null,
  ]
    .filter(Boolean)
    .join(' · ')
  return (
    <button className="list-item" onClick={() => openTx(tx)}>
      {isTransfer ? (
        <span className="tile none" aria-hidden>
          <ArrowLeftRight size={18} />
        </span>
      ) : tx.splits?.length ? (
        <span className="tile none" aria-hidden>
          <Split size={18} />
        </span>
      ) : (
        <CategoryTile category={cat} />
      )}
      <div className="grow">
        <div className="primary-line ellipsis">{txTitle(tx)}</div>
        <div className="secondary-line ellipsis">{second}</div>
      </div>
      <div className="trail">
        <Money cents={tx.amount} sign={tx.kind === 'ingreso'} plain={tx.kind !== 'ingreso'} />
        {tx.status === 'pendiente' && (
          <div style={{ marginTop: 3 }}>
            <span className="pill warn">Pendiente</span>
          </div>
        )}
      </div>
    </button>
  )
}
