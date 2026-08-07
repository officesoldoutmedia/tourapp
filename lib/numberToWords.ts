/** C3 §13.5 — suma în litere, obligatorie în contractele RO. */

const RO_UNITS = ["zero", "unu", "doi", "trei", "patru", "cinci", "șase", "șapte", "opt", "nouă"];
const RO_TEENS = ["zece", "unsprezece", "doisprezece", "treisprezece", "paisprezece",
  "cincisprezece", "șaisprezece", "șaptesprezece", "optsprezece", "nouăsprezece"];
const RO_TENS = ["", "", "douăzeci", "treizeci", "patruzeci", "cincizeci",
  "șaizeci", "șaptezeci", "optzeci", "nouăzeci"];
// forma feminină pt. acordul cu „mie/mii": 1 → una, 2 → două
const RO_FEM: Record<string, string> = { unu: "una", doi: "două" };

function roUnder100(n: number, feminine: boolean): string {
  if (n < 10) {
    const w = RO_UNITS[n];
    return feminine ? (RO_FEM[w] ?? w) : w;
  }
  if (n < 20) return RO_TEENS[n - 10];
  const tens = RO_TENS[Math.floor(n / 10)];
  const rest = n % 10;
  if (!rest) return tens;
  const w = RO_UNITS[rest];
  return `${tens} și ${feminine ? (RO_FEM[w] ?? w) : w}`;
}

function roUnder1000(n: number, feminine: boolean): string {
  if (n < 100) return roUnder100(n, feminine);
  const h = Math.floor(n / 100);
  const hundreds = h === 1 ? "o sută" : h === 2 ? "două sute" : `${RO_UNITS[h]} sute`;
  const rest = n % 100;
  return rest ? `${hundreds} ${roUnder100(rest, feminine)}` : hundreds;
}

/** „de" apare când numărul dinaintea scalei NU se termină în 1–19 (ex. „douăzeci de mii"). */
function roNeedsDe(n: number): boolean {
  const last = n % 100;
  return !(last >= 1 && last <= 19);
}

export function numberToWordsRo(n: number): string {
  const v = Math.floor(Math.abs(n));
  if (v === 0) return "zero";
  const parts: string[] = [];
  const millions = Math.floor(v / 1_000_000);
  const thousands = Math.floor((v % 1_000_000) / 1000);
  const rest = v % 1000;
  if (millions) {
    // neutru: pluralul ia forma feminină („două milioane")
    if (millions === 1) parts.push("un milion");
    else parts.push(`${roUnder1000(millions, true)}${roNeedsDe(millions) ? " de" : ""} milioane`);
  }
  if (thousands) {
    if (thousands === 1) parts.push("o mie");
    else parts.push(`${roUnder1000(thousands, true)}${roNeedsDe(thousands) ? " de" : ""} mii`);
  }
  if (rest) parts.push(roUnder1000(rest, false));
  return parts.join(" ");
}

const EN_UNITS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine",
  "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen",
  "eighteen", "nineteen"];
const EN_TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];

function enUnder1000(n: number): string {
  if (n < 20) return EN_UNITS[n];
  if (n < 100) {
    const t = EN_TENS[Math.floor(n / 10)];
    return n % 10 ? `${t}-${EN_UNITS[n % 10]}` : t;
  }
  const rest = n % 100;
  return `${EN_UNITS[Math.floor(n / 100)]} hundred${rest ? ` ${enUnder1000(rest)}` : ""}`;
}

export function numberToWordsEn(n: number): string {
  const v = Math.floor(Math.abs(n));
  if (v === 0) return "zero";
  const parts: string[] = [];
  const millions = Math.floor(v / 1_000_000);
  const thousands = Math.floor((v % 1_000_000) / 1000);
  const rest = v % 1000;
  if (millions) parts.push(`${enUnder1000(millions)} million`);
  if (thousands) parts.push(`${enUnder1000(thousands)} thousand`);
  if (rest) parts.push(enUnder1000(rest));
  return parts.join(" ");
}

const CURRENCY_WORDS: Record<string, { ro: [string, string]; en: [string, string] }> = {
  RON: { ro: ["lei", "bani"], en: ["lei", "bani"] },
  EUR: { ro: ["euro", "eurocenți"], en: ["euros", "cents"] },
  USD: { ro: ["dolari", "cenți"], en: ["dollars", "cents"] },
};

export function amountInWords(
  amount: number,
  currency: string,
  lang: "ro" | "en",
): string {
  const words = lang === "ro" ? numberToWordsRo : numberToWordsEn;
  const whole = Math.floor(Math.abs(amount));
  const cents = Math.round((Math.abs(amount) - whole) * 100);
  const cw = CURRENCY_WORDS[currency.toUpperCase()];
  const main = `${words(whole)} ${cw ? cw[lang][0] : currency.toUpperCase()}`;
  if (!cents) return main;
  const centsWord = cw ? cw[lang][1] : "";
  if (lang === "ro") {
    // „cincizeci și șase de bani" — regula lui „de" ca la scale
    const de = roNeedsDe(cents) ? " de" : "";
    return `${main} și ${words(cents)}${de} ${centsWord}`.trim();
  }
  return `${main} and ${words(cents)} ${centsWord}`.trim();
}
