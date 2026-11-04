import type { Account } from '../db/types'
import { bankById } from '../domain/banks'

/**
 * Logotipo del banco de la cuenta: símbolo propio para los bancos más habituales
 * y monograma con el color de marca para el resto.
 */
export function BankBadge({ bank, account, size = 40 }: { bank?: string; account?: Account; size?: number }) {
  const preset = bankById(bank ?? account?.bank)
  const r = Math.round(size * 0.28)
  if (!preset) {
    const color = account?.color ?? '#6b7280'
    return (
      <span className="tile" style={{ '--c': color, width: size, height: size, borderRadius: r, fontWeight: 700, fontSize: size * 0.4 } as React.CSSProperties} aria-hidden>
        {(account?.name ?? '?').slice(0, 1).toUpperCase()}
      </span>
    )
  }
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" role="img" aria-label={preset.name} style={{ flex: 'none', borderRadius: r }}>
      <rect width="40" height="40" rx={r * (40 / size)} fill={preset.bg} />
      {preset.id === 'caixabank' ? (
        // Estrella de CaixaBank simplificada: estrella azul clara con puntos amarillo y rojo
        <g>
          <path d="M20 7.5l3.3 8.2 8.7.5-6.8 5.5 2.3 8.5-7.5-4.8-7.5 4.8 2.3-8.5-6.8-5.5 8.7-.5z" fill="#ffffff" />
          <circle cx="27.5" cy="10.5" r="3" fill="#ffc72c" />
          <circle cx="12" cy="11.5" r="2.4" fill="#e2001a" />
        </g>
      ) : preset.id === 'revolut' ? (
        <text x="20" y="28" textAnchor="middle" fontFamily="'Manrope Variable', system-ui, sans-serif" fontWeight="800" fontSize="22" fill={preset.fg}>
          R
        </text>
      ) : preset.id === 'traderepublic' ? (
        // Trade Republic: cuadro con líneas, en blanco y negro
        <g fill="none" stroke="#ffffff" strokeWidth="2.6" strokeLinecap="square">
          <path d="M12 12h16M20 12v16" />
          <path d="M12 28h16" opacity="0.55" />
        </g>
      ) : preset.id === 'efectivo' ? (
        <text x="20" y="27" textAnchor="middle" fontFamily="system-ui, sans-serif" fontWeight="700" fontSize="19" fill={preset.fg}>
          €
        </text>
      ) : (
        <text
          x="20"
          y={preset.mark.length > 2 ? 24.5 : 27}
          textAnchor="middle"
          fontFamily="'Manrope Variable', system-ui, sans-serif"
          fontWeight="800"
          fontSize={preset.mark.length > 3 ? 10 : preset.mark.length > 2 ? 12 : preset.mark.length > 1 ? 15 : 20}
          fill={preset.fg}
          letterSpacing="-0.5"
        >
          {preset.mark}
        </text>
      )}
    </svg>
  )
}
