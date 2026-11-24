/**
 * The deterministic tool layer. Every tool returns plain JSON containing the
 * values AND the exact parameters used. The LLM never computes a number: it
 * calls these and writes words around the results.
 */

import fs from "node:fs";
import path from "node:path";
import {
  BASELINE, COMPONENT_CODES, COMPONENT_LABEL, COMPONENT_SIGN, COMPOSITE_FORMULA,
  COUNTRY_INFO, COUNTRY_SLUGS, DATA_SOURCE, MONTH_NAMES, SEASONS, STANDARD_CAVEATS,
  type ComponentCode, type CountrySlug, type SeasonName,
} from "./labels";
import { findPlaces, getPlace, loadCountry, norm, type Place } from "./data";
import { inPeriod, resolvePeriod, type Period, type PeriodSpec } from "./period";
import { mean, rankHighest, round, senMannKendall } from "./stats";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type Comp = ComponentCode | "COMPOSITE";

const NAME_TO_COMP: Record<string, Comp> = {
  composite: "COMPOSITE", overall: "COMPOSITE", index: "COMPOSITE", "overall index": "COMPOSITE",
  t90s: "T90S", heat: "T90S", "extreme heat": "T90S", hot: "T90S",
  t10s: "T10S", cold: "T10S", "extreme cold": "T10S",
  ps: "PS", rain: "PS", rainfall: "PS", precipitation: "PS", "heavy rainfall": "PS",
  ds: "DS", drought: "DS", "dry spell": "DS", dry: "DS",
  w: "W", wind: "W", "strong wind": "W",
  ss: "SS", "sea level": "SS", sea: "SS",
};

export function parseComponent(s: unknown): Comp | null {
  if (typeof s !== "string") return null;
  const k = s.trim().toLowerCase();
  if (NAME_TO_COMP[k]) return NAME_TO_COMP[k];
  const up = s.trim().toUpperCase();
  return (up === "COMPOSITE" || (COMPONENT_CODES as string[]).includes(up)) ? (up as Comp) : null;
}

export function compLabel(c: Comp, country?: CountrySlug): string {
  if (c === "COMPOSITE") return country ? `Overall index (${COUNTRY_INFO[country].indexCode})` : "Overall index";
  return COMPONENT_LABEL[c];
}

function col(place: Place, comp: Comp): (number | null)[] | null {
  return place.store.cols[comp] ?? null;
}

/** Components that exist for this place (SS only where coastal; Nepal has none). */
export function availableComponents(place: Place): ComponentCode[] {
  return COUNTRY_INFO[place.country].components.filter(
    (c) => place.store.cols[c] && place.store.cols[c].some((v) => v != null)
  );
}

export function periodMean(place: Place, comp: Comp, p: Period): { value: number | null; n: number } {
  const c = col(place, comp);
  if (!c) return { value: null, n: 0 };
  let s = 0, n = 0;
  place.store.periods.forEach((per, i) => {
    const v = c[i];
    if (v != null && inPeriod(per, p)) { s += v; n++; }
  });
  return { value: n ? s / n : null, n };
}

