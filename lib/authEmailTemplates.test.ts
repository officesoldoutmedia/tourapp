// lib/authEmailTemplates.test.ts
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { AUTH_EMAILS } from "./authEmailTemplates";

const DIR = join(__dirname, "..", "docs", "email-templates");

describe("docs/email-templates sincron cu renderEmail", () => {
  for (const t of AUTH_EMAILS) {
    it(t.file, () => {
      if (process.env.WRITE_EMAIL_TEMPLATES === "1") {
        mkdirSync(DIR, { recursive: true });
        writeFileSync(join(DIR, t.file), t.html);
      }
      expect(readFileSync(join(DIR, t.file), "utf8")).toBe(t.html);
    });
  }

  it("linkurile folosesc token_hash prin /auth/confirm", () => {
    for (const t of AUTH_EMAILS) {
      expect(t.html).toContain("/auth/confirm?token_hash={{ .TokenHash }}&amp;type=");
    }
  });
});
