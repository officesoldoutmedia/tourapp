import { describe, expect, it } from "vitest";
import { slugify, uniqueSlug } from "./slug";

describe("slugify", () => {
  it("normalizează diacritice, spații și majuscule", () => {
    expect(slugify("Ștefan & The Band")).toBe("stefan-the-band");
  });
  it("returnează string gol pentru input fără caractere valide", () => {
    expect(slugify("!!!")).toBe("");
  });
});

describe("uniqueSlug", () => {
  it("returnează baza când e liberă", () => {
    expect(uniqueSlug("speak", new Set(["alt"]))).toBe("speak");
  });
  it("adaugă sufix numeric la coliziune", () => {
    expect(uniqueSlug("speak", new Set(["speak", "speak-2"]))).toBe("speak-3");
  });
});
