/** C3 — PDF-ul documentelor de contract (cadru/anexă), randat EXCLUSIV
 *  din merge_snapshot (blocurile sunt deja umplute la generare). */
import {
  Document,
  Page,
  StyleSheet,
  Text,
  View,
  renderToBuffer,
} from "@react-pdf/renderer";
import { ensurePdfFonts } from "./fonts";
import type { ContractSnapshot } from "@/lib/contractMerge";

ensurePdfFonts();

const styles = StyleSheet.create({
  page: { padding: 52, fontFamily: "Inter", fontSize: 10, lineHeight: 1.6 },
  docNumber: { fontSize: 9, color: "#555", textAlign: "right", marginBottom: 12 },
  title: { fontSize: 14, fontWeight: 700, textAlign: "center", marginBottom: 4 },
  date: { fontSize: 9, color: "#555", textAlign: "center", marginBottom: 24 },
  heading: { fontSize: 11, fontWeight: 700, marginTop: 16, marginBottom: 6 },
  paragraph: { marginBottom: 8, textAlign: "justify" },
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

const SIGN_LABELS = {
  ro: ["BENEFICIAR", "PRESTATOR"],
  en: ["CLIENT", "PROVIDER"],
} as const;

export async function buildContractPdf(input: {
  docNumber: string;
  docDate: string;
  snapshot: ContractSnapshot;
}): Promise<Buffer> {
  const lang = input.snapshot.language === "en" ? "en" : "ro";
  const [payerLabel, payeeLabel] = SIGN_LABELS[lang];
  const values = input.snapshot.values;

  const doc = (
    <Document>
      <Page size="A4" style={styles.page}>
        <Text style={styles.docNumber}>{input.docNumber}</Text>
        <Text style={styles.title}>{input.snapshot.title}</Text>
        <Text style={styles.date}>{input.docDate}</Text>
        {input.snapshot.blocks.map((block, i) =>
          block.kind === "heading" ? (
            <Text key={i} style={styles.heading}>{block.text}</Text>
          ) : (
            <Text key={i} style={styles.paragraph}>{block.text}</Text>
          ),
        )}
        <View style={styles.signatures}>
          <View style={styles.signBox}>
            <Text style={styles.signLine}>
              {payerLabel}
              {values["company.name"] ? ` — ${values["company.name"]}` : ""}
              {values["company.rep"] ? ` / ${values["company.rep"]}` : ""}
            </Text>
          </View>
          <View style={styles.signBox}>
            <Text style={styles.signLine}>
              {payeeLabel}
              {values["crew.entity_name"] ? ` — ${values["crew.entity_name"]}` : ""}
              {values["crew.rep"] ? ` / ${values["crew.rep"]}` : ""}
            </Text>
          </View>
        </View>
      </Page>
    </Document>
  );
  return renderToBuffer(doc);
}