/** Per-year means (complete years / complete seasons only). */
export function yearlyMeans(
  place: Place, comp: Comp, months?: number[], fromYear?: number, toYear?: number
): { year: number; value: number }[] {
  const c = col(place, comp);
  if (!c) return [];
  const want = months ?? [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
  const acc = new Map<number, { s: number; n: number }>();
  place.store.periods.forEach((per, i) => {
    const y = Math.floor(per / 100);
    if ((fromYear && y < fromYear) || (toYear && y > toYear)) return;
    if (!want.includes(per % 100) || c[i] == null) return;
    const a = acc.get(y) ?? { s: 0, n: 0 };
    a.s += c[i]!; a.n++;
    acc.set(y, a);
  });
  return [...acc.entries()]
    .filter(([, a]) => a.n === want.length)
    .map(([year, a]) => ({ year, value: a.s / a.n }))
    .sort((a, b) => a.year - b.year);
}

function monthValue(place: Place, comp: Comp, year: number, month: number): number | null {
  const c = col(place, comp);
  if (!c) return null;
  const i = place.store.periods.indexOf(year * 100 + month);
  return i < 0 ? null : c[i];
}

function placeRef(p: Place) {
  return { id: p.id, name: p.name, level: p.levelLabel, parent: p.parentName, country: COUNTRY_INFO[p.country].name };
}

type ToolError = { error: string; candidates?: unknown[] };
const err = (error: string, candidates?: unknown[]): ToolError => ({ error, ...(candidates ? { candidates } : {}) });

function requirePlace(id: unknown): Place | ToolError {
  if (typeof id !== "string") return err("place_id is required. Call resolve_place first.");
  const p = getPlace(id);
  return p ?? err(`Unknown place_id "${id}". Call resolve_place to get a valid id.`);
}
const isErr = (x: unknown): x is ToolError => !!x && typeof x === "object" && "error" in (x as object);

function resolveFor(country: CountrySlug, spec: PeriodSpec): Period {
  const d = loadCountry(country);
  return resolvePeriod(spec, d.first, d.last);
}

// ---------------------------------------------------------------------------
// Tools
// ---------------------------------------------------------------------------

export function resolvePlace(args: { name?: string; country?: string }) {
  const name = String(args.name ?? "");
  const countries = args.country && (COUNTRY_SLUGS as string[]).includes(args.country)
    ? [args.country as CountrySlug]
    : COUNTRY_SLUGS;
  const matches = findPlaces(name, countries);
  const rows = matches.slice(0, 8).map((m) => ({ ...placeRef(m.place), matched_by: m.how }));
  let status: "exact" | "ambiguous" | "not_found" | "suggestions";
  if (!matches.length) status = "not_found";
  else if (matches.length === 1 && matches[0].how !== "fuzzy") status = "exact";
  else if (matches.every((m) => m.how === "fuzzy")) status = "suggestions";
  else status = "ambiguous";
  // Several districts with the same name inside one country: genuinely ambiguous.
  const alias = matches.find((m) => m.how === "alias");
  return {
    params: { name, country: args.country ?? "any" },
    status,
    matches: rows,
    note: alias
      ? `"${name}" is the former/alternative name of ${alias.place.name}.`
      : status === "ambiguous"
        ? "More than one place matches. Ask the user which one is meant."
        : undefined,
  };
}

export function getSeries(args: {
  place_id?: string; components?: string[]; period?: PeriodSpec; freq?: string;
}) {
  const place = requirePlace(args.place_id);
  if (isErr(place)) return place;
  const comps = (args.components?.length ? args.components : ["COMPOSITE"])
    .map(parseComponent).filter((c): c is Comp => !!c);
  const period = resolveFor(place.country, args.period ?? {});
  const freq = args.freq === "annual" ? "annual" : "monthly";
  if (freq === "monthly") {
    const rows: Record<string, number | null>[] = [];
    place.store.periods.forEach((per, i) => {
      if (!inPeriod(per, period)) return;
      const row: Record<string, number | null> = { period: per };
      for (const c of comps) row[c] = round(col(place, c)?.[i] ?? null, 2);
      rows.push(row);
    });
    if (rows.length > 120) return err(`Too many monthly rows (${rows.length}). Use freq "annual" or a shorter period.`);
    return { params: { place_id: place.id, components: comps, period, freq }, place: placeRef(place), rows };
  }
  const byYear = new Map<number, Record<string, number | null>>();
  for (const c of comps) {
    for (const { year, value } of yearlyMeans(place, c, period.months, Math.floor(period.start / 100), Math.floor(period.end / 100))) {
      const r = byYear.get(year) ?? { year };
      r[c] = round(value, 2);
      byYear.set(year, r);
    }
  }
  return {
    params: { place_id: place.id, components: comps, period, freq },
    place: placeRef(place),
    rows: [...byYear.values()].sort((a, b) => (a.year as number) - (b.year as number)),
  };
}

/** Values of `comp` for every year, comparing like with like when `year` is partial. */
function yearRanking(place: Place, comp: Comp, year: number) {
  const c = col(place, comp)!;
  const monthsPresent: number[] = [];
  place.store.periods.forEach((per, i) => {
    if (Math.floor(per / 100) === year && c[i] != null) monthsPresent.push(per % 100);
  });
  if (!monthsPresent.length) return null;
  const years = new Map<number, number>();
  const all = [...new Set(place.store.periods.map((p) => Math.floor(p / 100)))];
  for (const y of all) {
    const vals = monthsPresent.map((m) => monthValue(place, comp, y, m));
    if (vals.every((v) => v != null)) years.set(y, mean(vals)!);
  }
  const value = years.get(year);
  if (value == null) return null;
  return { value, rank: rankHighest(value, [...years.values()]), nYears: years.size, monthsPresent };
}

export function getAnnualSummary(args: { place_id?: string; year?: number }) {
  const place = requirePlace(args.place_id);
  if (isErr(place)) return place;
  const year = Number(args.year);
  const d = loadCountry(place.country);
  if (!year || year < Math.floor(d.first / 100) || year > Math.floor(d.last / 100))
    return err(`year must be between ${Math.floor(d.first / 100)} and ${Math.floor(d.last / 100)}.`);

  const comp = yearRanking(place, "COMPOSITE", year);
  if (!comp) return err(`No data for ${place.name} in ${year}.`);
  const partial = comp.monthsPresent.length < 12;
  const components: Record<string, unknown> = {};
  const missing: string[] = [];
  for (const c of COUNTRY_INFO[place.country].components) {
    const r = place.store.cols[c] ? yearRanking(place, c, year) : null;
    if (!r || !availableComponents(place).includes(c)) {
      missing.push(COMPONENT_LABEL[c]);
      continue;
    }
    components[c] = { label: COMPONENT_LABEL[c], value: round(r.value, 2), rank: r.rank, n_years: r.nYears };
  }

  // Standout months: the three with the largest |composite|, plus the component that drove each.
  const comps = availableComponents(place);
  const months = comp.monthsPresent.map((m) => {
    const cv = monthValue(place, "COMPOSITE", year, m)!;
    const parts = comps
      .map((c) => ({ c, v: monthValue(place, c, year, m) }))
      .filter((x) => x.v != null)
      .map((x) => ({ component: x.c, label: COMPONENT_LABEL[x.c], contribution: (COMPONENT_SIGN[x.c] * x.v!) / comps.length, value: x.v! }));
    const driver = parts.sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution))[0];
    return { month: m, month_name: MONTH_NAMES[m - 1], composite: round(cv, 2), driver: driver && { component: driver.label, value: round(driver.value, 2) } };
  });
  const standout = [...months].sort((a, b) => Math.abs(b.composite!) - Math.abs(a.composite!)).slice(0, 3)
    .sort((a, b) => a.month - b.month);

  return {
    params: { place_id: place.id, year },
    place: placeRef(place),
    year,
    partial_year: partial,
    months_available: comp.monthsPresent.length,
    rank_basis: partial
      ? `Same ${comp.monthsPresent.length} calendar months compared across all years (the year is incomplete).`
      : "Annual mean of the 12 monthly anomalies compared across all complete years.",
    composite: { label: compLabel("COMPOSITE", place.country), value: round(comp.value, 2), rank: comp.rank, n_years: comp.nYears },
    components,
    components_not_measured: missing,
    standout_months: standout,
  };
}

