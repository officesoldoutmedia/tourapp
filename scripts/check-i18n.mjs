// Verificator i18n: fiecare t("cheie") din app trebuie să existe în
// AMBELE fișiere de mesaje. Rulat în CI local înainte de deploy.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const messages = {
  en: JSON.parse(readFileSync("messages/en.json", "utf8")),
  ro: JSON.parse(readFileSync("messages/ro.json", "utf8")),
};

function has(obj, path) {
  return path.split(".").every((k) => (obj = obj?.[k]) !== undefined);
}

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      if (![".next", "node_modules"].includes(name)) yield* walk(p);
    } else if (p.endsWith(".tsx") || p.endsWith(".ts")) yield p;
  }
}

let missing = 0;
for (const file of [...walk("app"), ...walk("components")]) {
  const src = readFileSync(file, "utf8");
  // aceeași variabilă (ex. t) poate fi legată la namespace-uri diferite
  // în componente diferite din același fișier → colectăm TOATE;
  // cheia e lipsă doar dacă nu există sub niciunul dintre ele.
  const nsMap = new Map();
  for (const m of src.matchAll(
    /const (\w+) = (?:await )?(?:getTranslations|useTranslations)\("([\w.]+)"\)/g,
  )) {
    if (!nsMap.has(m[1])) nsMap.set(m[1], new Set());
    nsMap.get(m[1]).add(m[2]);
  }
  if (nsMap.size === 0) continue;
  for (const m of src.matchAll(/(?<![\w.])(\w+)\(\s*"([\w.]+)"/g)) {
    const namespaces = nsMap.get(m[1]);
    if (!namespaces) continue;
    for (const locale of ["en", "ro"]) {
      const found = [...namespaces].some((ns) =>
        has(messages[locale], `${ns}.${m[2]}`),
      );
      if (!found) {
        console.log(
          `LIPSĂ [${locale}] {${[...namespaces].join("|")}}.${m[2]}  ← ${file}`,
        );
        missing++;
      }
    }
  }
}
if (missing) {
  console.error(`\n${missing} chei lipsă.`);
  process.exit(1);
}
console.log("i18n OK — toate cheile există în EN și RO.");
