import type { AccountType } from '../db/types'

export interface BankPreset {
  id: string
  name: string
  /** Color de marca (fondo del logotipo) y color del símbolo */
  bg: string
  fg: string
  /** Letras del logotipo cuando no hay símbolo dibujado */
  mark: string
  /** Códigos de entidad del IBAN español (posiciones 5-8) */
  entity: string[]
  /** Texto que aparece en sus extractos */
  detect: RegExp
}

export const BANKS: BankPreset[] = [
  { id: 'caixabank', name: 'CaixaBank', bg: '#007eae', fg: '#ffffff', mark: 'CX', entity: ['2100'], detect: /caixabank|la caixa/i },
  // imagin es de CaixaBank y comparte su código de entidad (2100): se distingue por el nombre
  { id: 'imagin', name: 'imagin', bg: '#00c29a', fg: '#ffffff', mark: 'i', entity: [], detect: /\bimagin(bank)?\b/i },
  { id: 'revolut', name: 'Revolut', bg: '#191c1f', fg: '#ffffff', mark: 'R', entity: ['1583'], detect: /revolut/i },
  { id: 'traderepublic', name: 'Trade Republic', bg: '#000000', fg: '#ffffff', mark: 'TR', entity: ['1586'], detect: /trade republic/i },
  { id: 'bbva', name: 'BBVA', bg: '#072146', fg: '#ffffff', mark: 'BBVA', entity: ['0182'], detect: /\bbbva\b/i },
  { id: 'santander', name: 'Santander', bg: '#ec0000', fg: '#ffffff', mark: 'S', entity: ['0049'], detect: /santander/i },
  { id: 'sabadell', name: 'Sabadell', bg: '#006dff', fg: '#ffffff', mark: 'B', entity: ['0081'], detect: /sabadell/i },
  { id: 'ing', name: 'ING', bg: '#ff6200', fg: '#ffffff', mark: 'ING', entity: ['1465'], detect: /\bing\b direct|ing bank/i },
  { id: 'bankinter', name: 'Bankinter', bg: '#ff7300', fg: '#ffffff', mark: 'bk', entity: ['0128'], detect: /bankinter/i },
  { id: 'openbank', name: 'Openbank', bg: '#e6007e', fg: '#ffffff', mark: 'O', entity: ['0073'], detect: /openbank/i },
  { id: 'unicaja', name: 'Unicaja', bg: '#009b48', fg: '#ffffff', mark: 'U', entity: ['2103'], detect: /unicaja/i },
  { id: 'kutxabank', name: 'Kutxabank', bg: '#00843d', fg: '#ffffff', mark: 'K', entity: ['2095'], detect: /kutxabank/i },
  { id: 'abanca', name: 'Abanca', bg: '#0066b3', fg: '#ffffff', mark: 'A', entity: ['2080'], detect: /abanca/i },
  { id: 'ibercaja', name: 'Ibercaja', bg: '#003f87', fg: '#ffffff', mark: 'IC', entity: ['2085'], detect: /ibercaja/i },
  { id: 'cajamar', name: 'Cajamar', bg: '#00a05a', fg: '#ffffff', mark: 'CM', entity: ['3058'], detect: /cajamar/i },
  { id: 'n26', name: 'N26', bg: '#36a18b', fg: '#ffffff', mark: 'N26', entity: ['1563'], detect: /\bn26\b/i },
  { id: 'myinvestor', name: 'MyInvestor', bg: '#4a2ad8', fg: '#ffffff', mark: 'MI', entity: ['1544'], detect: /myinvestor/i },
  { id: 'evo', name: 'EVO Banco', bg: '#f2a900', fg: '#1a1a1a', mark: 'EVO', entity: ['0239'], detect: /evo banco/i },
  { id: 'laboralkutxa', name: 'Laboral Kutxa', bg: '#003b7a', fg: '#ffffff', mark: 'LK', entity: ['3035'], detect: /laboral kutxa/i },
  { id: 'cajarural', name: 'Caja Rural', bg: '#00843d', fg: '#ffffff', mark: 'CR', entity: [], detect: /caja rural|ruralvia/i },
  { id: 'deutsche', name: 'Deutsche Bank', bg: '#0018a8', fg: '#ffffff', mark: 'DB', entity: ['0019'], detect: /deutsche bank/i },
  { id: 'selfbank', name: 'Self Bank', bg: '#e4002b', fg: '#ffffff', mark: 'SB', entity: ['1490'], detect: /self ?bank/i },
  { id: 'pibank', name: 'Pibank', bg: '#ffd400', fg: '#1a1a1a', mark: 'Pi', entity: ['0234'], detect: /pibank/i },
  { id: 'wizink', name: 'WiZink', bg: '#d1006e', fg: '#ffffff', mark: 'WZ', entity: ['0229'], detect: /wizink/i },
  { id: 'mediolanum', name: 'Mediolanum', bg: '#0b2d71', fg: '#ffffff', mark: 'M', entity: ['0186'], detect: /mediolanum/i },
  { id: 'bancamarch', name: 'Banca March', bg: '#b4975a', fg: '#ffffff', mark: 'BM', entity: ['0061'], detect: /banca march/i },
  { id: 'triodos', name: 'Triodos', bg: '#00594f', fg: '#ffffff', mark: 'T', entity: ['1491'], detect: /triodos/i },
  { id: 'bunq', name: 'bunq', bg: '#2a2a2a', fg: '#ffffff', mark: 'b', entity: [], detect: /\bbunq\b/i },
  { id: 'wise', name: 'Wise', bg: '#9fe870', fg: '#163300', mark: 'W', entity: [], detect: /\bwise\b/i },
  { id: 'efectivo', name: 'Efectivo', bg: '#2f7a45', fg: '#ffffff', mark: '€', entity: [], detect: /^$/ },
]

