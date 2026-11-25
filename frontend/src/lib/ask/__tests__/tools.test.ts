import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { rankHighest, senMannKendall } from "../stats";
import { resolvePeriod } from "../period";
import { loadCountry } from "../data";
import { getAnnualSummary, getMonthSummary, neighbours, rankPlaces, resolvePlace, trend, comparePlaces } from "../tools";

const DATA = path.join(process.cwd(), "public", "data");
const raw = (rel: string) => JSON.parse(fs.readFileSync(path.join(DATA, rel), "utf8"));

describe("stats", () => {
  it("detects a clean increasing trend", () => {
    const pts = Array.from({ length: 20 }, (_, i) => ({ x: 2000 + i, y: i * 0.1 }));
    const t = senMannKendall(pts);
    expect(t.slopePerYear).toBeCloseTo(0.1, 6);
    expect(t.direction).toBe("increasing");
    expect(t.pValue!).toBeLessThan(0.001);
  });
  it("reports no trend for a flat noisy series", () => {
    const ys = [0.1, -0.2, 0.3, -0.1, 0.2, -0.3, 0.0, 0.1, -0.1, 0.2, -0.2, 0.1];
    expect(senMannKendall(ys.map((y, i) => ({ x: i, y }))).direction).toBe("no significant trend");
  });
  it("ranks highest as 1", () => {
    expect(rankHighest(5, [1, 5, 3])).toBe(1);
    expect(rankHighest(1, [1, 5, 3])).toBe(3);
  });
});

describe("period", () => {
  it("expands monsoon 2024", () => {
    const p = resolvePeriod({ year: 2024, season: "monsoon" }, 199101, 202606);
    expect(p.start).toBe(202401);
    expect(p.months).toEqual([6, 7, 8, 9]);
  });
});

describe("data + tools match the raw files", () => {
  it("loads all three countries with expected counts", () => {
    const ind = [...loadCountry("india").places.values()];
    expect(ind.filter((p) => p.level === "top")).toHaveLength(36);
    expect(ind.filter((p) => p.level === "child")).toHaveLength(782);
    expect(new Set(ind.map((p) => p.id)).size).toBe(ind.length);
    expect([...loadCountry("nepal").places.values()].filter((p) => p.level === "child")).toHaveLength(77);
    expect([...loadCountry("uk").places.values()].filter((p) => p.level === "top")).toHaveLength(4);
  });

  it("month summary reads the exact stored value", () => {
    const r = resolvePlace({ name: "Wayanad" }) as { matches: { id: string }[] };
    const id = r.matches[0].id;
    const row = raw("india/district/kerala.json").regions.WAYANAD.find((x: number[]) => x[0] === 202407);
    const m = getMonthSummary({ place_id: id, year: 2024, month: 7 }) as { composite: { value: number; rank: number; n_years: number } };
    expect(m.composite.value).toBeCloseTo(row[1], 2);
    // rank against every July: recompute directly
    const julys = raw("india/district/kerala.json").regions.WAYANAD.filter((x: number[]) => x[0] % 100 === 7).map((x: number[]) => x[1]);
    expect(m.composite.rank).toBe(rankHighest(row[1], julys));
    expect(m.composite.n_years).toBe(julys.length);
  });

  it("annual summary composite equals the mean of the 12 months", () => {
    const id = (resolvePlace({ name: "Guntur" }) as { matches: { id: string }[] }).matches[0].id;
    const rows = raw("india/district/andhra_pradesh.json").regions.GUNTUR.filter((x: number[]) => Math.floor(x[0] / 100) === 2023);
    const exp = rows.reduce((s: number, x: number[]) => s + x[1], 0) / 12;
    const a = getAnnualSummary({ place_id: id, year: 2023 }) as { composite: { value: number; rank: number }; partial_year: boolean };
    expect(a.composite.value).toBeCloseTo(exp, 2);
    expect(a.partial_year).toBe(false);
    expect(a.composite.rank).toBeGreaterThanOrEqual(1);
  });

  it("marks the incomplete latest year as partial", () => {
    const id = (resolvePlace({ name: "Guntur" }) as { matches: { id: string }[] }).matches[0].id;
    const a = getAnnualSummary({ place_id: id, year: 2026 }) as { partial_year: boolean; months_available: number };
    expect(a.partial_year).toBe(true);
    expect(a.months_available).toBe(6);
  });
});

