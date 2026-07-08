/** Settlement PDF — waterfall-ul A.4 în ordinea calculului. */
import {
  Document,
  Page,
  StyleSheet,
  Text,
  View,
  renderToBuffer,
} from "@react-pdf/renderer";
import { computeSettlement } from "@/lib/settlement";

const styles = StyleSheet.create({
  page: { padding: 44, fontFamily: "Helvetica", fontSize: 10 },
  title: { fontSize: 16, fontFamily: "Helvetica-Bold" },
  subtitle: { fontSize: 10, color: "#555", marginBottom: 16 },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 2,
    borderBottomWidth: 0.5,
    borderBottomColor: "#eee",
  },
  computed: { fontFamily: "Helvetica-Bold", backgroundColor: "#f2f2f2", paddingHorizontal: 4 },
  due: { fontSize: 12, fontFamily: "Helvetica-Bold", marginTop: 8 },
});

interface SettlementRecord {
  currency: string;
  deal_type: string | null;
  guarantee: number | null;
  split_percent_artist: number | null;
  venue_capacity: number | null;
  tickets_sold: number | null;
  comps: number | null;
  gross_ticket_sales: number | null;
  taxes_fees: number | null;
  total_expenses: number | null;
  overage: number | null;
  production_reimbursements: number | null;
  additional_chargebacks: number | null;
  deposit: number | null;
  withholding: number | null;
  cash: number | null;
  ticket_buys: number | null;
  night_of_show_deductions: number | null;
  total_merch_sales: number | null;
}

export async function buildSettlementPdf(input: {
  settlement: SettlementRecord;
  eventTitle: string;
  date: string;
}): Promise<Buffer> {
  const s = input.settlement;
  const n = (v: number | null) => v ?? 0;
  const r = computeSettlement({
    dealType: s.deal_type,
    guarantee: n(s.guarantee),
    splitPercentArtist: n(s.split_percent_artist),
    venueCapacity: s.venue_capacity,
    ticketsSold: s.tickets_sold,
    grossTicketSales: n(s.gross_ticket_sales),
    taxesFees: n(s.taxes_fees),
    totalExpenses: n(s.total_expenses),
    overageOverride: s.overage,
    productionReimbursements: n(s.production_reimbursements),
    additionalChargebacks: n(s.additional_chargebacks),
    deposit: n(s.deposit),
    withholding: n(s.withholding),
    cash: n(s.cash),
    ticketBuys: n(s.ticket_buys),
    nightOfShowDeductions: n(s.night_of_show_deductions),
  });

  const money = (v: number) =>
    `${v.toLocaleString("en-US", { minimumFractionDigits: 2 })} ${s.currency}`;

  const rows: [string, string, boolean][] = [
    ["Venue capacity", String(s.venue_capacity ?? "—"), false],
    [
      "Tickets sold",
      `${s.tickets_sold ?? "—"}${r.percentOfCapacity != null ? ` (${r.percentOfCapacity}%)` : ""}`,
      false,
    ],
    ["Comps", String(s.comps ?? "—"), false],
    ["Gross ticket sales", money(n(s.gross_ticket_sales)), false],
    ["− Taxes & fees", money(n(s.taxes_fees)), false],
    ["= NET TICKET SALES", money(r.netTicketSales), true],
    ["− Total expenses", money(n(s.total_expenses)), false],
    ["= AMOUNT TO POT", money(r.amountToPot), true],
    ["Guarantee", money(n(s.guarantee)), false],
    ["Overage", money(r.overage), false],
    ["Walkout", money(r.walkout), true],
    ["+ Production reimbursements", money(n(s.production_reimbursements)), false],
    ["+ Additional chargebacks", money(n(s.additional_chargebacks)), false],
    ["− Deposit", money(n(s.deposit)), false],
    ["− Withholding", money(n(s.withholding)), false],
    ["− Cash", money(n(s.cash)), false],
    ["− Ticket buys", money(n(s.ticket_buys)), false],
    ["− Night-of-show deductions", money(n(s.night_of_show_deductions)), false],
  ];

  const doc = (
    <Document title={`Settlement — ${input.eventTitle}`}>
      <Page size="A4" style={styles.page}>
        <Text style={styles.title}>{input.eventTitle}</Text>
        <Text style={styles.subtitle}>
          Settlement · {input.date} · {s.deal_type ?? "—"}
          {s.split_percent_artist != null && ` · ${s.split_percent_artist}%`}
        </Text>
        {rows.map(([label, value, computed], i) => (
          <View key={i} style={computed ? [styles.row, styles.computed] : styles.row}>
            <Text>{label}</Text>
            <Text>{value}</Text>
          </View>
        ))}
        <View style={[styles.row, styles.due]}>
          <Text>= AMOUNT DUE</Text>
          <Text>{money(r.amountDue)}</Text>
        </View>
        {s.total_merch_sales != null && (
          <View style={styles.row}>
            <Text>Total merch sales (informativ)</Text>
            <Text>{money(s.total_merch_sales)}</Text>
          </View>
        )}
      </Page>
    </Document>
  );
  return Buffer.from(await renderToBuffer(doc));
}
