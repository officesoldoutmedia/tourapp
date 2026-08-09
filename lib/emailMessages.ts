/** Compunerile emailurilor din aplicație (spec 2026-08-09 §2) — funcții
 *  pure {subject, html}; trimiterea rămâne în lib/email.ts / apelanți. */
import { esc, renderEmail } from "./emailTemplate";

export type EmailMessage = { subject: string; html: string };

export function buildInvitationEmail(i: { orgName: string; url: string }): EmailMessage {
  const org = esc(i.orgName);
  return {
    subject: `You're invited to ${i.orgName} on Toura`,
    html: renderEmail({
      title: `You're invited to ${org}`,
      bodyHtml: `You've been invited to join the <b>${org}</b> workspace on Toura — tours, day sheets, guest lists and advancing in one place.`,
      cta: { label: "Accept invitation", url: i.url },
      note: "If you weren't expecting this, you can ignore this email.",
      footer: `Sent by ${org} via Toura · toura.pro`,
    }),
  };
}

export function buildGuestApprovalEmail(i: {
  orgName: string;
  guestName: string;
  eventTitle: string;
  eventDate: string;
  numTickets: number;
  passes: { name: string; quantity: number }[];
}): EmailMessage {
  const infoBox = [
    ...(i.numTickets > 0 ? [`${i.numTickets} × tickets`] : []),
    ...i.passes.map((p) => `${p.quantity} × ${esc(p.name)}`),
  ];
  return {
    subject: `Guest list confirmed — ${i.eventTitle} (${i.eventDate})`,
    html: renderEmail({
      title: "You're on the guest list 🎟️",
      bodyHtml: `<b>${esc(i.guestName)}</b> is confirmed for <b>${esc(i.eventTitle)}</b> — ${esc(i.eventDate)}.`,
      infoBox,
      note: "Show this email at the entrance. See you there!",
      footer: `Sent by ${esc(i.orgName)} via Toura · toura.pro`,
    }),
  };
}

export function buildVendorEmail(i: {
  orgName: string;
  url: string;
  expiresAt: string;
}): EmailMessage {
  const org = esc(i.orgName);
  return {
    subject: `${i.orgName} — vendor portal access`,
    html: renderEmail({
      title: "Vendor portal access",
      bodyHtml: `<b>${org}</b> invited you to the vendor portal for this show. Add your team and upload the files your department needs.`,
      cta: { label: "Open vendor portal", url: i.url },
      note: `Link valid until ${esc(String(i.expiresAt).slice(0, 10))}`,
      footer: `Sent by ${org} via Toura · toura.pro`,
    }),
  };
}
