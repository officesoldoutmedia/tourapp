import { describe, expect, it } from "vitest";
import {
  buildGuestApprovalEmail,
  buildInvitationEmail,
  buildVendorEmail,
} from "./emailMessages";

describe("buildInvitationEmail", () => {
  it("subiect EN + org escapat + link + footer de org", () => {
    const m = buildInvitationEmail({ orgName: "R&B <Live>", url: "https://toura.pro/invite/t1" });
    expect(m.subject).toBe("You're invited to R&B <Live> on Toura");
    expect(m.html).toContain("R&amp;B &lt;Live&gt;");
    expect(m.html).toContain('href="https://toura.pro/invite/t1"');
    expect(m.html).toContain("Sent by R&amp;B &lt;Live&gt; via Toura · toura.pro");
    expect(m.html).toContain("Accept invitation");
  });
});

describe("buildGuestApprovalEmail", () => {
  const base = {
    orgName: "SOM", guestName: "Andrei & Co", eventTitle: "SPEAK — Arene",
    eventDate: "2026-08-14", numTickets: 2,
    passes: [{ name: "Backstage", quantity: 1 }],
  };
  it("casetă cu bilete + pass-uri, nume escapat", () => {
    const m = buildGuestApprovalEmail(base);
    expect(m.subject).toBe("Guest list confirmed — SPEAK — Arene (2026-08-14)");
    expect(m.html).toContain("Andrei &amp; Co");
    expect(m.html).toContain("2 × tickets<br>1 × Backstage");
    expect(m.html).toContain("You're on the guest list");
  });
  it("fără bilete → doar pass-urile în casetă", () => {
    const m = buildGuestApprovalEmail({ ...base, numTickets: 0 });
    expect(m.html).not.toContain("× tickets");
    expect(m.html).toContain("1 × Backstage");
  });
});

describe("buildVendorEmail", () => {
  it("buton + valabilitate + footer org", () => {
    const m = buildVendorEmail({
      orgName: "SOM", url: "https://toura.pro/share/vendor/tok",
      expiresAt: "2026-09-13T10:00:00Z",
    });
    expect(m.subject).toBe("SOM — vendor portal access");
    expect(m.html).toContain('href="https://toura.pro/share/vendor/tok"');
    expect(m.html).toContain("Open vendor portal");
    expect(m.html).toContain("Link valid until 2026-09-13");
    expect(m.html).not.toContain("v-a invitat");
  });
});
