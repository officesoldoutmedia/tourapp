import { Font } from "@react-pdf/renderer";
import { inter400, inter500, inter700 } from "./fonts-data";

/**
 * Font unic pentru toate PDF-urile: Inter cu latin-ext — Helvetica
 * built-in NU are diacritice românești (ă/ș/ț cădeau din documente).
 * Fonturile sunt înglobate în bundle ca data-URI base64: pe Cloudflare
 * Workers un fetch către propriul domeniu ocolește layerul de assets
 * (răspundea 404), iar așa PDF-urile nu depind deloc de rețea.
 */
let registered = false;
export function ensurePdfFonts() {
  if (registered) return;
  registered = true;
  Font.register({
    family: "Inter",
    fonts: [
      { src: `data:font/ttf;base64,${inter400}`, fontWeight: 400 },
      { src: `data:font/ttf;base64,${inter500}`, fontWeight: 500 },
      { src: `data:font/ttf;base64,${inter700}`, fontWeight: 700 },
    ],
  });
  // fără despărțire în silabe — datele tehnice nu se rup
  Font.registerHyphenationCallback((word) => [word]);
}
