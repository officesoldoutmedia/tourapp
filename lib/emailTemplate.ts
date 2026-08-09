/**
 * Layoutul unic al emailurilor Toura (spec 2026-08-09): dark ca UI-ul,
 * table-based + stiluri inline (singurul mod fiabil în clienți de email),
 * fără imagini externe. Pur — fără server-only, ca să fie testabil.
 */

export type EmailInput = {
  title: string;
  bodyHtml: string;
  cta?: { label: string; url: string };
  infoBox?: string[];
  note?: string;
  footer: string;
};

export function esc(s: string): string {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

const BG = "#101012";
const CARD = "#18181b";
const HAIRLINE = "#2e2e33";
const TEXT = "#fafafa";
const MUTED = "#a1a1aa";
const FAINT = "#71717a";

export function renderEmail(input: EmailInput): string {
  const rows: string[] = [];

  rows.push(`<tr><td style="padding:0 0 18px;">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
      <td width="24" height="24" align="center" bgcolor="#232327" style="border:1px solid #3f3f46;border-radius:7px;font-family:-apple-system,'Segoe UI',sans-serif;font-size:12px;font-weight:700;color:${TEXT};">T</td>
      <td style="padding-left:8px;font-family:-apple-system,'Segoe UI',sans-serif;font-size:14px;font-weight:600;color:${TEXT};letter-spacing:-0.01em;">Toura</td>
    </tr></table>
  </td></tr>`);

  rows.push(`<tr><td style="padding:0 0 8px;font-family:-apple-system,'Segoe UI',sans-serif;font-size:17px;font-weight:600;color:${TEXT};">${input.title}</td></tr>`);
  rows.push(`<tr><td style="padding:0 0 18px;font-family:-apple-system,'Segoe UI',sans-serif;font-size:13.5px;line-height:1.55;color:${MUTED};">${input.bodyHtml}</td></tr>`);

  if (input.infoBox && input.infoBox.length > 0) {
    rows.push(`<tr><td style="padding:0 0 18px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
        <td bgcolor="#1f1f23" style="border:1px solid ${HAIRLINE};border-radius:8px;padding:12px 14px;font-family:-apple-system,'Segoe UI',sans-serif;font-size:12.5px;line-height:1.7;color:#d4d4d8;">${input.infoBox.join("<br>")}</td>
      </tr></table>
    </td></tr>`);
  }

  if (input.cta) {
    rows.push(`<tr><td align="center" style="padding:0 0 14px;">
      <a href="${esc(input.cta.url)}" style="display:inline-block;background:${TEXT};color:${CARD};font-family:-apple-system,'Segoe UI',sans-serif;font-size:13px;font-weight:600;padding:10px 22px;border-radius:8px;text-decoration:none;">${esc(input.cta.label)}</a>
    </td></tr>`);
  }

  if (input.note) {
    rows.push(`<tr><td align="center" style="padding:0 0 18px;font-family:-apple-system,'Segoe UI',sans-serif;font-size:11.5px;color:${FAINT};">${input.note}</td></tr>`);
  }

  rows.push(`<tr><td style="border-top:1px solid ${HAIRLINE};padding:14px 0 0;font-family:-apple-system,'Segoe UI',sans-serif;font-size:11px;line-height:1.5;color:${FAINT};">${input.footer}</td></tr>`);

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="color-scheme" content="dark">
<meta name="supported-color-schemes" content="dark">
</head>
<body bgcolor="${BG}" style="margin:0;padding:0;background:${BG};">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${BG}" style="background:${BG};"><tr><td align="center" style="padding:32px 16px;">
<table role="presentation" width="480" cellpadding="0" cellspacing="0" border="0" bgcolor="${CARD}" style="max-width:480px;width:100%;background:${CARD};border:1px solid ${HAIRLINE};border-radius:12px;"><tr><td style="padding:28px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
${rows.join("\n")}
</table>
</td></tr></table>
</td></tr></table>
</body>
</html>`;
}
