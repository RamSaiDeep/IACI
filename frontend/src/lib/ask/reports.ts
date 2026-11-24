/**
 * Fixed report templates. Each feature has a PLAN (the tool calls our code
 * makes, in order) and an ASSEMBLER (the sections, in a fixed order). The LLM
 * only supplies the prose that goes into named slots.
 */

import { formatValue, severityOf } from "../indicators";
import { getPlace } from "./data";
import {
  BASELINE, COMPONENT_LABEL, COUNTRY_INFO, DATA_SOURCE, MONTH_NAMES, STANDARD_CAVEATS,
  type CountrySlug,
} from "./labels";
import type { Feature, ReportSection, TraceEntry } from "./report-types";
import { AskError } from "./providers/types";
import { runTool } from "./tools";

type Obj = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

export interface Narrative {
  headline: string;
  sections: Record<string, string>;
  followups: string[];
}

/** Which prose slots each feature has (the model is told these keys). */
export const NARRATIVE_SLOTS: Record<Feature, { key: string; hint: string }[]> = {
  year: [
    { key: "month_by_month", hint: "1-2 sentences on the standout months and the hazard that drove each" },
    { key: "trend_context", hint: "1-2 sentences: does the year fit the long-run trend or is it a one-off (use the trend direction and p-value)" },
    { key: "regional_context", hint: "1-2 sentences comparing with the neighbouring places and the parent region" },
  ],
  compare: [
    { key: "change_over_time", hint: "1-2 sentences: are the two places converging or diverging, using the 5-year rolling means" },
    { key: "why_differ", hint: "1-2 sentences on structural reasons (coastal vs inland, which hazards differ). Do not mention hazards that are not in the results" },
  ],
  screen: [],
  event: [
    { key: "how_extreme", hint: "1 sentence on how extreme the month was against that place's own history" },
    { key: "component_breakdown", hint: "1-2 sentences on which hazards drove the reading" },
  ],
};

export interface Ctx {
  trace: TraceEntry[];
  /** Every full tool result, for grounding. */
  results: unknown[];
}

export function call(ctx: Ctx, name: string, args: Record<string, unknown>): Obj {
  const result = runTool(name, args) as Obj;
  const ok = !(result && typeof result === "object" && "error" in result);
  ctx.results.push(result);
  ctx.trace.push({ name, args, ok, summary: summarise(name, result) });
  return result;
}

function summarise(name: string, r: Obj): string {
  if (!r) return "";
  if (r.error) return `Error: ${r.error}`;
  switch (name) {
    case "resolve_place": return `${r.status}: ${(r.matches ?? []).slice(0, 3).map((m: Obj) => m.name).join(", ") || "no match"}`;
    case "get_annual_summary": return `${r.place?.name} ${r.year}: overall ${formatValue(r.composite?.value)}, rank ${r.composite?.rank} of ${r.composite?.n_years}`;
    case "get_month_summary": return `${r.place?.name} ${r.month_name} ${r.year}: overall ${formatValue(r.composite?.value)}, rank ${r.composite?.rank} of ${r.composite?.n_years}`;
    case "trend": return `${r.place?.name} ${r.component}: ${r.direction}, ${formatValue(r.slope_per_decade)} per decade (p=${r.mann_kendall_p})`;
    case "compare_places": return `${(r.places ?? []).map((p: Obj) => p.place.name).join(" vs ")}; ${r.convergence?.pattern ?? "no convergence test"}`;
    case "rank_places": return `${r.n_ranked} places ranked; top: ${(r.rows ?? []).slice(0, 3).map((x: Obj) => `${x.name} ${formatValue(x.value)}`).join(", ")}`;
    case "neighbours": return `${(r.neighbours ?? []).length} neighbours of ${r.place?.name}`;
    case "get_series": return `${(r.rows ?? []).length} rows for ${r.place?.name}`;
    default: return "ok";
  }
}

