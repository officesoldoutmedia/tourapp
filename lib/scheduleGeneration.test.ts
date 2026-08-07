import { describe, expect, it } from "vitest";
import {
  buildScheduleRows,
  captureTemplateItems,
  findShowSlot,
  formatShowOffset,
  minutesToClock,
  recalcScheduleUpdates,
} from "./scheduleGeneration";

// Zi de referință: 2026-09-15, Europe/Bucharest (EEST, UTC+3).
const DATE = "2026-09-15";
const TZ = "Europe/Bucharest";
// Show 22:30 local = 19:30 UTC.
const SHOW_AT = new Date("2026-09-15T19:30:00.000Z");

describe("buildScheduleRows", () => {
  it("itemii day se calculează ca azi (tz-aware), fără proveniență", () => {
    const rows = buildScheduleRows({
      items: [{ title: "Breakfast", offset_min: 9 * 60, duration_min: 30 }],
      date: DATE, tz: TZ, showAt: SHOW_AT,
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].start_at).toBe("2026-09-15T06:00:00.000Z"); // 09:00 EEST
    expect(rows[0].end_at).toBe("2026-09-15T06:30:00.000Z");
    expect(rows[0].generated_anchor).toBeNull();
    expect(rows[0].generated_offset_min).toBeNull();
    expect(rows[0].time_priority).toBe(0);
  });

  it("itemii show primesc T+offset și proveniența", () => {
    const rows = buildScheduleRows({
      items: [
        { title: "Load-in", offset_min: -480, anchor: "show" },
        { title: "Load-out", offset_min: 90, duration_min: 60, anchor: "show" },
      ],
      date: DATE, tz: TZ, showAt: SHOW_AT,
    });
    expect(rows[0].start_at).toBe("2026-09-15T11:30:00.000Z"); // T−8h = 14:30 EEST
    expect(rows[0].generated_anchor).toBe("show");
    expect(rows[0].generated_offset_min).toBe(-480);
    // T+1h30 = 24:00 → peste miezul nopții, rămâne pe aceeași zi (day_id)
    expect(rows[1].start_at).toBe("2026-09-15T21:00:00.000Z");
    expect(rows[1].end_at).toBe("2026-09-15T22:00:00.000Z");
  });

  it("fără T: itemii show intră fără oră, cu time_priority din ordinea offset-urilor", () => {
    const rows = buildScheduleRows({
      items: [
        { title: "Load-out", offset_min: 90, anchor: "show" },
        { title: "Fix", offset_min: 600 },
        { title: "Load-in", offset_min: -480, anchor: "show" },
      ],
      date: DATE, tz: TZ, showAt: null,
    });
    const loadOut = rows.find((r) => r.title === "Load-out")!;
    const loadIn = rows.find((r) => r.title === "Load-in")!;
    const fix = rows.find((r) => r.title === "Fix")!;
    expect(loadIn.start_at).toBeNull();
    expect(loadIn.generated_anchor).toBe("show");
    expect(loadIn.time_priority).toBe(0); // −480 înaintea lui +90
    expect(loadOut.time_priority).toBe(1);
    expect(fix.start_at).toBe("2026-09-15T07:00:00.000Z"); // day items neafectate
  });

  it("sort_order urmează ordinea din template", () => {
    const rows = buildScheduleRows({
      items: [
        { title: "A", offset_min: 0, anchor: "show" },
        { title: "B", offset_min: 60 },
      ],
      date: DATE, tz: TZ, showAt: SHOW_AT,
    });
    expect(rows.map((r) => r.sort_order)).toEqual([0, 1]);
  });
});

