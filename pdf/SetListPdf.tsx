/**
 * Set List PDF (blueprint §6.17.3) — stage-ready, font mare, alb-negru.
 * Randat server-side în /api/pdf/setlist/[eventId].
 */
import {
  Document,
  Page,
  StyleSheet,
  Text,
  View,
  renderToBuffer,
} from "@react-pdf/renderer";
import { formatMmSs, setListTotals } from "@/lib/setlist";

export interface SetListPdfData {
  eventTitle: string;
  date: string;
  items: {
    item_type: "song" | "break";
    title: string;
    length_seconds: number | null;
    guest_performers: string | null;
  }[];
}

const styles = StyleSheet.create({
  page: { padding: 40, fontFamily: "Helvetica" },
  header: { fontSize: 14, color: "#555", marginBottom: 4 },
  title: { fontSize: 22, fontFamily: "Helvetica-Bold", marginBottom: 20 },
  song: {
    fontSize: 26,
    fontFamily: "Helvetica-Bold",
    marginBottom: 10,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  breakRow: {
    fontSize: 16,
    color: "#666",
    marginVertical: 8,
    padding: 6,
    backgroundColor: "#eee",
  },
  guest: { fontSize: 12, color: "#444", marginTop: -8, marginBottom: 8 },
  totals: {
    marginTop: 24,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: "#000",
    fontSize: 12,
    color: "#333",
  },
});

export async function buildSetListPdf(data: SetListPdfData): Promise<Buffer> {
  const totals = setListTotals(data.items);
  const doc = (
    <Document title={`Set List — ${data.eventTitle}`}>
      <Page size="A4" style={styles.page}>
        <Text style={styles.header}>{data.date}</Text>
        <Text style={styles.title}>{data.eventTitle}</Text>
        {data.items.map((item, idx) =>
          item.item_type === "break" ? (
            <Text key={idx} style={styles.breakRow}>
              — {item.title} —
            </Text>
          ) : (
            <View key={idx}>
              <View style={styles.song}>
                <Text>{`${idx + 1}. ${item.title}`}</Text>
                {item.length_seconds != null && (
                  <Text>{formatMmSs(item.length_seconds)}</Text>
                )}
              </View>
              {item.guest_performers && (
                <Text style={styles.guest}>w/ {item.guest_performers}</Text>
              )}
            </View>
          ),
        )}
        <Text style={styles.totals}>
          {`${totals.songs} songs · ${totals.breaks} breaks · ${formatMmSs(totals.totalSeconds)}`}
        </Text>
      </Page>
    </Document>
  );
  return Buffer.from(await renderToBuffer(doc));
}
