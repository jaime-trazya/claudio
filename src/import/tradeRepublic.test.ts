import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs'
import { extractPdfLines } from './pdfText'
import { parseTradeRepublic } from './tradeRepublic'
import { EJEMPLOS, sample } from '../test/helpers'

const expected = JSON.parse(fs.readFileSync(path.join(EJEMPLOS, 'trade-republic-esperado.json'), 'utf8'))
const cents = (n: number) => Math.round(n * 100)
const fonts = path.resolve(__dirname, '../../node_modules/pdfjs-dist/standard_fonts/') + '/'
const read = (name: string) => extractPdfLines(sample(name), pdfjs as never, { standardFontDataUrl: fonts })

describe('lector del PDF de Trade Republic', () => {
  it('extrae fecha, posiciones, cripto, efectivo y total del PDF de ejemplo', async () => {
    const lines = await read('trade-republic-extracto-patrimonio.pdf')
    const st = parseTradeRepublic(lines)
    expect(st.warnings).toEqual([])
    expect(st.date).toBe('2026-10-31')
    expect(st.cash).toBe(cents(expected.efectivo))
    expect(st.total).toBe(cents(expected.total))
    const etfs = st.positions.filter((p) => p.kind !== 'cripto')
    expect(etfs).toHaveLength(3)
    expect(etfs[0]).toMatchObject({ name: 'iShares Core MSCI World USD (Acc)', isin: 'IE00B4L5Y983', kind: 'etf', price: 98.45, value: cents(2473.4) })
    expect(etfs[0].units).toBeCloseTo(25.123456, 6)
    expect(etfs[1]).toMatchObject({ name: 'Vanguard FTSE All-World UCITS ETF USD Accumulating', isin: 'IE00BK5BQT80', kind: 'etf' })
    expect(etfs[2]).toMatchObject({ name: 'Apple Inc.', isin: 'US0378331005', kind: 'accion', units: 2 })
    const crypto = st.positions.filter((p) => p.kind === 'cripto')
    expect(crypto.map((c) => c.symbol)).toEqual(['BTC', 'ETH'])
    expect(crypto[0]).toMatchObject({ name: 'Bitcoin (BTC)', price: 58432.1, value: cents(expected.cryptos[0].value) })
    expect(crypto[0].units).toBeCloseTo(0.012345, 6)
  })

  it('la huella es la misma si se importa el mismo extracto dos veces', async () => {
    const a = parseTradeRepublic(await read('trade-republic-extracto-patrimonio.pdf'))
    const b = parseTradeRepublic(await read('trade-republic-extracto-patrimonio.pdf'))
    expect(a.fingerprint).toBe(b.fingerprint)
  })

  it('lee líneas de texto con otra disposición (ISIN en la misma línea, sin resumen)', () => {
    const st = parseTradeRepublic([
      'EXTRACTO DEL PATRIMONIO NETO',
      'Fecha 15.09.2026',
      'CUENTA DE VALORES',
      '3 uds. Xtrackers MSCI Emerging Markets ISIN: IE00BTJRMP35 50,00 150,00',
      'WALLET CRYPTO',
      '1,5 uds. Solana SOL 100,00 150,00',
      'EFECTIVO',
      'Saldo 10,00 EUR',
      'Página 1 de 1',
    ])
    expect(st.date).toBe('2026-09-15')
    expect(st.positions).toHaveLength(2)
    expect(st.positions[0]).toMatchObject({ isin: 'IE00BTJRMP35', kind: 'etf', value: 15000 })
    expect(st.positions[1]).toMatchObject({ symbol: 'SOL', kind: 'cripto' })
    expect(st.cash).toBe(1000)
    expect(st.total).toBe(31000)
  })

  it('avisa cuando no entiende el documento', () => {
    const st = parseTradeRepublic(['Factura de la luz', 'Total 54,32 EUR'])
    expect(st.positions).toHaveLength(0)
    expect(st.warnings.length).toBeGreaterThan(0)
  })
})
