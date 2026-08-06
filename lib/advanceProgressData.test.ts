import { describe, expect, it } from "vitest";
import { computeProgressOfDays } from "./advanceProgressData";
import type { AdvanceLayoutItem } from "./advance";

const layout: AdvanceLayoutItem[] = [{ type: "field", key: "production.stage_time", required: true }];

describe("computeProgressOfDays", () => {
  it("zi non-show cu categorie obligatorie → categoria NU intră în total", () => {
    const result = computeProgressOfDays({
      days: [{ id: "day-1", day_type: "travel" }],
      dayOfEvent: new Map([["event-1", "day-1"]]),
      advanceRows: [{ event_id: "event-1", status: "not_started", layout }],
      fieldValueRows: [{ event_id: "event-1", field_key: "production.stage_time", value: "22:30" }],
      fileRows: [],
      requiredCategoryIds: ["cat-sfx"],
    });
    // fără categoria obligatorie în total: doar câmpul required din layout
    // (completat) — 1/1, 100%; categoria NU se adaugă pentru zi non-show.
    expect(result.get("day-1")).toEqual({ done: 1, total: 1, percent: 100, source: "required" });
  });

  it("zi show cu categorie obligatorie → categoria intră în total", () => {
    const result = computeProgressOfDays({
      days: [{ id: "day-1", day_type: "show" }],
      dayOfEvent: new Map([["event-1", "day-1"]]),
      advanceRows: [{ event_id: "event-1", status: "not_started", layout }],
      fieldValueRows: [{ event_id: "event-1", field_key: "production.stage_time", value: "22:30" }],
      fileRows: [],
      requiredCategoryIds: ["cat-sfx"],
    });
    // câmp obligatoriu completat (1) + categoria obligatorie fără fișier (0) = 1/2.
    expect(result.get("day-1")).toEqual({ done: 1, total: 2, percent: 50, source: "required" });
  });

  it("excluderea superseded + placeholder e identică peste tot: head cu status 'superseded' nu contează ca fișier real", () => {
    const result = computeProgressOfDays({
      days: [{ id: "day-1", day_type: "show" }],
      dayOfEvent: new Map(),
      advanceRows: [],
      fieldValueRows: [],
      fileRows: [
        {
          id: "file-1",
          supersedes_id: null,
          created_at: "2026-01-01T00:00:00Z",
          parent_id: "day-1",
          category_id: "cat-sfx",
          storage_path: "path/to/file",
          status: "superseded",
        },
      ],
      requiredCategoryIds: ["cat-sfx"],
    });
    expect(result.get("day-1")).toEqual({ done: 0, total: 1, percent: 0, source: "required" });
  });

  it("head cu storage_path null (placeholder) nu contează ca fișier real", () => {
    const result = computeProgressOfDays({
      days: [{ id: "day-1", day_type: "show" }],
      dayOfEvent: new Map(),
      advanceRows: [],
      fieldValueRows: [],
      fileRows: [
        {
          id: "file-1",
          supersedes_id: null,
          created_at: "2026-01-01T00:00:00Z",
          parent_id: "day-1",
          category_id: "cat-sfx",
          storage_path: null,
          status: "draft",
        },
      ],
      requiredCategoryIds: ["cat-sfx"],
    });
    expect(result.get("day-1")).toEqual({ done: 0, total: 1, percent: 0, source: "required" });
  });

  it("merge any-filled determinist: două event-uri pe aceeași zi, un singur field_key completat câștigă indiferent de ordine", () => {
    const result = computeProgressOfDays({
      days: [{ id: "day-1", day_type: "show" }],
      dayOfEvent: new Map([
        ["event-1", "day-1"],
        ["event-2", "day-1"],
      ]),
      advanceRows: [
        { event_id: "event-1", status: "not_started", layout },
        { event_id: "event-2", status: "not_started", layout },
      ],
      fieldValueRows: [
        { event_id: "event-1", field_key: "production.stage_time", value: "" },
        { event_id: "event-2", field_key: "production.stage_time", value: "22:30" },
      ],
      fileRows: [],
      requiredCategoryIds: [],
    });
    expect(result.get("day-1")).toEqual({ done: 1, total: 1, percent: 100, source: "required" });
  });

  it("dealRequiredByDay înlocuiește setul org pentru ziua respectivă", () => {
    // zi show cu categoria org-required c1 nesatisfăcută, dar deal-ul cere doar c2 (satisfăcută)
    const result = computeProgressOfDays({
      days: [{ id: "d1", day_type: "show" }],
      dayOfEvent: new Map([["e1", "d1"]]),
      advanceRows: [],
      fieldValueRows: [],
      fileRows: [
        { id: "f1", parent_id: "d1", category_id: "c2", storage_path: "p",
          status: "final", supersedes_id: null, created_at: "2026-01-01" },
      ],
      requiredCategoryIds: ["c1"],
      dealRequiredByDay: new Map([["d1", ["c2"]]]),
    });
    expect(result.get("d1")).toMatchObject({ done: 1, total: 1 });
  });
  it("zi absentă din dealRequiredByDay → setul org (comportament vechi)", () => {
    const result = computeProgressOfDays({
      days: [{ id: "d1", day_type: "show" }],
      dayOfEvent: new Map(),
      advanceRows: [],
      fieldValueRows: [],
      fileRows: [],
      requiredCategoryIds: ["c1"],
      dealRequiredByDay: new Map(),
    });
    expect(result.get("d1")).toMatchObject({ done: 0, total: 1 });
  });
});
