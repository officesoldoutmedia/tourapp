/**
 * Anexa de plată — bilingvă (RO/EN), generată per membru de crew.
 * Părțile = snapshot-uri de la emitere. Suportă plata în altă monedă
 * decât cea de calcul (ex. costuri EUR, plată RON la curs setat).
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

ensurePdfFonts();

const styles = StyleSheet.create({
  page: { padding: 52, fontFamily: "Inter", fontSize: 10, lineHeight: 1.5 },
  title: { fontSize: 16, fontWeight: 700, textAlign: "center", marginBottom: 6 },
  subtitle: { fontSize: 10, textAlign: "center", color: "#444", marginBottom: 28 },
  section: { fontSize: 11, fontWeight: 700, marginTop: 24, marginBottom: 8 },
  partyBox: { flexDirection: "row", gap: 20 },
  party: { flex: 1, borderWidth: 0.5, borderColor: "#999", padding: 12 },
  partyTitle: { fontWeight: 700, fontSize: 10, marginBottom: 6 },
  partyLine: { marginBottom: 1.5 },
  row: {
    flexDirection: "row",
    paddingVertical: 5,
    borderBottomWidth: 0.5,
    borderBottomColor: "#ddd",
  },
  rowDate: { width: 64, color: "#555" },
  rowLabel: { flex: 1 },
  rowAmount: { width: 110, textAlign: "right" },
  fxNote: { marginTop: 6, fontSize: 9, color: "#555" },
  total: {
    flexDirection: "row",
    marginTop: 12,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: "#000",
    fontSize: 13,
    fontWeight: 700,
  },
  totalLabel: { flex: 1 },
  totalAmount: { width: 140, textAlign: "right" },
  signatures: { flexDirection: "row", gap: 48, marginTop: 56 },
  signBox: { flex: 1, textAlign: "center" },
  signLine: {
    borderTopWidth: 0.5,
    borderTopColor: "#000",
    marginTop: 40,
    paddingTop: 6,
    fontSize: 9,
  },
});

const L10N = {
  ro: {
    title: (n: number) => `ANEXA NR. ${n}`,
    toContract: (c: string) => `la Contractul nr. ${c}`,
    issued: "Data emiterii",
    payer: "BENEFICIAR",
    payee: "PRESTATOR",
    address: "Adresa",
    bank: "Banca",
    representative: "Reprezentant",
    idNumber: "CI/CNP",
    services: "Servicii prestate",
    total: "TOTAL DE PLATĂ",
    notes: "Mențiuni",
    fxNote: (from: string, rate: number, to: string) =>
      `Plata se efectuează în ${to}, la cursul 1 ${from} = ${rate} ${to}.`,
  },
  en: {
    title: (n: number) => `ANNEX NO. ${n}`,
    toContract: (c: string) => `to Contract no. ${c}`,
    issued: "Issue date",
    payer: "CLIENT",
    payee: "PROVIDER",
    address: "Address",
    bank: "Bank",
    representative: "Representative",
    idNumber: "ID no.",
    services: "Services provided",
    total: "TOTAL DUE",
    notes: "Notes",
    fxNote: (from: string, rate: number, to: string) =>
      `Payment is made in ${to}, at the rate of 1 ${from} = ${rate} ${to}.`,
  },
} as const;

export type AnnexLanguage = keyof typeof L10N;

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
  service: string | null;
  amount: number;
}

export async function buildAnnexPdf(input: {
  annexNumber: number;
  contractNumber: string | null;
  issueDate: string;
  currency: string;
  language: AnnexLanguage;
  paymentCurrency: string | null;
  fxRate: number | null;
  payer: AnnexParty;
  payee: AnnexParty;
  shows: AnnexShowLine[];
  notes: string | null;
}): Promise<Buffer> {
  const t = L10N[input.language] ?? L10N.ro;
  const convert =
    input.paymentCurrency &&
    input.fxRate &&
    input.paymentCurrency !== input.currency
      ? (n: number) => Math.round(n * input.fxRate! * 100) / 100
      : null;
  const displayCurrency = convert ? input.paymentCurrency! : input.currency;
  const total = input.shows.reduce((s, l) => s + l.amount, 0);

  const partyLines = (party: AnnexParty): string[] =>
    [
      party.name,
      party.cui ? `CUI: ${party.cui}` : null,
      party.reg_com ? `Reg. Com.: ${party.reg_com}` : null,
      party.id_number ? `${t.idNumber}: ${party.id_number}` : null,
      party.address ? `${t.address}: ${party.address}` : null,
      party.iban ? `IBAN: ${party.iban}` : null,
      party.bank ? `${t.bank}: ${party.bank}` : null,
      party.representative ? `${t.representative}: ${party.representative}` : null,
    ].filter(Boolean) as string[];

  const doc = (
    <Document>
      <Page size="A4" style={styles.page}>
        <Text style={styles.title}>{t.title(input.annexNumber)}</Text>
        <Text style={styles.subtitle}>
          {input.contractNumber ? `${t.toContract(input.contractNumber)} · ` : ""}
          {t.issued}: {input.issueDate}
        </Text>

        <View style={styles.partyBox}>
          {(
            [
              [t.payer, input.payer],
              [t.payee, input.payee],
            ] as const
          ).map(([title, party]) => (
            <View key={title} style={styles.party}>
              <Text style={styles.partyTitle}>{title}</Text>
              {partyLines(party).map((line, i) => (
                <Text key={i} style={styles.partyLine}>
                  {line}
                </Text>
              ))}
            </View>
          ))}
        </View>

        <Text style={styles.section}>{t.services}</Text>
        {input.shows.map((show, i) => (
          <View key={i} style={styles.row}>
            <Text style={styles.rowDate}>{show.date}</Text>
            <Text style={styles.rowLabel}>
              {show.label}
              {show.service ? ` — ${show.service}` : ""}
              {convert ? `  (${formatMoney(show.amount, input.currency)})` : ""}
            </Text>
            <Text style={styles.rowAmount}>
              {formatMoney(convert ? convert(show.amount) : show.amount, displayCurrency)}
            </Text>
          </View>
        ))}
        {convert && (
          <Text style={styles.fxNote}>
            {t.fxNote(input.currency, input.fxRate!, input.paymentCurrency!)}
          </Text>
        )}

        <View style={styles.total}>
          <Text style={styles.totalLabel}>{t.total}</Text>
          <Text style={styles.totalAmount}>
            {formatMoney(convert ? convert(total) : total, displayCurrency)}
          </Text>
        </View>

        {input.notes && (
          <>
            <Text style={styles.section}>{t.notes}</Text>
            <Text>{input.notes}</Text>
          </>
        )}

        <View style={styles.signatures}>
          <View style={styles.signBox}>
            <Text style={styles.signLine}>
              {t.payer}
              {input.payer.representative ? ` — ${input.payer.representative}` : ""}
            </Text>
          </View>
          <View style={styles.signBox}>
            <Text style={styles.signLine}>
              {t.payee}
              {input.payee.representative
                ? ` — ${input.payee.representative}`
                : input.payee.name
                  ? ` — ${input.payee.name}`
                  : ""}
            </Text>
          </View>
        </View>
      </Page>
    </Document>
  );

  return renderToBuffer(doc);
}
