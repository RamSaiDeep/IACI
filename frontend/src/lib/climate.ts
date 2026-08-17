/**
 * Loading and lookup for the static climate JSON in /public/data.
 *
 * The files are written by backend/process_iaci_data.py in a compact form —
 * `{ fields, rows | regions }` where every row is `[YYYYMM, ...values]`. This
 * module turns that into period-keyed Maps once per file and caches the result
 * for the lifetime of the tab, so switching between Explore and Analyze, or
 * revisiting a state, never refetches or reparses.
 */

export const FIELDS = ["IACI", "DS", "PS", "T10S", "T90S", "W"] as const;

export type Field = (typeof FIELDS)[number];

/** One month of observations for one region. `null` means "not measured". */
export type Values = Record<Field, number | null>;

/** Period (`YYYYMM`) -> values, for a single region. */
export type Series = Map<number, Values>;

/** Region name (upper-cased) -> series. */
export type RegionSeries = Map<string, Series>;

type CompactRow = [number, ...(number | null)[]];

interface CompactFile {
  fields: string[];
  rows?: CompactRow[];
  regions?: Record<string, CompactRow[]>;
}

export const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
] as const;

/** Pack a year and 1-based month into the integer key the data files use. */
export function periodOf(year: number, month: number): number {
  return year * 100 + month;
}

export function yearOf(period: number): number {
  return Math.floor(period / 100);
}

export function monthOf(period: number): number {
  return period % 100;
}

export function normalizeName(name: string | null | undefined): string {
  return name ? name.trim().toUpperCase() : "";
}

/** State name -> the file stem used under /data/districts and /geojson/districts. */
export function slugifyState(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function toSeries(rows: CompactRow[], fields: string[]): Series {
  const series: Series = new Map();
  for (const row of rows) {
    const values = {} as Values;
    for (let i = 0; i < fields.length; i++) {
      values[fields[i] as Field] = row[i + 1] ?? null;
    }
    series.set(row[0], values);
  }
  return series;
}

// Promises, not resolved values, so two components mounting at once share a
// single request instead of racing to fetch the same file twice.
const cache = new Map<string, Promise<unknown>>();

function loadJson<T>(url: string, parse: (raw: CompactFile) => T): Promise<T> {
  const cached = cache.get(url) as Promise<T> | undefined;
  if (cached) return cached;

  const request = fetch(url)
    .then((res) => {
      if (!res.ok) throw new Error(`${res.status} loading ${url}`);
      return res.json() as Promise<CompactFile>;
    })
    .then(parse)
    .catch((err) => {
      // Drop the rejected promise so a later attempt can retry rather than
      // replaying the same failure forever.
      cache.delete(url);
      throw err;
    });

  cache.set(url, request);
  return request;
}

export function loadIndia(): Promise<Series> {
  return loadJson("/data/india_data.json", (raw) =>
    toSeries(raw.rows ?? [], raw.fields)
  );
}

export function loadStates(): Promise<RegionSeries> {
  return loadJson("/data/state_data.json", (raw) => toRegionSeries(raw));
}

export function loadDistricts(stateName: string): Promise<RegionSeries> {
  return loadJson(`/data/districts/${slugifyState(stateName)}.json`, (raw) =>
    toRegionSeries(raw)
  );
}

function toRegionSeries(raw: CompactFile): RegionSeries {
  const out: RegionSeries = new Map();
  for (const [name, rows] of Object.entries(raw.regions ?? {})) {
    out.set(normalizeName(name), toSeries(rows, raw.fields));
  }
  return out;
}

/**
 * Values for one region and period, or null when that month has no row at all.
 * Individual fields may still be null within a row.
 */
export function valuesAt(series: Series | undefined, period: number): Values | null {
  return series?.get(period) ?? null;
}

/**
 * Build the region -> value lookup a choropleth needs for one period and field.
 * Regions whose value is null are omitted so the map can leave them unshaded
 * rather than painting them as zero.
 */
export function choroplethValues(
  regions: RegionSeries,
  period: number,
  field: Field
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [name, series] of regions) {
    const value = series.get(period)?.[field];
    if (value != null) out[name] = value;
  }
  return out;
}

/** Descending list of years that actually carry at least one usable value. */
export function yearsIn(series: Series): number[] {
  const years = new Set<number>();
  for (const [period, values] of series) {
    if (FIELDS.some((f) => values[f] != null)) years.add(yearOf(period));
  }
  return [...years].sort((a, b) => b - a);
}

/** 1-based months within `year` that carry at least one usable value. */
export function monthsIn(series: Series, year: number): Set<number> {
  const months = new Set<number>();
  for (const [period, values] of series) {
    if (yearOf(period) === year && FIELDS.some((f) => values[f] != null)) {
      months.add(monthOf(period));
    }
  }
  return months;
}