describe("place resolution", () => {
  it("maps renamed districts", () => {
    const r = resolvePlace({ name: "Gurgaon", country: "india" }) as { status: string; matches: { name: string }[] };
    expect(r.status).toBe("exact");
    expect(r.matches[0].name).toBe("Gurugram");
  });
  it("flags duplicate district names as ambiguous", () => {
    const seen = new Map<string, number>();
    for (const p of loadCountry("india").places.values()) if (p.level === "child") seen.set(p.name, (seen.get(p.name) ?? 0) + 1);
    const dup = [...seen.entries()].find(([, n]) => n > 1)![0];
    const r = resolvePlace({ name: dup, country: "india" }) as { status: string; matches: unknown[] };
    expect(r.status).toBe("ambiguous");
    expect(r.matches.length).toBeGreaterThan(1);
  });
  it("reports not found", () => {
    expect((resolvePlace({ name: "Zzzzqx" }) as { status: string }).status).toBe("not_found");
  });
  it("tolerates a typo", () => {
    expect((resolvePlace({ name: "Guntoor", country: "india" }) as { matches: { name: string }[] }).matches[0].name).toBe("Guntur");
  });
});

describe("rank, trend, compare, neighbours", () => {
  it("ranks Odisha districts by monsoon 2024 rainfall, descending", () => {
    const r = rankPlaces({ country: "india", region: "Odisha", component: "rainfall", period: { year: 2024, season: "monsoon" }, rank_by: "most_extreme", limit: 5 }) as { rows: { value: number; rank: number }[]; n_ranked: number };
    expect(r.rows).toHaveLength(5);
    expect(r.n_ranked).toBe(30);
    for (let i = 1; i < r.rows.length; i++) expect(r.rows[i - 1].value).toBeGreaterThanOrEqual(r.rows[i].value);
  });
  it("fastest_worsening returns slope per decade", () => {
    const r = rankPlaces({ country: "india", component: "drought", rank_by: "fastest_worsening", limit: 3 }) as { unit: string; rows: unknown[] };
    expect(r.unit).toBe("z-score per decade");
    expect(r.rows).toHaveLength(3);
  });
  it("trend returns method and direction", () => {
    const id = (resolvePlace({ name: "Chennai" }) as { matches: { id: string }[] }).matches[0].id;
    const t = trend({ place_id: id, component: "heat" }) as { direction: string; n_years: number };
    expect(t.n_years).toBeGreaterThan(30);
    expect(typeof t.direction).toBe("string");
  });
  it("compare flags a component missing for Nepal", () => {
    const a = (resolvePlace({ name: "Chennai" }) as { matches: { id: string }[] }).matches[0].id;
    const b = (resolvePlace({ name: "Kathmandu", country: "nepal" }) as { matches: { id: string }[] }).matches[0].id;
    const c = comparePlaces({ place_ids: [a, b], period: { from_year: 2000, to_year: 2020 } }) as { components_not_measured_for: Record<string, string[]>; notes: string[] };
    expect(c.components_not_measured_for["Kathmandu"]).toContain("Sea level");
    expect(c.notes.join(" ")).toMatch(/different countries/);
  });
  it("finds Wayanad's neighbours, including across a state border", () => {
    const id = (resolvePlace({ name: "Wayanad" }) as { matches: { id: string }[] }).matches[0].id;
    const n = neighbours({ place_id: id }) as { neighbours: { name: string }[] };
    const names = n.neighbours.map((x) => x.name);
    expect(names).toContain("Kozhikode");
    expect(names.length).toBeGreaterThanOrEqual(3);
  });
});

describe("place matching inside long official names", () => {
  it("nellore finds Sri Potti Sriramulu Nellore, not Vellore", async () => {
    const { findPlaces } = await import("../data");
    const m = findPlaces("Nellore", ["india"]);
    expect(m.map((x) => x.place.name.toLowerCase())).toEqual(expect.arrayContaining([expect.stringContaining("nellore")]));
    expect(m.every((x) => x.how !== "fuzzy")).toBe(true);
  });
});