function fail(result: Obj): never {
  throw new AskError("bad_request", String(result.error));
}

const fmt = (v: number | null | undefined) => formatValue(v);
const ord = (n: number) => `${n}`;

export interface Planned {
  feature: Feature;
  country: CountrySlug;
  title: string;
  subtitle: string;
  /** Compact JSON the model reads. */
  forModel: Obj;
  /** Everything assemble() needs. */
  data: Obj;
}

// ---------------------------------------------------------------------------
// Feature 1: year in review
// ---------------------------------------------------------------------------

export function planYear(ctx: Ctx, placeId: string, year: number): Planned {
  const place = getPlace(placeId)!;
  const summary = call(ctx, "get_annual_summary", { place_id: placeId, year });
  if (summary.error) fail(summary);
  const trend = call(ctx, "trend", { place_id: placeId, component: "composite" });
  const series = call(ctx, "get_series", { place_id: placeId, components: ["composite"], freq: "annual" });

  const regional: Obj[] = [];
  let nb: Obj = {};
  if (place.level !== "country") {
    nb = call(ctx, "neighbours", { place_id: placeId });
    const others: Obj[] = [...(nb.neighbours ?? []).slice(0, 5)];
    if (nb.parent) others.push(nb.parent);
    for (const o of others) {
      const s = call(ctx, "get_annual_summary", { place_id: o.id, year });
      if (!s.error) regional.push(s);
    }
  }
  const forModel = {
    place: summary.place, year, partial_year: summary.partial_year, rank_basis: summary.rank_basis,
    overall: summary.composite, hazards: summary.components, not_measured: summary.components_not_measured,
    standout_months: summary.standout_months, trend: pick(trend, ["direction", "slope_per_decade", "mann_kendall_p", "n_years", "first_year", "last_year"]),
    regional: regional.map((r) => ({ place: r.place.name, level: r.place.level, overall: r.composite })),
  };
  return {
    feature: "year", country: place.country,
    title: `${place.name}: ${year} in review`,
    subtitle: `${place.levelLabel}${place.parentName ? `, ${place.parentName}` : ""} · ${COUNTRY_INFO[place.country].name}`,
    forModel, data: { summary, trend, series, regional, nb, year },
  };
}

function assembleYear(d: Obj, n: Narrative, placeId: string): ReportSection[] {
  const s = d.summary as Obj;
  const sections: ReportSection[] = [{ kind: "text", title: "Headline", body: n.headline }];

  const rows: (string | number | null)[][] = [[
    "Overall index", s.composite.value, `${s.composite.rank} of ${s.composite.n_years}`, severityOf(s.composite.value).label,
  ]];
  for (const c of Object.values(s.components) as Obj[]) {
    rows.push([c.label, c.value, `${c.rank} of ${c.n_years}`, severityOf(c.value).label]);
  }
  for (const m of s.components_not_measured as string[]) rows.push([m, null, "—", "Not measured here"]);
  sections.push({
    kind: "table", title: "Scorecard", columns: ["Hazard", "Anomaly", "Rank (1 = highest)", "Level"], rows, valueCols: [1],
    note: s.rank_basis,
  });

  sections.push({
    kind: "table", title: "Month by month",
    columns: ["Month", "Overall index", "Main driver"],
    rows: (s.standout_months as Obj[]).map((m) => [m.month_name, m.composite, m.driver ? `${m.driver.component} (${fmt(m.driver.value)})` : "—"]),
    valueCols: [1], note: "The three months furthest from normal.",
  });
  if (n.sections.month_by_month) sections.push({ kind: "text", title: "", body: n.sections.month_by_month });

  const t = d.trend as Obj;
  const pts = ((d.series.rows ?? []) as Obj[]).filter((r) => r.COMPOSITE != null).map((r) => ({ x: r.year as number, y: r.COMPOSITE as number }));
  sections.push({
    kind: "lines", title: "Trend context", xLabel: "Year", yLabel: "Annual overall index (anomaly)",
    series: [{ name: "Annual overall index", points: pts }], marker: d.year,
    note: t.error ? undefined : `Sen's slope ${fmt(t.slope_per_decade)} per decade, Mann-Kendall p = ${t.mann_kendall_p} (${t.direction}).`,
  });
  if (n.sections.trend_context) sections.push({ kind: "text", title: "", body: n.sections.trend_context });

  const reg = d.regional as Obj[];
  if (reg.length) {
    sections.push({
      kind: "table", title: "Regional context", columns: ["Place", "Type", "Overall index", "Rank (1 = highest)"],
      rows: [[s.place.name, "This place", s.composite.value, `${s.composite.rank} of ${s.composite.n_years}`],
        ...reg.map((r) => [r.place.name, r.place.level === s.place.level ? "Neighbour" : `Parent ${r.place.level.toLowerCase()}`, r.composite.value, `${r.composite.rank} of ${r.composite.n_years}`])],
      valueCols: [2], highlightRow: 0,
    });
    if (n.sections.regional_context) sections.push({ kind: "text", title: "", body: n.sections.regional_context });
  }
  void placeId;
  return sections;
}

