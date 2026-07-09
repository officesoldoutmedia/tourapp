/**
 * Geografie pură pentru Tour Dashboard: distanțe pe ruta turului
 * (haversine între opririle consecutive cu coordonate) [MT parity].
 */

export function haversineKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const R = 6371;
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(lat2 - lat1);
  const dLng = rad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(a)) * 10) / 10;
}

export interface RoutePoint {
  date: string; // ISO
  lat: number;
  lng: number;
}

export interface RouteStats {
  totalKm: number;
  traveledKm: number; // segmente încheiate până azi (inclusiv)
  remainingKm: number;
}

export function tourRouteStats(points: RoutePoint[], todayKey: string): RouteStats {
  const round = (n: number) => Math.round(n);
  let total = 0;
  let traveled = 0;
  for (let i = 1; i < points.length; i++) {
    const km = haversineKm(
      points[i - 1].lat,
      points[i - 1].lng,
      points[i].lat,
      points[i].lng,
    );
    total += km;
    if (points[i].date <= todayKey) traveled += km;
  }
  return {
    totalKm: round(total),
    traveledKm: round(traveled),
    remainingKm: round(total - traveled),
  };
}
