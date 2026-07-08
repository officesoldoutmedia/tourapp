import { describe, expect, it } from 'vitest'
import { computeSettlement, evalExpenseFormula } from './settlement'

const base = {
  dealType: 'vs_split',
  guarantee: 0,
  splitPercentArtist: 0,
  venueCapacity: null,
  ticketsSold: null,
  grossTicketSales: 0,
  taxesFees: 0,
  totalExpenses: 0,
  overageOverride: null,
  productionReimbursements: 0,
  additionalChargebacks: 0,
  deposit: 0,
  withholding: 0,
  cash: 0,
  ticketBuys: 0,
  nightOfShowDeductions: 0,
}

describe('computeSettlement — ordinea A.4', () => {
  it('DoD: 85/15 cu taxe și withholding dă totalul corect', () => {
    // gross 100.000, taxe 19.000 → net 81.000; expenses 20.000 → pot 61.000
    // guarantee 10.000; overage = 85% × (61.000 − 10.000) = 43.350
    // walkout = 53.350; − deposit 5.000 − withholding 2.000 = 46.350
    const r = computeSettlement({
      ...base,
      dealType: 'vs_split',
      guarantee: 10_000,
      splitPercentArtist: 85,
      venueCapacity: 5000,
      ticketsSold: 4000,
      grossTicketSales: 100_000,
      taxesFees: 19_000,
      totalExpenses: 20_000,
      deposit: 5_000,
      withholding: 2_000,
    })
    expect(r.netTicketSales).toBe(81_000)
    expect(r.amountToPot).toBe(61_000)
    expect(r.overage).toBe(43_350)
    expect(r.walkout).toBe(53_350)
    expect(r.amountDue).toBe(46_350)
    expect(r.percentOfCapacity).toBe(80)
  })

  it('guarantee-only: overage 0, walkout = guarantee', () => {
    const r = computeSettlement({
      ...base,
      dealType: 'guarantee',
      guarantee: 15_000,
      grossTicketSales: 50_000,
      taxesFees: 5_000,
      totalExpenses: 30_000,
    })
    expect(r.overage).toBe(0)
    expect(r.walkout).toBe(15_000)
    expect(r.amountDue).toBe(15_000)
  })

  it('pot sub guarantee → overage 0 (nu negativ)', () => {
    const r = computeSettlement({
      ...base,
      dealType: 'vs_split',
      guarantee: 50_000,
      splitPercentArtist: 85,
      grossTicketSales: 40_000,
      taxesFees: 4_000,
      totalExpenses: 10_000, // pot 26.000 < guarantee
    })
    expect(r.overage).toBe(0)
    expect(r.walkout).toBe(50_000)
  })

  it('reimbursements/chargebacks adună, cash/ticketBuys/NOS scad (ordinea A.4)', () => {
    const r = computeSettlement({
      ...base,
      guarantee: 10_000,
      productionReimbursements: 1_000,
      additionalChargebacks: 500,
      deposit: 2_000,
      withholding: 300,
      cash: 200,
      ticketBuys: 100,
      nightOfShowDeductions: 400,
    })
    expect(r.amountDue).toBe(10_000 + 1_000 + 500 - 2_000 - 300 - 200 - 100 - 400)
  })

  it('override manual pe overage bate calculul', () => {
    const r = computeSettlement({
      ...base,
      dealType: 'vs_split',
      guarantee: 10_000,
      splitPercentArtist: 85,
      grossTicketSales: 100_000,
      overageOverride: 12_345,
    })
    expect(r.overage).toBe(12_345)
    expect(r.walkout).toBe(22_345)
  })
})

describe('evalExpenseFormula [N §6.12]', () => {
  const ctx = { gross: 100_000, net: 81_000 }
  it('procente din gross/net', () => {
    expect(evalExpenseFormula('5% of gross', ctx)).toBe(5_000)
    expect(evalExpenseFormula('2.5% of net', ctx)).toBe(2_025)
    expect(evalExpenseFormula(' 10 % OF GROSS ', ctx)).toBe(10_000)
  })
  it('sumă fixă', () => {
    expect(evalExpenseFormula('1500', ctx)).toBe(1_500)
    expect(evalExpenseFormula('1500,50', ctx)).toBe(1_500.5)
  })
  it('invalid → null', () => {
    expect(evalExpenseFormula('jumate din bar', ctx)).toBeNull()
    expect(evalExpenseFormula('5% of merch', ctx)).toBeNull()
  })
})