// ---------------------------------------------------------------------------
// Feature 2: comparison
// ---------------------------------------------------------------------------

export function planCompare(ctx: Ctx, ids: string[], from?: number, to?: number): Planned {
  const period = from || to ? { from_year: from, to_year: to } : {};
  const cmp = call(ctx, "compare_places", { place_ids: ids, period });
  if (cmp.error) fail(cmp);
  const places = (cmp.places as Obj[]).map((p) => p.place.name);
  const forModel = {
    period: cmp.params.period.label,
    places: cmp.places.map((p: Obj) => ({ name: p.place.name, level: p.place.level, parent: p.place.parent, country: p.place.country, coastal: p.place.coastal, values: p.values })),
    not_measured: cmp.components_not_measured_for,
    trends: Object.fromEntries((cmp.annual as Obj[]).map((a) => [a.name, a.trend])),
    convergence: cmp.convergence,
    notes: cmp.notes,
  };
  return {
    feature: "compare", country: getPlace(ids[0])!.country,
    title: `${places.join(" vs ")}`,
    subtitle: `${cmp.params.period.label} · anomalies on the ${BASELINE} baseline`,
    forModel, data: { cmp },
  };
}

function assembleCompare(d: Obj, n: Narrative): ReportSection[] {
  const cmp = d.cmp as Obj;
  const places = cmp.places as Obj[];
  const sections: ReportSection[] = [{ kind: "text", title: "Headline verdict", body: n.headline }];
  const keys: string[] = ["COMPOSITE", "T90S", "T10S", "PS", "W", "DS", "SS"];
  const rows: (string | number | null)[][] = [];
  for (const k of keys) {
    const label = k === "COMPOSITE" ? "Overall index" : COMPONENT_LABEL[k as keyof typeof COMPONENT_LABEL];
    const vals = places.map((p) => p.values[k] ?? null);
    const measured = places.map((p) => !(cmp.components_not_measured_for[p.place.name] ?? []).includes(label));
    if (k !== "COMPOSITE" && !measured.some(Boolean)) continue;
    const row: (string | number | null)[] = [label];
    places.forEach((p, i) => row.push(measured[i] ? vals[i] : "Not part of the index here"));
    if (places.length === 2) row.push(measured[0] && measured[1] && vals[0] != null && vals[1] != null ? Math.round((vals[0] - vals[1]) * 100) / 100 : null);
    rows.push(row);
  }
  sections.push({
    kind: "table", title: "Side-by-side scorecard",
    columns: ["Hazard", ...places.map((p) => p.place.name), ...(places.length === 2 ? ["Difference"] : [])], rows,
    valueCols: places.map((_, i) => i + 1).concat(places.length === 2 ? [3] : []),
    note: `Mean anomaly over ${cmp.params.period.label}, on the ${BASELINE} baseline. Anomalies, not raw values.`,
  });
  sections.push({
    kind: "lines", title: "Change over time", xLabel: "Year", yLabel: "Overall index, 5-year rolling mean",
    series: (cmp.annual as Obj[]).map((a) => ({ name: a.name, points: (a.points as Obj[]).map((p) => ({ x: p.year, y: p.rolling_5y })) })),
    note: cmp.convergence ? `The two places look ${cmp.convergence.pattern} (gap ${fmt(cmp.convergence.start_gap)} in ${cmp.convergence.start_year}, ${fmt(cmp.convergence.end_gap)} in ${cmp.convergence.end_year}).` : "Single months are noisy; 5-year rolling means are shown.",
  });
  if (n.sections.change_over_time) sections.push({ kind: "text", title: "", body: n.sections.change_over_time });
  const missingNotes = Object.entries(cmp.components_not_measured_for as Record<string, string[]>).map(([p, m]) => `${m.join(", ")} is not measured for ${p}.`);
  if (n.sections.why_differ) sections.push({ kind: "text", title: "Why they differ", body: n.sections.why_differ });
  sections.push({ kind: "text", title: "Comparison notes", body: [...(cmp.notes as string[]), ...missingNotes].join(" ") });
  return sections;
}

