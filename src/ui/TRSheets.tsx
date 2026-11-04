import { useState } from 'react'
import { TriangleAlert } from 'lucide-react'
import { useToast } from './toast'
import { Money, Notice, Sheet } from './components'
import { saveSnapshot } from '../db/actions'
import { formatNumber, parseAmount } from '../lib/money'
import { formatShortDate, todayISO } from '../lib/dates'
import { hash } from '../lib/text'
import type { TRStatement } from '../import/tradeRepublic'
import type { Account } from '../db/types'

export function TRPreview({ account, st, onClose }: { account: Account; st: TRStatement; onClose: () => void }) {
  const toast = useToast()
  return (
    <Sheet
      title="Extracto de Trade Republic"
      onClose={onClose}
      full
      footer={
        <button
          className="btn primary block"
          onClick={async () => {
            const res = await saveSnapshot(account.id, st, 'pdf')
            toast.show(res.saved ? 'Extracto guardado' : 'Este extracto ya estaba importado: no se ha duplicado')
            onClose()
          }}
        >
          Guardar foto de la cartera
        </button>
      }
    >
      {st.warnings.map((w) => (
        <Notice key={w} tone="warn" icon={<TriangleAlert size={20} />} title="Revisa los datos">
          {w}
        </Notice>
      ))}
      <div className="card">
        <div className="card-label">Total a {st.date ? formatShortDate(st.date) : 'fecha desconocida'}</div>
        <Money cents={st.total} plain className="big" />
      </div>
      <div className="card flush list">
        {st.positions.map((p, i) => (
          <div key={i} className="list-item">
            <div className="grow">
              <div className="primary-line ellipsis">{p.name}</div>
              <div className="secondary-line">
                {p.kind === 'cripto' ? `Cripto${p.symbol ? ` · ${p.symbol}` : ''}` : `${p.kind === 'etf' ? 'ETF' : 'Acción'}${p.isin ? ` · ${p.isin}` : ''}`} · {formatNumber(p.units)} uds. × {formatNumber(p.price, 4)} €
              </div>
            </div>
            <Money cents={p.value} plain />
          </div>
        ))}
        <div className="list-item">
          <span className="grow primary-line">Efectivo</span>
          <Money cents={st.cash} plain />
        </div>
      </div>
    </Sheet>
  )
}

export function ManualValue({ account, onClose }: { account: Account; onClose: () => void }) {
  const toast = useToast()
  const [date, setDate] = useState(todayISO())
  const [value, setValue] = useState('')
  const cents = parseAmount(value)
  return (
    <Sheet
      title="Valor de la cartera a mano"
      onClose={onClose}
      footer={
        <button
          className="btn primary block"
          disabled={cents === null || cents <= 0}
          onClick={async () => {
            const res = await saveSnapshot(account.id, { date, positions: [], cash: 0, total: cents!, fingerprint: hash(`manual|${account.id}|${date}|${cents}`) }, 'manual')
            toast.show(res.saved ? 'Valor guardado' : 'Ya había un valor igual para esa fecha')
            onClose()
          }}
        >
          Guardar
        </button>
      }
    >
      <p className="muted small">Si el PDF no se puede leer, copia el «Total» del extracto o de la app de Trade Republic.</p>
      <label className="field">
        <span>Fecha del extracto</span>
        <input className="input" type="date" value={date} max={todayISO()} onChange={(e) => setDate(e.target.value)} />
      </label>
      <label className="field">
        <span>Valor total (euros)</span>
        <input className="input" inputMode="decimal" placeholder="5.829,77" value={value} onChange={(e) => setValue(e.target.value)} />
      </label>
    </Sheet>
  )
}
