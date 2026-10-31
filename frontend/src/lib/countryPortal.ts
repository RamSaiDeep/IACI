/**
 * Data loading for a THREE-LEVEL country portal, driven entirely by a config.
 *
 *     country  →  top level  →  child level
 *     United Kingdom → Nation →  County
 *
 * The pages under `app/uk/` know nothing about the UK. Everything specific
 * (name, index code, level labels, home-page facts) lives in one config file
 * under `lib/countries/`. To build a portal for another three-level country:
 *
 *   1. copy `lib/countries/uk.ts` to `lib/countries/<slug>.ts` and edit it;
 *   2. copy the `app/uk/` folder to `app/<slug>/`;
 *   3. in each copied page, change the one line
 *        import { COUNTRY } from "../../lib/countries/uk";
 *      to point at the new config.
 *
 * File layout read here is the one `backend/process_country_data.py` and
 * `backend/process_country_boundaries.py` write:
 *
 *     /data/<slug>/country.json                /geojson/<slug>/<top>.json
 *     /data/<slug>/<top>.json                  /geojson/<slug>/<child>/<parent>.json
 *     /data/<slug>/<child>/<parent>.json
 */

import { loadJson, slugifyState, toRegionSeries, toSeries } from "./climate";
import type { Field, RegionSeries, Series } from "./climate";
import { INDICATORS, compositeIndicator } from "./indicators";
import type { Indicator } from "./indicators";

export interface LevelConfig {
  /** Must match the level `id` in backend/countries.py. */
  id: string;
  label: string;
  plural: string;
}

export interface CountryConfig {
  /** URL slug and folder name: /<slug>, /data/<slug>, /geojson/<slug>. */
  slug: string;
  /** Display name, e.g. "United Kingdom". */
  name: string;
  /** The composite field, e.g. "UKACI". Must match backend/countries.py. */
  indexCode: Field;
  indexName: string;
  /** Component fields the data carries (the composite excluded). */
  components: Field[];
  top: LevelConfig;
  child: LevelConfig;
  /** Short line under the title on the home page. */
  tagline: string;
  /** Cards on the home page. */
  facts: { value: string; label: string }[];
  /** Where the boundaries came from, credited on the home and about pages. */
  boundarySource: { label: string; href: string }[];
  /** Extra notes for the about page, one paragraph each. */
  notes: string[];
}

// ---------------------------------------------------------------------------
// Indicators
// ---------------------------------------------------------------------------

/** The composite first, then the components in India's reporting order. */
export function indicatorsFor(c: CountryConfig): Indicator[] {
  const components = INDICATORS.filter(
    (i) => i.id !== "IACI" && c.components.includes(i.id)
  );
  return [compositeIndicator(c.indexCode, c.indexName), ...components];
}

export function componentsFor(c: CountryConfig): Indicator[] {
  return indicatorsFor(c).filter((i) => i.id !== c.indexCode);
}

// ---------------------------------------------------------------------------
// Data files
// ---------------------------------------------------------------------------

export function loadCountrySeries(c: CountryConfig): Promise<Series> {
  return loadJson(`/data/${c.slug}/country.json`, (raw) =>
    toSeries(raw.rows ?? [], raw.fields)
  );
}

export function loadTopLevel(c: CountryConfig): Promise<RegionSeries> {
  return loadJson(`/data/${c.slug}/${c.top.id}.json`, (raw) => toRegionSeries(raw));
}

export function loadChildLevel(c: CountryConfig, parent: string): Promise<RegionSeries> {
  return loadJson(
    `/data/${c.slug}/${c.child.id}/${slugifyState(parent)}.json`,
    (raw) => toRegionSeries(raw)
  );
}

/** Boundary file for the top level, or for one parent's children. */
export function geoJsonUrl(c: CountryConfig, parent?: string | null): string {
  return parent
    ? `/geojson/${c.slug}/${c.child.id}/${slugifyState(parent)}.json`
    : `/geojson/${c.slug}/${c.top.id}.json`;
}

// ---------------------------------------------------------------------------
// Demo flag
// ---------------------------------------------------------------------------

/**
 * True while the country's data was written by `backend/make_demo_data.py`.
 * The pages show a warning banner for as long as this holds.
 */
export async function isDemoData(c: CountryConfig): Promise<boolean> {
  try {
    const res = await fetch("/data/countries.json");
    if (!res.ok) return false;
    const manifest = await res.json();
    return Boolean(manifest?.[c.slug]?.demo);
  } catch {
    return false;
  }
}