export function getMonthSummary(args: { place_id?: string; year?: number; month?: number }) {
  const place = requirePlace(args.place_id);
  if (isErr(place)) return place;
  const year = Number(args.year), month = Number(args.month);
  if (!year || !(month >= 1 && month <= 12)) return err("year and month (1-12) are required.");
  const cv = monthValue(place, "COMPOSITE", year, month);
  if (cv == null) return err(`No data for ${place.name} in ${MONTH_NAMES[month - 1] ?? month} ${year}.`);
  const rank = (c: Comp) => {
    const vals = [...new Set(place.store.periods.map((p) => Math.floor(p / 100)))]
      .map((y) => monthValue(place, c, y, month)).filter((v): v is number => v != null);
    const v = monthValue(place, c, year, month)!;
    return { rank: rankHighest(v, vals), n_years: vals.length };
  };
  const comps = availableComponents(place);
  const components = comps.map((c) => {
    const v = monthValue(place, c, year, month);
    return v == null ? null : { component: COMPONENT_LABEL[c], value: round(v, 2), ...rank(c), contribution_to_index: round((COMPONENT_SIGN[c] * v) / comps.length, 2) };
  }).filter(Boolean) as { component: string; value: number; rank: number; n_years: number; contribution_to_index: number }[];
  const driver = [...components].sort((a, b) => Math.abs(b.contribution_to_index) - Math.abs(a.contribution_to_index))[0];
  const r = rank("COMPOSITE");
  return {
    params: { place_id: place.id, year, month },
    place: placeRef(place),
    month_name: MONTH_NAMES[month - 1],
    year,
    composite: { label: compLabel("COMPOSITE", place.country), value: round(cv, 2), ...r },
    rank_note: `Rank among all ${MONTH_NAMES[month - 1]}s in the record; 1 = highest.`,
    is_record_high: r.rank === 1,
    components,
    main_driver: driver?.component ?? null,
    components_not_measured: COUNTRY_INFO[place.country].components.filter((c) => !comps.includes(c)).map((c) => COMPONENT_LABEL[c]),
  };
}