export const bankById = (id?: string) => BANKS.find((b) => b.id === id)

/**
 * Detecta el banco del extracto: primero por el IBAN (código de entidad) y, si no hay IBAN,
 * por el nombre del banco en la cabecera. Nunca se miran los conceptos de los movimientos
 * ("Transferencia a Trade Republic" en un extracto de CaixaBank no es de Trade Republic).
 */
export function detectBank(text: string, header: string = text): BankPreset | null {
  // Bancos que comparten código de entidad con otro: manda el nombre (imagin dentro de CaixaBank)
  const shared = BANKS.find((b) => b.id === 'imagin' && b.detect.test(header))
  if (shared) return shared
  const iban = text.replace(/\s+/g, '').match(/ES\d{2}(\d{4})\d{16}/)
  if (iban) {
    const byEntity = BANKS.find((b) => b.entity.includes(iban[1]))
    if (byEntity) return byEntity
  }
  return BANKS.find((b) => b.id !== 'efectivo' && b.detect.test(header)) ?? null
}

export interface QuickAccount {
  name: string
  type: AccountType
  bank: string
  /** Solo inversión: nombre de la cuenta donde está su efectivo */
  cashAccount?: string
}

/** Cuentas que se crean con la configuración rápida de cada banco */
export function quickAccountsFor(bankId: string): QuickAccount[] {
  const b = bankById(bankId)
  if (!b) return []
  if (bankId === 'traderepublic')
    return [
      { name: 'Trade Republic · efectivo', type: 'banco', bank: bankId },
      { name: 'Trade Republic · inversión', type: 'inversion', bank: bankId, cashAccount: 'Trade Republic · efectivo' },
    ]
  if (bankId === 'myinvestor') return [{ name: 'MyInvestor', type: 'inversion', bank: bankId }]
  if (bankId === 'efectivo') return [{ name: 'Efectivo', type: 'efectivo', bank: bankId }]
  return [{ name: b.name, type: 'banco', bank: bankId }]
}