// ---------------------------------------------------------------------------
// Feature 3: screening
// ---------------------------------------------------------------------------

export interface ScreenArgs {
  country: CountrySlug; region?: string; component?: string;
  period?: Obj; rank_by?: string; limit?: number;
}

export function planScreen(ctx: Ctx, a: ScreenArgs): Planned {
  const r = call(ctx, "rank_places", { ...a, limit: a.limit ?? 10 });
  if (r.error) fail(r);
  const forModel = { measure: r.measure, params: r.params, n_ranked: r.n_ranked, unit: r.unit, rows: r.rows };
  const comp = r.params.component === "COMPOSITE" ? "Overall index" : COMPONENT_LABEL[r.params.component as keyof typeof COMPONENT_LABEL];
  return {
    feature: "screen", country: a.country,
    title: `${comp}: ${r.params.rank_by === "fastest_worsening" ? "fastest worsening" : "most extreme"} places`,
    subtitle: `${r.params.region === "all" ? COUNTRY_INFO[a.country].name : r.params.region} · ${r.params.period.label}`,
    forModel, data: { r },
  };
}

function assembleScreen(d: Obj, n: Narrative): ReportSection[] {
  const r = d.r as Obj;
  const slope = r.params.rank_by === "fastest_worsening";
  const rows = r.rows as Obj[];
  const cols = ["Rank", "Place", "Parent", slope ? "Change per decade" : "Mean anomaly", ...(slope ? ["Trend test"] : [])];
  return [
    { kind: "text", title: "Direct answer", body: n.headline },
    {
      kind: "table", title: "Ranked table", columns: cols,
      rows: rows.map((x) => [x.rank, x.name, x.parent, x.value, ...(slope ? [`${x.direction} (p=${x.mann_kendall_p})`] : [])]),
      valueCols: slope ? [] : [3], note: `${r.n_ranked} places ranked. ${r.measure}`,
    },
    {
      kind: "bars", title: "Chart", unit: r.unit,
      rows: rows.map((x, i) => ({ label: x.name, sub: x.parent ?? undefined, value: x.value, highlight: i === 0 })),
      note: "Highest-ranked place highlighted.",
    },
  ];
}

// ---------------------------------------------------------------------------
// Feature 4: event explainer
// ---------------------------------------------------------------------------