export function trend(args: { place_id?: string; component?: string; period?: PeriodSpec }) {
  const place = requirePlace(args.place_id);
  if (isErr(place)) return place;
  const comp = parseComponent(args.component ?? "composite");
  if (!comp) return err(`Unknown component "${args.component}".`);
  if (comp !== "COMPOSITE" && !availableComponents(place).includes(comp))
    return err(`${COMPONENT_LABEL[comp]} is not measured for ${place.name}.`);
  const period = resolveFor(place.country, args.period ?? {});
  const series = yearlyMeans(place, comp, period.months, Math.floor(period.start / 100), Math.floor(period.end / 100));
  const t = senMannKendall(series.map((s) => ({ x: s.year, y: s.value })));
  return {
    params: { place_id: place.id, component: comp, period, method: "Sen's slope with Mann-Kendall test on annual means, alpha 0.05" },
    place: placeRef(place),
    component: compLabel(comp, place.country),
    n_years: t.n,
    first_year: series[0]?.year ?? null,
    last_year: series[series.length - 1]?.year ?? null,
    slope_per_decade: round(t.slopePerDecade, 2),
    mann_kendall_p: round(t.pValue, 3),
    direction: t.direction,
  };
}

export function comparePlaces(args: { place_ids?: string[]; components?: string[]; period?: PeriodSpec }) {
  const ids = args.place_ids ?? [];
  if (ids.length < 2 || ids.length > 4) return err("Provide 2 to 4 place_ids.");
  const places: Place[] = [];
  for (const id of ids) {
    const p = requirePlace(id);
    if (isErr(p)) return p;
    places.push(p);
  }
  // Common period bounds: intersection of the countries' records.
  const first = Math.max(...places.map((p) => loadCountry(p.country).first));
  const last = Math.min(...places.map((p) => loadCountry(p.country).last));
  const period = resolvePeriod(args.period ?? {}, first, last);
  const y0 = Math.floor(period.start / 100), y1 = Math.floor(period.end / 100);
  const wanted = (args.components?.length ? args.components.map(parseComponent).filter((c): c is Comp => !!c)
    : (["COMPOSITE", ...COMPONENT_CODES] as Comp[]));

  const rows = places.map((p) => {
    const values: Record<string, number | null> = {};
    for (const c of wanted) values[c] = round(periodMean(p, c, period).value, 2);
    return { place: { ...placeRef(p), coastal: p.coastal }, values };
  });
  const missing: Record<string, string[]> = {};
  places.forEach((p) => {
    const have = availableComponents(p);
    const m = wanted.filter((c) => c !== "COMPOSITE" && !have.includes(c as ComponentCode)).map((c) => COMPONENT_LABEL[c as ComponentCode]);
    if (m.length) missing[p.name] = m;
  });

  const annual = places.map((p) => {
    const s = yearlyMeans(p, "COMPOSITE", period.months, y0, y1);
    const pts = s.map((pt, i) => ({
      year: pt.year,
      value: round(pt.value, 2)!,
      rolling_5y: i >= 4 ? round(mean(s.slice(i - 4, i + 1).map((x) => x.value)), 2) : null,
    }));
    const t = senMannKendall(s.map((x) => ({ x: x.year, y: x.value })));
    return { place_id: p.id, name: p.name, points: pts, trend: { slope_per_decade: round(t.slopePerDecade, 2), mann_kendall_p: round(t.pValue, 3), direction: t.direction } };
  });

  let convergence: Record<string, unknown> | null = null;
  if (places.length === 2) {
    const a = annual[0].points, b = annual[1].points;
    const common = a.filter((pt) => pt.rolling_5y != null && b.find((q) => q.year === pt.year)?.rolling_5y != null).map((pt) => ({
      year: pt.year, gap: pt.rolling_5y! - b.find((q) => q.year === pt.year)!.rolling_5y!,
    }));
    if (common.length >= 2) {
      const f = common[0], l = common[common.length - 1];
      convergence = {
        basis: "Gap between the two places' 5-year rolling means of the overall index (first place minus second)",
        start_year: f.year, start_gap: round(f.gap, 2), end_year: l.year, end_gap: round(l.gap, 2),
        pattern: Math.abs(l.gap) < Math.abs(f.gap) - 0.05 ? "converging" : Math.abs(l.gap) > Math.abs(f.gap) + 0.05 ? "diverging" : "roughly parallel",
      };
    }
  }
  const crossCountry = new Set(places.map((p) => p.country)).size > 1;
  return {
    params: { place_ids: ids, components: wanted, period },
    places: rows,
    components_not_measured_for: missing,
    annual,
    convergence,
    notes: [
      "All values are anomalies against each place's own 1991–2020 baseline.",
      ...(crossCountry ? ["Places are in different countries: anomalies show how unusual conditions are relative to each place's own history, not absolute heat, rainfall or wind."] : []),
      "Multi-year means are more reliable than single months, which are noisy.",
    ],
  };
}

