import { Font } from "@react-pdf/renderer";

/**
 * Font unic pentru toate PDF-urile: Inter cu latin-ext — Helvetica
 * built-in NU are diacritice românești (ă/ș/ț cădeau din documente).
 * Fișierele stau în public/ și se încarcă prin URL (merge și pe
 * Cloudflare Workers, unde nu există filesystem).
 */
const base = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

let registered = false;
export function ensurePdfFonts() {
  if (registered) return;
  registered = true;
  Font.register({
    family: "Inter",
    fonts: [
      { src: `${base}/pdf-fonts/Inter-400.ttf`, fontWeight: 400 },
      { src: `${base}/pdf-fonts/Inter-500.ttf`, fontWeight: 500 },
      { src: `${base}/pdf-fonts/Inter-700.ttf`, fontWeight: 700 },
    ],
  });
  // fără despărțire în silabe — datele tehnice nu se rup
  Font.registerHyphenationCallback((word) => [word]);
}
