import "server-only";

/**
 * Vremea pe 2 zile pentru dashboardul zilei (blueprint §3.3 [C-S]:
 * temp max/min, precipitații %, vânt km/h, răsărit/apus).
 * Sursă: Open-Meteo — gratuit, fără cheie [N §3.3]. Cache 1h.
 */

export interface WeatherDay {
  date: string;
  tMax: number;
  tMin: number;
  precipProb: number | null;
  windMax: number;
  sunrise: string; // HH:mm local
  sunset: string;
  code: number; // WMO weather code
}

function addDaysIso(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export async function getWeather(
  lat: number,
  lng: number,
  date: string,
  tz: string,
): Promise<WeatherDay[] | null> {
  const url =
    "https://api.open-meteo.com/v1/forecast" +
    `?latitude=${lat}&longitude=${lng}` +
    "&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max,wind_speed_10m_max,sunrise,sunset,weather_code" +
    `&timezone=${encodeURIComponent(tz)}` +
    `&start_date=${date}&end_date=${addDaysIso(date, 1)}`;

  const response = await fetch(url, { next: { revalidate: 3600 } });
  if (!response.ok) return null;

  const data = (await response.json()) as {
    daily?: {
      time: string[];
      temperature_2m_max: number[];
      temperature_2m_min: number[];
      precipitation_probability_max: (number | null)[];
      wind_speed_10m_max: number[];
      sunrise: string[];
      sunset: string[];
      weather_code: number[];
    };
  };
  const daily = data.daily;
  if (!daily || daily.time.length === 0) return null;

  return daily.time.map((day, i) => ({
    date: day,
    tMax: Math.round(daily.temperature_2m_max[i]),
    tMin: Math.round(daily.temperature_2m_min[i]),
    precipProb: daily.precipitation_probability_max[i],
    windMax: Math.round(daily.wind_speed_10m_max[i]),
    sunrise: daily.sunrise[i]?.slice(11, 16) ?? "",
    sunset: daily.sunset[i]?.slice(11, 16) ?? "",
    code: daily.weather_code[i],
  }));
}

/** WMO weather code → grup pentru icon (lucide). */
export function weatherGroup(
  code: number,
): "sun" | "cloud-sun" | "cloud" | "fog" | "rain" | "snow" | "storm" {
  if (code === 0) return "sun";
  if (code <= 2) return "cloud-sun";
  if (code === 3) return "cloud";
  if (code <= 48) return "fog";
  if (code <= 67 || (code >= 80 && code <= 82)) return "rain";
  if (code <= 77 || code === 85 || code === 86) return "snow";
  return "storm";
}
