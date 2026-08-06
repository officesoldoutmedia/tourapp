import { describe, expect, it } from "vitest";
import { versionChains } from "./fileVersions";

const f = (id: string, supersedes: string | null, at: string) => ({
  id, supersedes_id: supersedes, created_at: at,
});

describe("versionChains", () => {
  it("leagă v3→v2→v1: head v3 cu versiunea 3 și istoricul ordonat desc", () => {
    const chains = versionChains([
      f("v1", null, "2026-01-01"), f("v2", "v1", "2026-01-02"), f("v3", "v2", "2026-01-03"),
    ]);
    expect(chains).toHaveLength(1);
    expect(chains[0].head.id).toBe("v3");
    expect(chains[0].version).toBe(3);
    expect(chains[0].history.map((h) => h.id)).toEqual(["v2", "v1"]);
  });
  it("fișier fără lanț = versiunea 1, istoric gol", () => {
    const chains = versionChains([f("a", null, "2026-01-01")]);
    expect(chains[0]).toMatchObject({ version: 1, history: [] });
  });
  it("referință lipsă tratată ca rădăcină (defensiv)", () => {
    const chains = versionChains([f("b", "deleted-id", "2026-01-02")]);
    expect(chains[0]).toMatchObject({ version: 1, history: [] });
  });
  it("ciclu accidental nu blochează (guard pe vizitate)", () => {
    const chains = versionChains([f("x", "y", "2026-01-01"), f("y", "x", "2026-01-02")]);
    expect(chains.length).toBeGreaterThan(0); // nu aruncă, nu buclează
  });
});
