import { describe, expect, it } from "vitest";
import {
  MAX_VENDOR_EMPLOYEES,
  MAX_VENDOR_FILES,
  normalizeVendorEmployee,
  sanitizeFileName,
  vendorLinkState,
} from "./vendorPortal";

describe("normalizeVendorEmployee", () => {
  it("normalizează câmpurile valide (trim, shape-ul tour_personnel)", () => {
    expect(
      normalizeVendorEmployee({
        firstName: "  Andrei ", lastName: " Pop ", role: " VJ ",
        phone: "+40 722 000 111", email: "andrei@visuals.ro",
      }),
    ).toEqual({
      first_name: "Andrei", last_name: "Pop", role: "VJ",
      phones: ["+40 722 000 111"], emails: ["andrei@visuals.ro"],
    });
  });
  it("prenumele e obligatoriu; opționalele goale → null/[]", () => {
    expect(normalizeVendorEmployee({ firstName: "   " })).toBeNull();
    expect(normalizeVendorEmployee({ firstName: "Ana" })).toEqual({
      first_name: "Ana", last_name: null, role: null, phones: [], emails: [],
    });
  });
  it("respinge lungimi excesive și email invalid", () => {
    expect(normalizeVendorEmployee({ firstName: "x".repeat(81) })).toBeNull();
    expect(
      normalizeVendorEmployee({ firstName: "Ana", email: "nu-e-email" }),
    ).toBeNull();
    expect(
      normalizeVendorEmployee({ firstName: "Ana", phone: "1".repeat(41) }),
    ).toBeNull();
  });
});

describe("vendorLinkState", () => {
  const NOW = new Date("2026-08-08T12:00:00Z");
  it("revoked bate expired", () => {
    expect(
      vendorLinkState(
        { expires_at: "2026-01-01T00:00:00Z", revoked_at: "2026-02-01T00:00:00Z" },
        NOW,
      ),
    ).toBe("revoked");
  });
  it("expirat vs viu", () => {
    expect(
      vendorLinkState({ expires_at: "2026-01-01T00:00:00Z", revoked_at: null }, NOW),
    ).toBe("expired");
    expect(
      vendorLinkState({ expires_at: "2026-12-01T00:00:00Z", revoked_at: null }, NOW),
    ).toBe("live");
  });
});

describe("sanitizeFileName", () => {
  it("păstrează diacriticele, taie caracterele periculoase și limitează lungimea", () => {
    expect(sanitizeFileName('cue/sheet:"v2".pdf')).toBe("cue_sheet__v2_.pdf");
    expect(sanitizeFileName("Anexă finală.pdf")).toBe("Anexă finală.pdf");
    expect(sanitizeFileName("x".repeat(200) + ".pdf")).toHaveLength(140);
    expect(sanitizeFileName("")).toBe("file");
  });
});

describe("limite", () => {
  it("constantele exportate", () => {
    expect(MAX_VENDOR_EMPLOYEES).toBe(20);
    expect(MAX_VENDOR_FILES).toBe(30);
  });
});
