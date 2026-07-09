/** Fișa de costuri per show — pentru booking (cererea lui Ștefan). */
import {
  Document,
  Page,
  StyleSheet,
  Text,
  View,
  renderToBuffer,
} from "@react-pdf/renderer";
import { formatMoney, type ShowCostLine } from "@/lib/showFinance";

const styles = StyleSheet.create({
  page: { padding: 44, fontFamily: "Helvetica", fontSize: 10 },
  title: { fontSize: 16, fontFamily: "Helvetica-Bold" },
  subtitle: { fontSize: 10, color: "#555", marginBottom: 16 },
  section: { fontSize: 11, fontFamily: "Helvetica-Bold", marginTop: 14, marginBottom: 4 },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 3,
    borderBottomWidth: 0.5,
    borderBottomColor: "#eee",
  },
  label: { flex: 1 },
  meta: { width: 110, color: "#555" },
  amount: { width: 100, textAlign: "right" },
  total: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 10,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: "#000",
    fontSize: 12,
    fontFamily: "Helvetica-Bold",
  },
});

export interface CostSheetLine extends ShowCostLine {
  paymentType: string | null; // 'company' | 'individual'
}

export async function buildCostSheetPdf(input: {
  orgName: string;
  eventTitle: string;
  date: string;
  venueName: string | null;
  currency: string;
  lines: CostSheetLine[];
}): Promise<Buffer> {
  const crew = input.lines.filter((l) => l.kind === "crew");
  const extra = input.lines.filter((l) => l.kind === "extra");
  const total = input.lines.reduce((s, l) => s + l.amount, 0);
  const paymentLabel = (t: string | null) =>
    t === "company" ? "Company / invoice" : t === "individual" ? "Individual" : "";

  const doc = (
    <Document>
      <Page size="A4" style={styles.page}>
        <Text style={styles.title}>Show cost sheet</Text>
        <Text style={styles.subtitle}>
          {input.orgName} · {input.eventTitle}
          {input.venueName ? ` · ${input.venueName}` : ""} · {input.date}
        </Text>

        {crew.length > 0 && (
          <View>
            <Text style={styles.section}>Crew</Text>
            {crew.map((line, i) => (
              <View key={i} style={styles.row}>
                <Text style={styles.label}>{line.label}</Text>
                <Text style={styles.meta}>{paymentLabel(line.paymentType)}</Text>
                <Text style={styles.amount}>{formatMoney(line.amount, input.currency)}</Text>
              </View>
            ))}
          </View>
        )}

        {extra.length > 0 && (
          <View>
            <Text style={styles.section}>Other costs</Text>
            {extra.map((line, i) => (
              <View key={i} style={styles.row}>
                <Text style={styles.label}>{line.label}</Text>
                <Text style={styles.meta}>{paymentLabel(line.paymentType)}</Text>
                <Text style={styles.amount}>{formatMoney(line.amount, input.currency)}</Text>
              </View>
            ))}
          </View>
        )}

        <View style={styles.total}>
          <Text>TOTAL COSTS</Text>
          <Text>{formatMoney(total, input.currency)}</Text>
        </View>
      </Page>
    </Document>
  );

  return renderToBuffer(doc);
}
