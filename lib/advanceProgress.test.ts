import { describe, expect, it } from "vitest";
import { computeAdvanceProgress } from "./advanceProgress";
import type { AdvanceLayoutItem } from "./advance";

const layouts: AdvanceLayoutItem[][] = [
  [
    { type: "field", key: "production.stage_time", required: true },
    { type: "field", key: "production.dimensions" }, // neobligatoriu — ignorat
    { type: "title", title: "Audio" },
    { type: "field", key: "logistics.parking", required: true },
  ],
];

describe("computeAdvanceProgress", () => {
  it("numără câmpurile obligatorii completate + categoriile cu fișier", () => {
    const p = computeAdvanceProgress({
      layouts,
      fieldValues: new Map([["production.stage_time", "22:30"]]),
      requiredCategoryIds: ["cat-sfx", "cat-setlist"],
      dayFileCategoryIds: ["cat-setlist"],
      manualStatuses: ["not_started"],
    });
    expect(p).toEqual({ done: 2, total: 4, percent: 50, source: "required" });
  });
  it("valoare goală/whitespace nu contează ca umplută", () => {
    const p = computeAdvanceProgress({
      layouts,
      fieldValues: new Map([["production.stage_time", "  "]]),
      requiredCategoryIds: [],
      dayFileCategoryIds: [],
      manualStatuses: [],
    });
    expect(p.done).toBe(0);
    expect(p.total).toBe(2);
  });
  it("fallback pe statusurile manuale când nu există obligatorii", () => {
    const p = computeAdvanceProgress({
      layouts: [[{ type: "field", key: "x" }]],
      fieldValues: new Map(),
      requiredCategoryIds: [],
      dayFileCategoryIds: [],
      manualStatuses: ["done", "in_progress", "done"],
    });
    expect(p).toEqual({ done: 2, total: 3, percent: 67, source: "manual" });
  });
  it("zero peste tot → 0/0, percent 0, manual", () => {
    const p = computeAdvanceProgress({
      layouts: [],
      fieldValues: new Map(),
      requiredCategoryIds: [],
      dayFileCategoryIds: [],
      manualStatuses: [],
    });
    expect(p).toEqual({ done: 0, total: 0, percent: 0, source: "manual" });
  });
  it("aceeași cheie obligatorie în două layout-uri se numără o dată", () => {
    const p = computeAdvanceProgress({
      layouts: [
        [{ type: "field", key: "a", required: true }],
        [{ type: "field", key: "a", required: true }],
      ],
      fieldValues: new Map([["a", "x"]]),
      requiredCategoryIds: [],
      dayFileCategoryIds: [],
      manualStatuses: [],
    });
    expect(p).toEqual({ done: 1, total: 1, percent: 100, source: "required" });
  });
});
