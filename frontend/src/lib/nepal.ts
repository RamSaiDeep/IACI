/**
 * Nepal's data layer.
 *
 * Everything specific to Nepal lives here so the India modules stay untouched:
 * its field list, its four-level hierarchy, and the paths its JSON sits at.
 * The generic parsing, caching and compact-row decoding are reused from
 * `climate.ts` — only the shape of the hierarchy differs, not the format.
 *
 * FOUR LEVELS, NOT THREE
 * ----------------------
 * India drills country → state → district. Nepal adds a fourth:
 * country → province → district → local level. Each child level is split into
 * one file per parent, so opening a district fetches only that district's
 * local levels (~200 KB) rather than all 753.
 *
 * NO SEA LEVEL
 * ------------
 * Nepal is landlocked. `SS` is not a null column in its data — it is absent
 * from the stores entirely, and the composite is the five-component equation
 * of methodology Section 10.3 at every cell.
 */

import { loadJson, slugifyState, toRegionSeries, toSeries } from "./climate";
import type { Field, RegionSeries, Series } from "./climate";

/** In the order the JSON rows carry them. */
export const NEPAL_FIELDS = ["NACI", "DS", "PS", "T10S", "T90S", "W"] as const;

/** Nepal's composite field — the counterpart of India's `IACI`. */
export const NEPAL_INDEX: Field = "NACI";

export type NepalLevel = "country" | "province" | "district" | "local";

/** Display labels for the drill-down, coarsest first. */
export const NEPAL_LEVELS: { id: NepalLevel; label: string; plural: string }[] = [
  { id: "country", label: "Nepal", plural: "Nepal" },
  { id: "province", label: "Province", plural: "Provinces" },
  { id: "district", label: "District", plural: "Districts" },
  { id: "local", label: "Local Level", plural: "Local Levels" },
];

const DATA_ROOT = "/data/nepal";
export const GEOJSON_ROOT = "/geojson/nepal";

/** The national series. */
export function loadNepal(): Promise<Series> {
  return loadJson(`${DATA_ROOT}/country.json`, (raw) =>
    toSeries(raw.rows ?? [], raw.fields)
  );
}

/** All seven provinces. */
export function loadProvinces(): Promise<RegionSeries> {
  return loadJson(`${DATA_ROOT}/province.json`, (raw) => toRegionSeries(raw));
}

/** The districts of one province. */
export function loadNepalDistricts(province: string): Promise<RegionSeries> {
  return loadJson(`${DATA_ROOT}/district/${slugifyState(province)}.json`, (raw) =>
    toRegionSeries(raw)
  );
}

/** The local levels of one district. */
export function loadLocalLevels(district: string): Promise<RegionSeries> {
  return loadJson(`${DATA_ROOT}/local/${slugifyState(district)}.json`, (raw) =>
    toRegionSeries(raw)
  );
}

/** Boundary file for a level, given its parent where the level is split. */
export function nepalGeoJsonUrl(level: NepalLevel, parent?: string | null): string | null {
  if (level === "province") return `${GEOJSON_ROOT}/province.json`;
  if (level === "district" && parent) {
    return `${GEOJSON_ROOT}/district/${slugifyState(parent)}.json`;
  }
  if (level === "local" && parent) {
    return `${GEOJSON_ROOT}/local/${slugifyState(parent)}.json`;
  }
  return null;
}
