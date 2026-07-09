/** Day Sheet PDF (§6.17.1–2) — o pagină+ per zi, template curat predefinit [N]. */
import {
  Document,
  Page,
  StyleSheet,
  Text,
  View,
  renderToBuffer,
} from "@react-pdf/renderer";
import { ensurePdfFonts } from "./fonts";
ensurePdfFonts();
import type { DaySheetData } from "@/lib/daysheet";
import { formatTimeInZone, formatDayHeader } from "@/lib/datetime";

const styles = StyleSheet.create({
  page: { padding: 36, fontFamily: "Inter", fontSize: 10 },
  tour: { fontSize: 10, color: "#666" },
  title: { fontSize: 18, fontFamily: "Inter", fontWeight: 700, marginBottom: 2 },
  subtitle: { fontSize: 11, color: "#444", marginBottom: 14 },
  section: { marginBottom: 10 },
  sectionTitle: {
    fontSize: 9,
    fontFamily: "Inter", fontWeight: 700,
    color: "#888",
    textTransform: "uppercase",
    borderBottomWidth: 1,
    borderBottomColor: "#ddd",
    marginBottom: 4,
    paddingBottom: 2,
  },
  row: { flexDirection: "row", marginBottom: 2 },
  time: { width: 80, fontFamily: "Inter", fontWeight: 700 },
  cell: { flex: 1 },
  note: { color: "#333", marginBottom: 2 },
  small: { fontSize: 8, color: "#666" },
});

function clock(t: string | null): string {
  return t ? t.slice(0, 5) : "";
}

function DaySheetPage({ day, locale }: { day: DaySheetData; locale: string }) {
  const tz = day.timezone ?? "UTC";
  return (
    <Page size="A4" style={styles.page}>
      <Text style={styles.tour}>{day.tour}</Text>
      <Text style={styles.title}>
        {[day.city, day.country].filter(Boolean).join(", ") || day.day_type}
      </Text>
      <Text style={styles.subtitle}>
        {formatDayHeader(day.date, tz, locale)} · {day.day_type}
      </Text>

      {day.general_notes && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Notes</Text>
          <Text style={styles.note}>{day.general_notes}</Text>
        </View>
      )}

      {day.schedule.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Schedule</Text>
          {day.schedule.map((item, i) => (
            <View key={i} style={styles.row}>
              <Text style={styles.time}>
                {item.start_at ? formatTimeInZone(new Date(item.start_at), tz) : "—"}
                {item.end_at ? `–${formatTimeInZone(new Date(item.end_at), tz)}` : ""}
              </Text>
              <Text style={styles.cell}>
                {item.title}
                {item.is_confirmed ? "  ✓" : ""}
              </Text>
            </View>
          ))}
        </View>
      )}

      {day.events.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Event</Text>
          {day.events.map((event, i) => (
            <View key={i} style={styles.row}>
              <Text style={styles.cell}>
                {event.title}
                {event.address ? ` — ${event.address}` : ""}
                {event.capacity != null ? ` (cap. ${event.capacity})` : ""}
              </Text>
            </View>
          ))}
        </View>
      )}

      {day.travel.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Travel</Text>
          {day.travel_notes && <Text style={styles.note}>{day.travel_notes}</Text>}
          {day.travel.map((item, i) => (
            <View key={i} style={styles.row}>
              <Text style={styles.time}>
                {clock(item.depart_time)}
                {item.arrive_time ? `–${clock(item.arrive_time)}` : ""}
              </Text>
              <Text style={styles.cell}>
                {item.party ? `[${item.party}] ` : ""}
                {item.title ?? "Travel"}
              </Text>
            </View>
          ))}
        </View>
      )}

      {day.hotels.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Hotels</Text>
          {day.hotel_notes && <Text style={styles.note}>{day.hotel_notes}</Text>}
          {day.hotels.map((hotel, i) => (
            <View key={i}>
              <View style={styles.row}>
                <Text style={styles.cell}>
                  {hotel.name}
                  {hotel.city ? `, ${hotel.city}` : ""}
                  {hotel.check_in_date
                    ? `  (${hotel.check_in_date} → ${hotel.check_out_date ?? "?"})`
                    : ""}
                </Text>
              </View>
              {hotel.rooms.map((room, j) => (
                <Text key={j} style={styles.small}>
                  {`   ${room.room_number ?? "—"}  ${room.name}${room.room_type ? ` (${room.room_type})` : ""}`}
                </Text>
              ))}
            </View>
          ))}
        </View>
      )}

      {day.tasks.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Tasks</Text>
          {day.tasks.map((task, i) => (
            <Text key={i} style={styles.note}>
              {task.is_complete ? "☑" : "☐"} {task.title}
            </Text>
          ))}
        </View>
      )}
    </Page>
  );
}

export async function buildDaySheetPdf(
  days: DaySheetData[],
  locale = "ro",
): Promise<Buffer> {
  const doc = (
    <Document title={`Day Sheet — ${days[0]?.tour ?? ""}`}>
      {days.map((day) => (
        <DaySheetPage key={day.date} day={day} locale={locale} />
      ))}
    </Document>
  );
  return Buffer.from(await renderToBuffer(doc));
}
