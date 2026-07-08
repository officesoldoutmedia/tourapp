/**
 * Settlement (blueprint §6.12, ANEXA A.4) — funcție PURĂ cu ordinea
 * EXACTĂ a waterfall-ului. Câmpurile derivate sunt READ-ONLY calculate.
 *
 *   GrossTicketSales − TaxesFees = NetTicketSales
 *   NetTicketSales − TotalExpenses = AMOUNT TO POT
 *   Overage = split% × max(0, pot − guarantee)   [D — vs_split]
 *   Walkout = Guarantee + Overage                 [C-S]
 *   AmountDue = Walkout + ProductionReimbursements + AdditionalChargebacks
 *               − Deposit − Withholding − Cash − TicketBuys
 *               − NightOfShowDeductions
 */

export interface SettlementInput {
  dealType: string | null // 'guarantee' | 'vs_split' | 'door_deal' | 'flat'
  guarantee: number
  splitPercentArtist: number
  venueCapacity: number | null
  ticketsSold: number | null
  grossTicketSales: number
  taxesFees: number
  totalExpenses: number
  /** override manual; null = calculat din deal */
  overageOverride: number | null
  productionReimbursements: number
  additionalChargebacks: number
  deposit: number
  withholding: number
  cash: number
  ticketBuys: number
  nightOfShowDeductions: number
}

export interface SettlementResult {
  netTicketSales: number
  amountToPot: number
  overage: number
  walkout: number
  amountDue: number
  percentOfCapacity: number | null
}

const round2 = (value: number) => Math.round(value * 100) / 100

export function computeSettlement(input: SettlementInput): SettlementResult {
  const netTicketSales = input.grossTicketSales - input.taxesFees
  const amountToPot = netTicketSales - input.totalExpenses

  let overage: number
  if (input.overageOverride !== null) {
    overage = input.overageOverride
  } else if (
    (input.dealType === 'vs_split' || input.dealType === 'door_deal') &&
    input.splitPercentArtist > 0
  ) {
    overage = (input.splitPercentArtist / 100) * Math.max(0, amountToPot - input.guarantee)
  } else {
    overage = 0
  }

  const walkout = input.guarantee + overage
  const amountDue =
    walkout +
    input.productionReimbursements +
    input.additionalChargebacks -
    input.deposit -
    input.withholding -
    input.cash -
    input.ticketBuys -
    input.nightOfShowDeductions

  const percentOfCapacity =
    input.venueCapacity && input.venueCapacity > 0 && input.ticketsSold !== null
      ? round2((input.ticketsSold / input.venueCapacity) * 100)
      : null

  return {
    netTicketSales: round2(netTicketSales),
    amountToPot: round2(amountToPot),
    overage: round2(overage),
    walkout: round2(walkout),
    amountDue: round2(amountDue),
    percentOfCapacity,
  }
}

/**
 * Formula fields [C], parser simplu [N §6.12]:
 *   '<n>% of gross' | '<n>% of net' | număr fix. Invalid → null.
 */
export function evalExpenseFormula(
  formula: string,
  context: { gross: number; net: number },
): number | null {
  const trimmed = formula.trim().toLowerCase()
  const percentMatch = trimmed.match(/^(\d+(?:[.,]\d+)?)\s*%\s*of\s*(gross|net)$/)
  if (percentMatch) {
    const percent = Number(percentMatch[1].replace(',', '.'))
    const base = percentMatch[2] === 'gross' ? context.gross : context.net
    return round2((percent / 100) * base)
  }
  const fixed = Number(trimmed.replace(',', '.'))
  return Number.isFinite(fixed) ? round2(fixed) : null
}