export function rankPlaces(args: {
  country?: string; region?: string; component?: string; period?: PeriodSpec; rank_by?: string; limit?: number; level?: string;
}) {
  const country = (COUNTRY_SLUGS as string[]).includes(args.country ?? "") ? (args.country as CountrySlug) : null;
  if (!country) return err("country must be one of india, uk, nepal.");
  const comp = parseComponent(args.component ?? "composite");
  if (!comp) return err(`Unknown component "${args.component}".`);
  const data = loadCountry(country);
  let region: Place | null = null;
  if (args.region && norm(args.region) !== norm(COUNTRY_INFO[country].name)) {
    const m = findPlaces(args.region, [country]).filter((x) => x.place.level === "top");
    if (m.length === 0) return err(`No ${COUNTRY_INFO[country].topLabel.toLowerCase()} called "${args.region}" in ${COUNTRY_INFO[country].name}.`);
    if (m.length > 1) return err("Region is ambiguous.", m.map((x) => placeRef(x.place)));
    region = m[0].place;
  }
  const wantLevel = args.level === "top" ? "top" : "child";
  const rankBy = args.rank_by === "fastest_worsening" ? "fastest_worsening" : "most_extreme";
  const spec = args.period ?? {};
  const period = resolvePeriod(spec, data.first, data.last);
  const limit = Math.min(Math.max(Number(args.limit) || 10, 1), 25);

  const rows: { place: Place; value: number; extra?: Record<string, unknown> }[] = [];
  for (const p of data.places.values()) {
    if (p.level !== wantLevel) continue;
    if (region && p.parentId !== region.id && p.id !== region.id) continue;
    if (comp !== "COMPOSITE" && !availableComponents(p).includes(comp)) continue;
    if (rankBy === "most_extreme") {
      const { value, n } = periodMean(p, comp, period);
      if (value != null && n > 0) rows.push({ place: p, value });
    } else {
      const s = yearlyMeans(p, comp, period.months, Math.floor(period.start / 100), Math.floor(period.end / 100));
      const t = senMannKendall(s.map((x) => ({ x: x.year, y: x.value })));
      if (t.slopePerDecade != null) rows.push({ place: p, value: t.slopePerDecade, extra: { mann_kendall_p: round(t.pValue, 3), direction: t.direction } });
    }
  }
  rows.sort((a, b) => b.value - a.value);
  const top = rows.slice(0, limit).map((r, i) => ({
    rank: i + 1, place_id: r.place.id, name: r.place.name, parent: r.place.parentName,
    value: round(r.value, 2), ...(r.extra ?? {}),
  }));
  return {
    params: { country, region: region?.name ?? "all", component: comp, period, rank_by: rankBy, limit, level: wantLevel },
    measure: rankBy === "most_extreme"
      ? `Mean ${compLabel(comp, country)} anomaly over ${period.label} (higher = more extreme).`
      : `Sen's slope of annual ${compLabel(comp, country)} anomalies per decade over ${period.label} (higher = worsening faster).`,
    n_ranked: rows.length,
    unit: rankBy === "most_extreme" ? "z-score" : "z-score per decade",
    rows: top,
  };
}

