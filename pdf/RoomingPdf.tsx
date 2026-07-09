/** Rooming List PDF [N §6.17.3] — grid-ul complet al hotelului. */
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

const styles = StyleSheet.create({
  page: { padding: 36, fontFamily: "Inter", fontSize: 9 },
  title: { fontSize: 16, fontFamily: "Inter", fontWeight: 700 },
  subtitle: { fontSize: 10, color: "#555", marginBottom: 12 },
  headerRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#000",
    paddingBottom: 3,
    marginBottom: 3,
    fontFamily: "Inter", fontWeight: 700,
  },
  row: {
    flexDirection: "row",
    borderBottomWidth: 0.5,
    borderBottomColor: "#ccc",
    paddingVertical: 2,
  },
  cBag: { width: "8%" },
  cName: { width: "30%" },
  cRoom: { width: "10%" },
  cType: { width: "12%" },
  cSmoke: { width: "8%" },
  cIn: { width: "12%" },
  cOut: { width: "12%" },
  cConf: { width: "8%" },
  totals: { marginTop: 8, fontFamily: "Inter", fontWeight: 700 },
});

interface RoomingInput {
  name: string;
  city: string | null;
  check_in_date: string | null;
  check_out_date: string | null;
  days: unknown;
  room_list_entries: unknown;
}

export async function buildRoomingPdf(hotel: RoomingInput): Promise<Buffer> {
  const rooms = (
    (hotel.room_list_entries ?? []) as {
      guest_name: string | null;
      bag_tag: string | null;
      room_number: string | null;
      room_type: string | null;
      smoking: boolean;
      check_in: string | null;
      check_out: string | null;
      confirmation_number: string | null;
      deleted_at: string | null;
      tour_personnel: {
        first_name: string | null;
        last_name: string | null;
        preferred_name: string | null;
      } | null;
    }[]
  ).filter((r) => r.deleted_at === null);

  // "Last, First (Preferred)" [C §6.8]
  const guestName = (room: (typeof rooms)[number]) =>
    room.guest_name ??
    `${room.tour_personnel?.last_name ?? ""}, ${room.tour_personnel?.first_name ?? ""}${
      room.tour_personnel?.preferred_name ? ` (${room.tour_personnel.preferred_name})` : ""
    }`;

  const uniqueRooms = new Set(rooms.map((r) => r.room_number).filter(Boolean)).size;
  const date = (hotel.days as { date: string } | null)?.date ?? "";

  const doc = (
    <Document title={`Rooming — ${hotel.name}`}>
      <Page size="A4" style={styles.page}>
        <Text style={styles.title}>{hotel.name}</Text>
        <Text style={styles.subtitle}>
          {[hotel.city, date].filter(Boolean).join(" · ")}
          {hotel.check_in_date &&
            `  ·  ${hotel.check_in_date} → ${hotel.check_out_date ?? "?"}`}
        </Text>

        <View style={styles.headerRow}>
          <Text style={styles.cBag}>BAG</Text>
          <Text style={styles.cName}>NAME</Text>
          <Text style={styles.cRoom}>ROOM #</Text>
          <Text style={styles.cType}>TYPE</Text>
          <Text style={styles.cSmoke}>SMOK</Text>
          <Text style={styles.cIn}>CHECK IN</Text>
          <Text style={styles.cOut}>CHECK OUT</Text>
          <Text style={styles.cConf}>CONF</Text>
        </View>
        {rooms.map((room, i) => (
          <View key={i} style={styles.row}>
            <Text style={styles.cBag}>{room.bag_tag ?? ""}</Text>
            <Text style={styles.cName}>{guestName(room)}</Text>
            <Text style={styles.cRoom}>{room.room_number ?? ""}</Text>
            <Text style={styles.cType}>{room.room_type ?? ""}</Text>
            <Text style={styles.cSmoke}>{room.smoking ? "S" : "NS"}</Text>
            <Text style={styles.cIn}>{room.check_in ?? ""}</Text>
            <Text style={styles.cOut}>{room.check_out ?? ""}</Text>
            <Text style={styles.cConf}>{room.confirmation_number ?? ""}</Text>
          </View>
        ))}

        <Text style={styles.totals}>
          {`TOTAL HOTEL GUESTS: ${rooms.length}   ·   TOTAL ROOMS: ${uniqueRooms}`}
        </Text>
      </Page>
    </Document>
  );
  return Buffer.from(await renderToBuffer(doc));
}
