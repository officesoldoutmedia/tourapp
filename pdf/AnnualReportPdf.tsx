/**
 * Raportul anual per persoană — toate anexele emise în an, grupate pe
 * persoană, cu totaluri pe moneda de plată. Print-safe (light), Inter.
 */
import {
  Document,
  Page,
  StyleSheet,
  Text,
  View,
  renderToBuffer,
} from "@react-pdf/renderer";
import { ensurePdfFonts } from "./fonts";
import { formatMoney } from "@/lib/showFinance";
import type { PersonYearReport } from "@/lib/annualReport";

ensurePdfFonts();

const styles = StyleSheet.create({
  page: { padding: 44, fontFamily: "Inter", fontSize: 9, lineHeight: 1.45 },
  org: { fontSize: 9, color: "#666" },
  title: { fontSize: 16, fontWeight: 700, lineHeight: 1.25, marginBottom: 6 },
  subtitle: { fontSize: 9, color: "#444", marginBottom: 22 },
  person: { marginBottom: 16 },
  personHead: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    borderBottomWidth: 1,
    borderBottomColor: "#000",
    paddingBottom: 4,
    marginBottom: 4,
  },
  personName: { fontSize: 11, fontWeight: 700 },
  personSub: { fontSize: 8, color: "#555" },
  personTotals: { fontSize: 9, fontWeight: 700, textAlign: "right" },
  personTotalSub: { fontSize: 7.5, color: "#555", fontWeight: 400 },
  row: {
    flexDirection: "row",
    paddingVertical: 3,
    borderBottomWidth: 0.5,
    borderBottomColor: "#ddd",
  },
  cNo: { width: 30, color: "#555" },
  cMain: { flex: 1, paddingRight: 12 },
  cMainSub: { fontSize: 7.5, color: "#777", marginTop: 1 },
  cAmount: { width: 110, textAlign: "right" },
  cAmountSub: { fontSize: 7.5, color: "#777", marginTop: 1 },
  cStatus: { width: 56, textAlign: "right" },
  paid: { color: "#1a7f4b" },
  pending: { color: "#a86414" },
  footer: {
    position: "absolute",
    bottom: 24,
    left: 44,
    right: 44,
    fontSize: 7.5,
    color: "#888",
    textAlign: "right",
  },
});

const L10N = {
  ro: {
    title: "Raport anual plăți per persoană",
    generated: "Generat din TourApp",
    paid: "plătită",
    pending: "de plată",
    person: ["persoană", "persoane"],
    annex: ["anexă", "anexe"],
    outstanding: "rest de plată",
    allPaid: "totul plătit",
  },
  en: {
    title: "Annual per-person payment report",
    generated: "Generated from TourApp",
    paid: "paid",
    pending: "due",
    person: ["person", "people"],
    annex: ["annex", "annexes"],
    outstanding: "outstanding",
    allPaid: "all paid",
  },
};

export async function buildAnnualReportPdf(
  orgName: string,
  year: number,
  people: PersonYearReport[],
  locale = "ro",
): Promise<Buffer> {
  const t = L10N[locale === "en" ? "en" : "ro"];
  const doc = (
    <Document title={`${t.title} ${year} — ${orgName}`}>
      <Page size="A4" style={styles.page}>
        <Text style={styles.org}>{orgName}</Text>
        <Text style={styles.title}>
          {t.title} — {year}
        </Text>
        <Text style={styles.subtitle}>
          {people.length} {t.person[people.length === 1 ? 0 : 1]} ·{" "}
          {(() => {
            const count = people.reduce((n, p) => n + p.annexes.length, 0);
            return `${count} ${t.annex[count === 1 ? 0 : 1]}`;
          })()}
        </Text>

        {people.map((person) => (
          <View key={person.key} style={styles.person} wrap={false}>
            <View style={styles.personHead}>
              <View>
                <Text style={styles.personName}>{person.name}</Text>
                <Text style={styles.personSub}>
                  {[person.company, person.tours.join(", ")].filter(Boolean).join(" · ")}
                </Text>
              </View>
              <View>
                {Object.entries(person.totals).map(([currency, totals]) => (
                  <Text key={currency} style={styles.personTotals}>
                    {formatMoney(totals.total, currency)}
                    {"  "}
                    <Text style={styles.personTotalSub}>
                      {totals.pending > 0
                        ? `(${formatMoney(totals.pending, currency)} ${t.outstanding})`
                        : `(${t.allPaid})`}
                    </Text>
                  </Text>
                ))}
              </View>
            </View>
            {person.annexes.map((annex) => (
              <View key={annex.id} style={styles.row}>
                <Text style={styles.cNo}>#{annex.annexNumber}</Text>
                <View style={styles.cMain}>
                  <Text>{annex.tourName}</Text>
                  <Text style={styles.cMainSub}>
                    {[annex.contractNumber, annex.issueDate].filter(Boolean).join(" · ")}
                  </Text>
                </View>
                <View style={styles.cAmount}>
                  <Text>{formatMoney(annex.paymentTotal, annex.paymentCurrency)}</Text>
                  {annex.fxRate != null && (
                    <Text style={styles.cAmountSub}>
                      {formatMoney(annex.total, annex.currency)} · 1 {annex.currency} ={" "}
                      {annex.fxRate} {annex.paymentCurrency}
                    </Text>
                  )}
                </View>
                <Text style={[styles.cStatus, annex.paid ? styles.paid : styles.pending]}>
                  {annex.paid ? t.paid : t.pending}
                </Text>
              </View>
            ))}
          </View>
        ))}

        <Text style={styles.footer} fixed>
          {t.generated} · {orgName} · {year}
        </Text>
      </Page>
    </Document>
  );
  return Buffer.from(await renderToBuffer(doc));
}