// --- neighbours (from boundary GeoJSON) -------------------------------------

const adjacency = new Map<string, Map<string, string[]>>();

type Geometry = { type: string; coordinates: unknown };

function vertices(g: Geometry): [number, number][] {
  const out: [number, number][] = [];
  const walk = (c: unknown): void => {
    if (Array.isArray(c) && typeof c[0] === "number") out.push([c[0] as number, c[1] as number]);
    else if (Array.isArray(c)) c.forEach(walk);
  };
  walk(g.coordinates);
  return out;
}

function geoFiles(c: CountrySlug, level: "top" | "child"): string[] {
  const info = COUNTRY_INFO[c];
  const base = path.join(process.cwd(), "public", "geojson", c);
  if (level === "top") return [path.join(base, `${info.topId}.json`)].filter(fs.existsSync);
  const dir = path.join(base, info.childId);
  return fs.existsSync(dir) ? fs.readdirSync(dir).map((f) => path.join(dir, f)) : [];
}

function buildAdjacency(c: CountrySlug, level: "top" | "child"): Map<string, string[]> {
  const places = [...loadCountry(c).places.values()].filter((p) => p.level === level);
  const byName = new Map<string, Place[]>();
  places.forEach((p) => byName.set(norm(p.name), [...(byName.get(norm(p.name)) ?? []), p]));
  const CELL = 0.03;
  const cells = new Map<string, Map<string, number>>(); // cell -> place id -> count
  const centroid = new Map<string, [number, number]>();
  for (const file of geoFiles(c, level)) {
    const gj = JSON.parse(fs.readFileSync(file, "utf8")) as {
      features: { properties: { name?: string; parent?: string }; geometry: Geometry }[];
    };
    for (const f of gj.features) {
      const cand = byName.get(norm(f.properties.name ?? ""));
      if (!cand) continue;
      const parent = norm(f.properties.parent ?? "");
      const place = cand.length === 1 ? cand[0]
        : cand.find((p) => norm(p.parentName ?? "") === parent) ?? cand.find((p) => parent.startsWith(norm(p.parentName ?? "").slice(0, 6))) ?? cand[0];
      const vs = vertices(f.geometry);
      let sx = 0, sy = 0;
      for (const [x, y] of vs) {
        sx += x; sy += y;
        const key = `${Math.round(x / CELL)}:${Math.round(y / CELL)}`;
        const m = cells.get(key) ?? new Map<string, number>();
        m.set(place.id, (m.get(place.id) ?? 0) + 1);
        cells.set(key, m);
      }
      if (vs.length) centroid.set(place.id, [sx / vs.length, sy / vs.length]);
    }
  }
  const pair = new Map<string, number>();
  for (const m of cells.values()) {
    const ids = [...m.keys()];
    for (const a of ids) for (const b of ids) if (a !== b) pair.set(`${a}|${b}`, (pair.get(`${a}|${b}`) ?? 0) + 1);
  }
  const out = new Map<string, string[]>();
  for (const p of places) out.set(p.id, []);
  for (const [k, n] of pair) {
    if (n < 2) continue;
    const [a, b] = k.split("|");
    out.get(a)?.push(b);
  }
  // Fallback: nearest centroids for places with no detected neighbour (islands, odd geometry).
  for (const p of places) {
    if (out.get(p.id)!.length || !centroid.has(p.id)) continue;
    const [x, y] = centroid.get(p.id)!;
    out.set(p.id, [...centroid.entries()].filter(([id]) => id !== p.id)
      .map(([id, [cx, cy]]) => ({ id, d: (cx - x) ** 2 + (cy - y) ** 2 }))
      .sort((a, b) => a.d - b.d).slice(0, 3).map((e) => e.id));
  }
  return out;
}

