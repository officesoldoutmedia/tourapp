// lib/emailTemplate.test.ts
import { describe, expect, it } from "vitest";
import { esc, renderEmail } from "./emailTemplate";

describe("esc", () => {
  it("escapează & < > \" '", () => {
    expect(esc(`Tom & Jerry <script>"'`)).toBe(
      "Tom &amp; Jerry &lt;script&gt;&quot;&#39;",
    );
  });
});

describe("renderEmail", () => {
  const base = {
    title: "You're invited to SOM",
    bodyHtml: "Join the <b>SOM</b> workspace.",
    footer: "Sent by SOM via Toura · toura.pro",
  };

  it("conține titlul, body-ul, footerul și wordmark-ul", () => {
    const html = renderEmail(base);
    expect(html).toContain("You're invited to SOM");
    expect(html).toContain("Join the <b>SOM</b> workspace.");
    expect(html).toContain("Sent by SOM via Toura · toura.pro");
    expect(html).toContain(">Toura</");
    expect(html).toContain('content="dark"');
    expect(html).toContain('bgcolor="#101012"');
  });

  it("fără cta → fără buton; cu cta → <a> cu url și label escapate", () => {
    expect(renderEmail(base)).not.toContain("border-radius:8px");
    const html = renderEmail({
      ...base,
      cta: { label: "Accept & join", url: "https://x.ro/a?b=1&c=2" },
    });
    expect(html).toContain('href="https://x.ro/a?b=1&amp;c=2"');
    expect(html).toContain("Accept &amp; join");
  });

  it("infoBox: o linie per element, unite cu <br>", () => {
    const html = renderEmail({ ...base, infoBox: ["2 × tickets", "1 × AAA"] });
    expect(html).toContain("2 × tickets<br>1 × AAA");
  });

  it("note apare doar când e dat", () => {
    expect(renderEmail(base)).not.toContain("11.5px");
    expect(renderEmail({ ...base, note: "See you there!" })).toContain(
      "See you there!",
    );
  });
});
