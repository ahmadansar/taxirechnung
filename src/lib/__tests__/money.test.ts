import { describe, expect, it } from 'vitest'
import { calcTotals, grossToNet, isSmallInvoice, netToGross, parseEUR, suggestTaxiRate } from '../money'

describe('VAT and totals', () => {
  it('net + VAT equals gross for every rate (EN 16931 BR-CO-17)', () => {
    for (let gross = 1; gross < 30000; gross += 37) {
      const t = calcTotals([{ description: 'Fahrt', quantity: 1, unit_price_gross: gross, vat_rate: 7 }], false)
      expect(t.net + t.vat).toBe(gross)
      expect(t.lines[0].gross).toBe(gross)
    }
  })
  it('splits mixed rates into separate lines', () => {
    const t = calcTotals(
      [
        { description: 'Fahrt', quantity: 1, unit_price_gross: 4280, vat_rate: 7 },
        { description: 'Gepäck', quantity: 2, unit_price_gross: 595, vat_rate: 19 },
      ],
      false,
    )
    expect(t.gross).toBe(5470)
    expect(t.lines.map((l) => l.rate).sort()).toEqual([19, 7])
    expect(t.lines.find((l) => l.rate === 19)).toMatchObject({ net: 1000, vat: 190 })
  })
  it('small business (§ 19 UStG) has no VAT', () => {
    const t = calcTotals([{ description: 'Fahrt', quantity: 1, unit_price_gross: 2350, vat_rate: 7 }], true)
    expect(t.vat).toBe(0)
    expect(t.net).toBe(2350)
  })
})

describe('taxi rate § 12 Abs. 2 Nr. 10 UStG', () => {
  it('7 % within the municipality or up to 50 km, else 19 %', () => {
    expect(suggestTaxiRate(12, false)).toBe(7)
    expect(suggestTaxiRate(50, false)).toBe(7)
    expect(suggestTaxiRate(51, false)).toBe(19)
    expect(suggestTaxiRate(80, true)).toBe(7)
  })
})

describe('helpers', () => {
  it('parses German amounts', () => {
    expect(parseEUR('23,50')).toBe(2350)
    expect(parseEUR('1.234,56')).toBe(123456)
  })
  it('small-amount invoice limit is 250 €', () => {
    expect(isSmallInvoice(25000)).toBe(true)
    expect(isSmallInvoice(25001)).toBe(false)
  })
})

describe('price entered plus VAT (netto)', () => {
  it('50 € + 7 % = 53,50 €, and the invoice shows exactly the typed net amount', () => {
    expect(netToGross(5000, 7)).toBe(5350)
    expect(netToGross(5000, 19)).toBe(5950)
    for (const rate of [7, 19] as const) {
      for (let net = 1; net < 50000; net += 13) {
        const t = calcTotals([{ description: 'Fahrt', quantity: 1, unit_price_gross: netToGross(net, rate), vat_rate: rate }], false)
        expect(t.net).toBe(net)
        expect(grossToNet(netToGross(net, rate), rate)).toBe(net)
      }
    }
  })
})