export function neighbours(args: { place_id?: string }) {
  const place = requirePlace(args.place_id);
  if (isErr(place)) return place;
  if (place.level === "country") return err("A whole country has no neighbours in this index.");
  const key = `${place.country}:${place.level}`;
  if (!adjacency.has(key)) adjacency.set(key, buildAdjacency(place.country, place.level));
  const ids = adjacency.get(key)!.get(place.id) ?? [];
  const parent = place.parentId ? getPlace(place.parentId) : null;
  return {
    params: { place_id: place.id },
    place: placeRef(place),
    method: "Places whose boundaries touch (from the boundary map); nearest places if none touch.",
    neighbours: ids.map((id) => getPlace(id)!).filter(Boolean).map(placeRef),
    parent: parent ? placeRef(parent) : null,
  };
}

export function getMethodologyFacts(args: { country?: string }) {
  const c = (COUNTRY_SLUGS as string[]).includes(args.country ?? "") ? (args.country as CountrySlug) : "india";
  const info = COUNTRY_INFO[c];
  const d = loadCountry(c);
  return {
    params: { country: c },
    country: info.name,
    index: `${info.indexName} (${info.indexCode})`,
    version: info.version,
    baseline: BASELINE,
    data_source: DATA_SOURCE,
    record: { first_period: d.first, last_period: d.last },
    components: info.components.map((k) => COMPONENT_LABEL[k]),
    composite_formula: c === "nepal" ? { all_places: COMPOSITE_FORMULA.inland } : COMPOSITE_FORMULA,
    values: "Monthly standardized anomalies (z-scores) on the 1991–2020 baseline; the overall index is an equal-weight combination of the components, with extreme cold entering negatively.",
    seasons: Object.fromEntries(Object.entries(SEASONS).map(([k, v]) => [k, v.label])),
    caveats: [
      ...STANDARD_CAVEATS,
      ...(c === "nepal" ? ["Nepal is landlocked: sea level is not part of the index there."] : ["Sea level is measured only for coastal places; inland places use the other components."]),
      ...(c === "uk" ? ["The UK index is a draft."] : []),
    ],
  };
}

// ---------------------------------------------------------------------------
// Registry (with JSON schemas handed to the LLM)
// ---------------------------------------------------------------------------

const periodSchema = {
  type: "object",
  description: "Time window. Use year (e.g. 2024), optionally with season (monsoon|summer|post_monsoon|winter); or from_year/to_year; or last_years. Omit for the whole record.",
  properties: {
    year: { type: "integer" },
    season: { type: "string", enum: Object.keys(SEASONS) },
    from_year: { type: "integer" },
    to_year: { type: "integer" },
    last_years: { type: "integer" },
  },
};
const compSchema = { type: "string", description: "composite, heat, cold, rainfall, wind, drought or sea level" };