export function planEvent(ctx: Ctx, placeId: string, year: number, month: number): Planned {
  const place = getPlace(placeId)!;
  const m = call(ctx, "get_month_summary", { place_id: placeId, year, month });
  if (m.error) fail(m);
  const forModel = {
    place: m.place, month: m.month_name, year, overall: m.composite, is_record_high: m.is_record_high,
    hazards: m.components, main_driver: m.main_driver, not_measured: m.components_not_measured, rank_note: m.rank_note,
  };
  return {
    feature: "event", country: place.country,
    title: `${place.name}: ${MONTH_NAMES[month - 1]} ${year}`,
    subtitle: `${place.levelLabel}${place.parentName ? `, ${place.parentName}` : ""} · ${COUNTRY_INFO[place.country].name}`,
    forModel, data: { m, month, year },
  };
}

function assembleEvent(d: Obj, n: Narrative, news: boolean): ReportSection[] {
  const m = d.m as Obj;
  const sections: ReportSection[] = [{ kind: "text", title: "Event summary", body: n.headline }];
  sections.push({
    kind: "table", title: "What the index recorded", columns: ["Hazard", "Anomaly", `Rank among all ${m.month_name}s (1 = highest)`],
    rows: [["Overall index", m.composite.value, `${m.composite.rank} of ${m.composite.n_years}`],
      ...(m.components as Obj[]).map((c) => [c.component, c.value, `${c.rank} of ${c.n_years}`])],
    valueCols: [1],
  });
  const record = m.is_record_high
    ? `This is the highest ${m.month_name} on record in the index for ${m.place.name}.`
    : `Against every ${m.month_name} in the record, this one ranks ${m.composite.rank} of ${m.composite.n_years} (1 = highest).`;
  sections.push({ kind: "text", title: "How extreme it was", body: [record, n.sections.how_extreme].filter(Boolean).join(" ") });
  sections.push({
    kind: "bars", title: "Component breakdown", unit: "contribution to the overall index",
    rows: (m.components as Obj[]).map((c) => ({ label: c.component, value: c.contribution_to_index, highlight: c.component === m.main_driver })),
    note: "Each hazard's share of the overall index this month (extreme cold counts negatively). Largest contributor highlighted.",
  });
  if (n.sections.component_breakdown) sections.push({ kind: "text", title: "", body: n.sections.component_breakdown });
  if (news) {
    sections.push({
      kind: "news", title: "Reported context (not from the index)",
      body: "News context is switched off in this version. When enabled it will appear only in this box, clearly separate from the index values above.",
    });
  }
  return sections;
}

// ---------------------------------------------------------------------------

export function assemble(p: Planned, n: Narrative, opts: { placeId?: string; news?: boolean }): { sections: ReportSection[]; notes: string[] } {
  let sections: ReportSection[];
  const notes = [...STANDARD_CAVEATS];
  switch (p.feature) {
    case "year": sections = assembleYear(p.data, n, opts.placeId ?? ""); break;
    case "compare": sections = assembleCompare(p.data, n); break;
    case "screen": sections = assembleScreen(p.data, n); break;
    case "event":
      sections = assembleEvent(p.data, n, !!opts.news);
      notes.push("This is context, not attribution: the index does not say what caused an event.");
      break;
  }
  const info = COUNTRY_INFO[p.country];
  if (p.feature === "year" && p.data.summary.partial_year) notes.push(`${p.data.year} is not a complete year in the data (${p.data.summary.months_available} months); ranks compare the same months across years.`);
  if (p.country === "uk") notes.push("The UK index is a draft.");
  if (p.country === "nepal") notes.push("Nepal is landlocked: sea level is not part of its index.");
  void info;
  return { sections, notes };
}

export function methodFor(country: CountrySlug) {
  const i = COUNTRY_INFO[country];
  return { baseline: BASELINE, version: i.version, source: DATA_SOURCE, index: `${i.indexName} (${i.indexCode})` };
}

function pick(o: Obj, keys: string[]): Obj {
  return Object.fromEntries(keys.map((k) => [k, o[k]]));
}
void ord;
