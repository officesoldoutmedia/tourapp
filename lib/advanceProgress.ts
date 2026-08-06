/** Advancing % din itemi obligatorii (SP3b, spec §2). Pur — fără fetch. */
import type { AdvanceLayoutItem } from "./advance";

export interface AdvanceProgressInput {
  layouts: AdvanceLayoutItem[][];
  fieldValues: ReadonlyMap<string, string>;
  requiredCategoryIds: string[];
  dayFileCategoryIds: string[]; // categoriile fișierelor REALE ale zilei
  manualStatuses: string[];     // fallback: statusurile advances
}

export interface AdvanceProgress {
  done: number;
  total: number;
  percent: number;
  source: "required" | "manual";
}

export function computeAdvanceProgress(
  input: AdvanceProgressInput,
): AdvanceProgress {
  const requiredKeys = new Set<string>();
  for (const layout of input.layouts) {
    for (const item of layout) {
      if (item.type === "field" && item.required) requiredKeys.add(item.key);
    }
  }
  const filled = [...requiredKeys].filter(
    (k) => (input.fieldValues.get(k) ?? "").trim() !== "",
  ).length;

  const catSet = new Set(input.dayFileCategoryIds);
  const catsDone = input.requiredCategoryIds.filter((c) => catSet.has(c)).length;

  const total = requiredKeys.size + input.requiredCategoryIds.length;
  if (total === 0) {
    const mTotal = input.manualStatuses.length;
    const mDone = input.manualStatuses.filter((s) => s === "done").length;
    return {
      done: mDone,
      total: mTotal,
      percent: mTotal > 0 ? Math.round((mDone / mTotal) * 100) : 0,
      source: "manual",
    };
  }
  const done = filled + catsDone;
  return {
    done,
    total,
    percent: Math.round((done / total) * 100),
    source: "required",
  };
}
