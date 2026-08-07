import { describe, expect, it } from "vitest";
import {
  collectMergeValues,
  fillTemplate,
  findMatchingTemplate,
  listMergeFields,
  MERGE_FIELD_KEYS,
  parseContractSnapshot,
  type ContractBlock,
} from "./contractMerge";

const BODY: ContractBlock[] = [
  { kind: "heading", text: "ANEXA {{doc.number}}" },
  { kind: "paragraph", text: "{{crew.entity_name}} (CUI {{crew.cui}}) prestează la {{event.city}} pe {{event.date}} pentru {{deal.fee}} {{deal.currency}} ({{deal.fee_in_words}})." },
];

describe("listMergeFields", () => {
  it("extrage cheile unice în ordinea apariției", () => {
    expect(listMergeFields(BODY)).toEqual([
      "doc.number", "crew.entity_name", "crew.cui", "event.city",
      "event.date", "deal.fee", "deal.currency", "deal.fee_in_words",
    ]);
  });
});

describe("fillTemplate", () => {
  it("umple tot când valorile există", () => {
    const values = Object.fromEntries(listMergeFields(BODY).map((k) => [k, "X"]));
    const { blocks, unresolved } = fillTemplate(BODY, values);
    expect(unresolved).toEqual([]);
    expect(blocks[0].text).toBe("ANEXA X");
    expect(blocks[1].text).not.toContain("{{");
  });
  it("raportează câmpurile goale/lipsă și le lasă gol în text", () => {
    const { blocks, unresolved } = fillTemplate(BODY, { "doc.number": "ANX-1", "crew.cui": "" });
    expect(unresolved).toEqual([
      "crew.entity_name", "crew.cui", "event.city",
      "event.date", "deal.fee", "deal.currency", "deal.fee_in_words",
    ]);
    expect(blocks[0].text).toBe("ANEXA ANX-1");
    expect(blocks[1].text).not.toContain("{{");
  });
  it("cheile necunoscute din body sunt și ele unresolved", () => {
    const { unresolved } = fillTemplate(
      [{ kind: "paragraph", text: "{{foo.bar}}" }], {},
    );
    expect(unresolved).toEqual(["foo.bar"]);
  });
});

describe("collectMergeValues", () => {
  const input = {
    issuing: { name: "ARTPROCESS", cui: "RO123", representative: "Pop Ion" },
    entity: {
      display_name: "Visuals Co", company_name: "VISUALS CO SRL", cui: "RO999",
      vat_payer: true, payment_terms_days: 15, entity_type: "srl",
    },
    role: "VJ",
    event: { date: "2026-09-20", city: "Cluj-Napoca", artist: "SPEAK", venue: "Arena" },
    fee: { amount: 3500, currency: "EUR" },
    doc: { number: "ANX-2026-0042", date: "2026-08-07", frameworkRef: "CTR-2026-0003", language: "ro" as const },
  };
  it("construiește dicționarul", () => {
    const v = collectMergeValues(input);
    expect(v["company.name"]).toBe("ARTPROCESS");
    expect(v["crew.entity_name"]).toBe("VISUALS CO SRL");
    expect(v["crew.role"]).toBe("VJ");
    expect(v["crew.vat_payer"]).toBe("DA");
    expect(v["crew.payment_terms"]).toBe("15");
    expect(v["deal.fee"]).toBe("3500");
    expect(v["deal.fee_in_words"]).toBe("trei mii cinci sute euro");
    expect(v["doc.framework_ref"]).toBe("CTR-2026-0003");
    expect(v["event.stage_time"]).toBe("");
  });
  it("PF fără company_name → display_name; en → vat YES/NO", () => {
    const v = collectMergeValues({
      ...input,
      entity: { display_name: "Coman A.", vat_payer: false, entity_type: "individual" },
      doc: { ...input.doc, language: "en" as const },
    });
    expect(v["crew.entity_name"]).toBe("Coman A.");
    expect(v["crew.vat_payer"]).toBe("NO");
    expect(v["deal.fee_in_words"]).toBe("three thousand five hundred euros");
  });
  it("toate cheile canonice există în dicționar (măcar goale)", () => {
    const v = collectMergeValues(input);
    for (const key of MERGE_FIELD_KEYS) expect(v).toHaveProperty(key);
  });
});

describe("findMatchingTemplate", () => {
  const T = (over: object) => ({
    id: "x", doc_kind: "annex", match_role: null,
    match_entity_type: null, sort_order: 0, ...over,
  });
  it("match pe rol case-insensitive + tip entitate; null = orice; ordinea sort_order", () => {
    const specific = T({ id: "s", match_role: "vj", match_entity_type: "srl", sort_order: 1 });
    const generic = T({ id: "g", sort_order: 2 });
    expect(findMatchingTemplate([generic, specific], "annex", "VJ", "srl")?.id).toBe("s");
    expect(findMatchingTemplate([generic, specific], "annex", "LD", "srl")?.id).toBe("g");
    expect(findMatchingTemplate([specific], "annex", "VJ", "pfa")).toBeNull();
    expect(findMatchingTemplate([specific], "framework", "VJ", "srl")).toBeNull();
  });
});

describe("parseContractSnapshot", () => {
  it("round-trip valid", () => {
    const snap = { title: "T", language: "ro", values: { a: "1" }, blocks: BODY };
    expect(parseContractSnapshot(snap)).toEqual(snap);
  });
  it("invalid → null; blocuri corupte filtrate", () => {
    expect(parseContractSnapshot(null)).toBeNull();
    expect(parseContractSnapshot([])).toBeNull();
    expect(
      parseContractSnapshot({ title: "T", blocks: [{ kind: "x", text: "a" }, BODY[0]] })!.blocks,
    ).toEqual([BODY[0]]);
  });
});
