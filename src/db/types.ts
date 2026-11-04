import type { Cents } from '../lib/money'
import type { ISODate } from '../lib/dates'

export type AccountType = 'banco' | 'tarjeta' | 'efectivo' | 'inversion'

export interface Account {
  id: string
  name: string
  type: AccountType
  initialBalance: Cents
  /** Fecha desde la que cuenta el saldo inicial */
  initialDate?: ISODate
  color: string
  /** Nombre de la tarjeta tal y como lo escribe el Atajo de Apple Pay (p. ej. "Visa Débito") */
  cardAlias?: string
  archived?: boolean
  /**
   * Solo inversión: cuenta donde ya se registra el efectivo de este bróker (p. ej. la cuenta
   * corriente de Trade Republic importada con su extracto). Así el efectivo no se cuenta dos veces.
   */
  cashAccountId?: string
  order: number
  createdAt: number
}

/** gasto/ingreso cuentan en estadísticas; transferencia y aportación no. */
export type TxKind = 'gasto' | 'ingreso' | 'transferencia' | 'aportacion'
export type TxStatus = 'confirmado' | 'pendiente'
export type TxSource = 'manual' | 'extracto' | 'atajo'

export interface Split {
  categoryId: string | null
  amount: Cents
}

export interface Transaction {
  id: string
  accountId: string
  date: ISODate
  amount: Cents
  description: string
  categoryId: string | null
  kind: TxKind
  status: TxStatus
  source: TxSource
  notes?: string
  tags: string[]
  splits?: Split[]
  /** Enlaza las dos patas de una transferencia */
  transferId?: string
  /** Datos del banco cuando el movimiento se ha conciliado con un extracto */
  bankDate?: ISODate
  bankDescription?: string
  /** Clave del pago del Atajo (para no importarlo dos veces) */
  externalId?: string
  /** Clave de duplicado: cuenta + fecha + importe + concepto del banco */
  dupKey?: string
  importId?: string
  createdAt: number
  updatedAt: number
}

export type CategoryKind = 'gasto' | 'ingreso'

export interface Category {
  id: string
  name: string
  parentId: string | null
  icon: string
  color: string
  kind: CategoryKind
  order: number
}

export interface Rule {
  id: string
  /** Texto normalizado que debe aparecer en el concepto */
  keyword: string
  categoryId: string
  /** Opcional: fuerza el tipo (p. ej. aportación a Trade Republic) */
  kind?: TxKind
  /** Creada por el usuario (prioridad sobre las predefinidas) */
  custom: boolean
  createdAt: number
}

export interface Budget {
  id: string
  categoryId: string
  amount: Cents
}

export interface ColumnMapping {
  headerRow: number // índice de la fila de cabecera (-1 si no hay)
  dateCol: number
  descCol: number
  amountCol: number | null
  debitCol: number | null
  creditCol: number | null
  /** Columnas extra que se añaden al concepto */
  extraDescCols?: number[]
  /** Si los cargos vienen en positivo en la columna de importe */
  invertSign?: boolean
}

export interface ImportTemplate {
  id: string
  name: string
  /** Firma de la cabecera normalizada para reconocer el banco */
  signature: string
  mapping: ColumnMapping
  createdAt: number
}

export type PositionKind = 'etf' | 'accion' | 'cripto' | 'otro'

export interface Position {
  name: string
  isin?: string
  symbol?: string
  kind: PositionKind
  units: number
  price: number
  value: Cents
}

export interface Snapshot {
  id: string
  accountId: string
  date: ISODate
  positions: Position[]
  cash: Cents
  total: Cents
  source: 'pdf' | 'manual'
  /** Huella para no guardar dos veces el mismo extracto */
  fingerprint: string
  createdAt: number
}

export interface ImportLog {
  id: string
  type: 'extracto' | 'atajo' | 'tradeRepublic'
  fileName: string
  accountId?: string
  added: number
  reconciled: number
  skipped: number
  createdAt: number
}

export interface Setting {
  key: string
  value: unknown
}

export interface Settings {
  currency: string
  monthStartDay: number
  lastBackupAt: number | null
  installHintSeen: boolean
  lastTRImportAt: number | null
  trReminderDay: number
  theme: 'sistema' | 'claro' | 'oscuro'
  dismissedRecurring: string[]
  defaultAccountId: string | null
  /** Tu nombre, para reconocer como traspaso los envíos a ti mismo ("To Ana Ejemplo") */
  ownerName: string
  /** Versión de las categorías y reglas predefinidas ya aplicada */
  defaultsVersion: number
}

export const DEFAULT_SETTINGS: Settings = {
  currency: 'EUR',
  monthStartDay: 1,
  lastBackupAt: null,
  installHintSeen: false,
  lastTRImportAt: null,
  trReminderDay: 3,
  theme: 'sistema',
  dismissedRecurring: [],
  defaultAccountId: null,
  ownerName: '',
  defaultsVersion: 1,
}