describe("recalcScheduleUpdates", () => {
  const base = {
    end_at: null, is_confirmed: false,
    generated_anchor: "show", generated_offset_min: -480,
  };
  it("mută doar neconfirmații generați relativ la show", () => {
    const updates = recalcScheduleUpdates(
      [
        { id: "a", start_at: "2026-09-15T10:00:00.000Z", ...base },
        { id: "b", start_at: "2026-09-15T10:00:00.000Z", ...base, is_confirmed: true },
        { id: "c", start_at: "2026-09-15T10:00:00.000Z", ...base, generated_anchor: null },
        { id: "d", start_at: null, ...base, generated_offset_min: null },
      ],
      SHOW_AT,
    );
    expect(updates).toEqual([
      { id: "a", start_at: "2026-09-15T11:30:00.000Z", end_at: null },
    ]);
  });
  it("păstrează durata actuală a itemului", () => {
    const updates = recalcScheduleUpdates(
      [{
        id: "a", start_at: "2026-09-15T10:00:00.000Z",
        end_at: "2026-09-15T10:45:00.000Z", is_confirmed: false,
        generated_anchor: "show", generated_offset_min: 90,
      }],
      SHOW_AT,
    );
    expect(updates[0].start_at).toBe("2026-09-15T21:00:00.000Z");
    expect(updates[0].end_at).toBe("2026-09-15T21:45:00.000Z");
  });
  it("itemii netimpați generați se așază la recalcul", () => {
    const updates = recalcScheduleUpdates(
      [{
        id: "a", start_at: null, end_at: null, is_confirmed: false,
        generated_anchor: "show", generated_offset_min: -120,
      }],
      SHOW_AT,
    );
    expect(updates[0].start_at).toBe("2026-09-15T17:30:00.000Z");
    expect(updates[0].end_at).toBeNull();
  });
});

describe("captureTemplateItems", () => {
  const show = { id: "show-1", startAt: SHOW_AT };
  it("cu slot Show: itemii timpați devin relativi la T, Show-ul e exclus", () => {
    const items = captureTemplateItems(
      [
        { id: "show-1", title: "Show", item_type: "schedule", start_at: SHOW_AT.toISOString(), end_at: null },
        { id: "b", title: "Load-in", item_type: "schedule", start_at: "2026-09-15T11:30:00.000Z", end_at: "2026-09-15T12:30:00.000Z" },
        { id: "c", title: "De confirmat", item_type: "schedule", start_at: null, end_at: null },
      ],
      TZ, show,
    );
    expect(items).toEqual([
      { title: "Load-in", offset_min: -480, duration_min: 60, type: "schedule", anchor: "show" },
      { title: "De confirmat", offset_min: 0, type: "schedule" },
    ]);
  });
  it("fără slot Show: comportamentul de azi (oră fixă din ceasul local)", () => {
    const items = captureTemplateItems(
      [{ id: "b", title: "Breakfast", item_type: "schedule", start_at: "2026-09-15T06:00:00.000Z", end_at: null }],
      TZ, null,
    );
    expect(items).toEqual([
      { title: "Breakfast", offset_min: 540, type: "schedule" }, // 09:00 EEST
    ]);
  });
});

describe("findShowSlot", () => {
  it("primul item «Show» cu oră", () => {
    const show = findShowSlot([
      { title: "Show", start_at: null },
      { title: "Load-in", start_at: "x" },
      { title: "Show", start_at: "2026-09-15T19:30:00.000Z" },
    ]);
    expect(show?.start_at).toBe("2026-09-15T19:30:00.000Z");
  });
  it("null când nu există", () => {
    expect(findShowSlot([{ title: "Load-in", start_at: "x" }])).toBeNull();
  });
});

describe("formatShowOffset", () => {
  it.each([
    [0, "T"],
    [-480, "T−8h"],
    [30, "T+30min"],
    [-90, "T−1h30"],
    [150, "T+2h30"],
  ])("%i → %s", (min, expected) => {
    expect(formatShowOffset(min)).toBe(expected);
  });
});

describe("minutesToClock", () => {
  it("wrap la 24h", () => {
    expect(minutesToClock(90)).toBe("01:30");
    expect(minutesToClock(1500)).toBe("01:00");
  });
});
