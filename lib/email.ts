import "server-only";

import { buildGuestApprovalEmail } from "./emailMessages";

/**
 * Email tranzacțional prin Resend (blueprint §2.1). Fără RESEND_API_KEY
 * (dev local, §2.4) → mod log: emailul se scrie în consolă, nu se trimite.
 */

const FROM = process.env.EMAIL_FROM ?? "Toura <onboarding@resend.dev>";

export async function sendEmail(input: {
  to: string;
  subject: string;
  html: string;
}): Promise<{ error?: string }> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.log(`[email:dev] to=${input.to} subject="${input.subject}"\n${input.html}`);
    return {};
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: FROM,
      to: [input.to],
      subject: input.subject,
      html: input.html,
    }),
  });
  if (!response.ok) {
    const detail = await response.text();
    console.error("[email] resend failed:", response.status, detail);
    return { error: `resend_${response.status}` };
  }
  return {};
}

/**
 * [C §6.9.1] Emailul de aprobare guest list: numărul de bilete și pass
 * types-urile aprobate. Trimis DOAR dacă toggle-ul org-ului e ON și
 * requestul are Email Notify — verificate de apelant.
 */
export async function sendGuestApprovalEmail(input: {
  to: string;
  orgName: string;
  guestName: string;
  eventTitle: string;
  eventDate: string;
  numTickets: number;
  passes: { name: string; quantity: number }[];
}): Promise<{ error?: string }> {
  const { to, ...rest } = input;
  const message = buildGuestApprovalEmail(rest);
  return sendEmail({ to, subject: message.subject, html: message.html });
}
