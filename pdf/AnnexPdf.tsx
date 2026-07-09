/**
 * Anexa de plată (document RO) — generată per membru de crew, acoperă
 * unul sau mai multe show-uri. Părțile = snapshot-uri de la emitere.
 */
import {
  Document,
  Page,
  StyleSheet,
  Text,
  View,
  renderToBuffer,
} from "@react-pdf/renderer";
import { formatMoney } from "@/lib/showFinance";

const styles = StyleSheet.create({
  page: { padding: 48, fontFamily: "Helvetica", fontSize: 10, lineHeight: 1.45 },
  title: { fontSize: 14, fontFamily: "Helvetica-Bold", textAlign: "center" },
  subtitle: { fontSize: 10, textAlign: "center", color: "#444", marginBottom: 18 },
  section: { fontSize: 11, fontFamily: "Helvetica-Bold", marginTop: 12, marginBottom: 4 },
  partyBox: { flexDirection: "row", gap: 16, marginTop: 8 },
  party: { flex: 1, borderWidth: 0.5, borderColor: "#999", padding: 8 },
  partyTitle: { fontFamily: "Helvetica-Bold", fontSize: 9, marginBottom: 4, color: "#555" },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 3,
    borderBottomWidth: 0.5,
    borderBottomColor: "#ddd",
  },
  total: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 8,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: "#000",
    fontSize: 12,
    fontFamily: "Helvetica-Bold",
  },
  signatures: { flexDirection: "row", gap: 40, marginTop: 40 },
  signBox: { flex: 1, textAlign: "center" },
  signLine: { borderTopWidth: 0.5, borderTopColor: "#000", marginTop: 36, paddingTop: 4, fontSize: 9 },
});

export interface AnnexParty {
  name?: string;
  cui?: string;
  reg_com?: string;
  id_number?: string;
  address?: string;
  iban?: string;
  bank?: string;
  representative?: string;
}

export interface AnnexShowLine {
  date: string;
  label: string;
  amount: number;
}

function PartyBlock({ title, party }: { title: string; party: AnnexParty }) {
  const lines = [
    party.name,
    party.cui ? `CUI: ${party.cui}` : null,
    party.reg_com ? `Reg. Com.: ${party.reg_com}` : null,
    party.id_number ? `CI/CNP: ${party.id_number}` : null,
    party.address ? `Adresa: ${party.address}` : null,
    party.iban ? `IBAN: ${party.iban}` : null,
    party.bank ? `Banca: ${party.bank}` : null,
    party.representative ? `Reprezentant: ${party.representative}` : null,
  ].filter(Boolean) as string[];
  return (
    <View style={styles.party}>
      <Text style={styles.partyTitle}>{title}</Text>
      {lines.map((line, i) => (
        <Text key={i}>{line}</Text>
      ))}
    </View>
  );
}

export async function buildAnnexPdf(input: {
  annexNumber: number;
  contractNumber: string | null;
  issueDate: string;
  currency: string;
  payer: AnnexParty;
  payee: AnnexParty;
  shows: AnnexShowLine[];
  notes: string | null;
}): Promise<Buffer> {
  const total = input.shows.reduce((s, l) => s + l.amount, 0);

  const doc = (
    <Document>
      <Page size="A4" style={styles.page}>
        <Text style={styles.title}>ANEXA NR. {input.annexNumber}</Text>
        <Text style={styles.subtitle}>
          {input.contractNumber
            ? `la Contractul nr. ${input.contractNumber} · `
            : ""}
          Data emiterii: {input.issueDate}
        </Text>

        <View style={styles.partyBox}>
          <PartyBlock title="BENEFICIAR (plătitor)" party={input.payer} />
          <PartyBlock title="PRESTATOR (beneficiar plată)" party={input.payee} />
        </View>

        <Text style={styles.section}>Servicii prestate — evenimente acoperite</Text>
        {input.shows.map((show, i) => (
          <View key={i} style={styles.row}>
            <Text>
              {show.date} · {show.label}
            </Text>
            <Text>{formatMoney(show.amount, input.currency)}</Text>
          </View>
        ))}

        <View style={styles.total}>
          <Text>TOTAL DE PLATĂ</Text>
          <Text>{formatMoney(total, input.currency)}</Text>
        </View>

        {input.notes && (
          <>
            <Text style={styles.section}>Mențiuni</Text>
            <Text>{input.notes}</Text>
          </>
        )}

        <View style={styles.signatures}>
          <View style={styles.signBox}>
            <Text style={styles.signLine}>BENEFICIAR{input.payer.representative ? ` — ${input.payer.representative}` : ""}</Text>
          </View>
          <View style={styles.signBox}>
            <Text style={styles.signLine}>PRESTATOR{input.payee.representative ? ` — ${input.payee.representative}` : input.payee.name ? ` — ${input.payee.name}` : ""}</Text>
          </View>
        </View>
      </Page>
    </Document>
  );

  return renderToBuffer(doc);
}