export interface ToolDef {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
  run: (args: Record<string, unknown>) => unknown;
}

export const TOOLS: ToolDef[] = [
  { name: "resolve_place", description: "Find the canonical place for a name (district, state, nation, county...). Handles renamed places and typos. If status is ambiguous or not_found, ask the user to clarify instead of guessing.",
    input_schema: { type: "object", properties: { name: { type: "string" }, country: { type: "string", enum: COUNTRY_SLUGS } }, required: ["name"] },
    run: (a) => resolvePlace(a as never) },
  { name: "get_series", description: "Monthly or annual anomaly series for one place.",
    input_schema: { type: "object", properties: { place_id: { type: "string" }, components: { type: "array", items: compSchema }, period: periodSchema, freq: { type: "string", enum: ["monthly", "annual"] } }, required: ["place_id"] },
    run: (a) => getSeries(a as never) },
  { name: "get_annual_summary", description: "Year-in-review numbers for one place and year: composite and component anomalies with ranks since 1991, and standout months.",
    input_schema: { type: "object", properties: { place_id: { type: "string" }, year: { type: "integer" } }, required: ["place_id", "year"] },
    run: (a) => getAnnualSummary(a as never) },
  { name: "get_month_summary", description: "One month at one place: component values and the rank of that month against every same calendar month on record.",
    input_schema: { type: "object", properties: { place_id: { type: "string" }, year: { type: "integer" }, month: { type: "integer" } }, required: ["place_id", "year", "month"] },
    run: (a) => getMonthSummary(a as never) },
  { name: "compare_places", description: "Compare 2-4 places over a period on the same baseline, with annual series and a converging/diverging check.",
    input_schema: { type: "object", properties: { place_ids: { type: "array", items: { type: "string" } }, components: { type: "array", items: compSchema }, period: periodSchema }, required: ["place_ids"] },
    run: (a) => comparePlaces(a as never) },
  { name: "rank_places", description: "Rank districts (or top-level regions) in a country or region by a component. rank_by: most_extreme (period mean) or fastest_worsening (Sen's slope).",
    input_schema: { type: "object", properties: { country: { type: "string", enum: COUNTRY_SLUGS }, region: { type: "string", description: "State/nation/province name, or omit for the whole country" }, component: compSchema, period: periodSchema, rank_by: { type: "string", enum: ["most_extreme", "fastest_worsening"] }, limit: { type: "integer" }, level: { type: "string", enum: ["child", "top"] } }, required: ["country", "component"] },
    run: (a) => rankPlaces(a as never) },
  { name: "trend", description: "Sen's slope and Mann-Kendall test on annual values for one place and component.",
    input_schema: { type: "object", properties: { place_id: { type: "string" }, component: compSchema, period: periodSchema }, required: ["place_id"] },
    run: (a) => trend(a as never) },
  { name: "neighbours", description: "Places that border this one, plus its parent region.",
    input_schema: { type: "object", properties: { place_id: { type: "string" } }, required: ["place_id"] },
    run: (a) => neighbours(a as never) },
  { name: "get_methodology_facts", description: "Baseline, version, components, formula and caveats for a country.",
    input_schema: { type: "object", properties: { country: { type: "string", enum: COUNTRY_SLUGS } }, required: ["country"] },
    run: (a) => getMethodologyFacts(a as never) },
];

const memo = new Map<string, unknown>();

export function runTool(name: string, args: Record<string, unknown>): unknown {
  const def = TOOLS.find((t) => t.name === name);
  if (!def) return err(`Unknown tool "${name}".`);
  const key = `${name}:${JSON.stringify(args)}`;
  if (memo.has(key)) return memo.get(key);
  let result: unknown;
  try {
    result = def.run(args);
  } catch (e) {
    result = err(`Tool failed: ${e instanceof Error ? e.message : "unknown error"}`);
  }
  if (memo.size > 500) memo.clear();
  memo.set(key, result);
  return result;
}

export type { SeasonName };
