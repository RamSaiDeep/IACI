/**
 * Server-side access to the index data in /public/data. Read with `fs` (the
 * same files the browser fetches), parsed once per country and cached in
 * module memory. Nothing here talks to an LLM.
 */

import fs from "node:fs";
import path from "node:path";
import { slugifyState } from "../climate";
import { COUNTRY_INFO, PLACE_ALIASES, type CountrySlug } from "./labels";

export interface Store {
  periods: number[];
  cols: Record<string, (number | null)[]>;
}

export type PlaceLevel = "country" | "top" | "child";

export interface Place {
  id: string;
  country: CountrySlug;
  level: PlaceLevel;
  levelLabel: string;
  /** Display name. */
  name: string;
  /** Region key exactly as in the data files (upper case). */
  key: string;
  parentId: string | null;
  parentName: string | null;
  store: Store;
  /** True when the place carries sea-level (SS) values. */
  coastal: boolean;
}

export interface CountryData {
  slug: CountrySlug;
  places: Map<string, Place>;
  first: number;
  last: number;
}

const ROOT = path.join(process.cwd(), "public", "data");

function readJson<T>(rel: string): T | null {
  const file = path.join(ROOT, rel);
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, "utf8")) as T;
}

type Row = [number, ...(number | null)[]];

function toStore(fields: string[], rows: Row[]): Store {
  const cols: Record<string, (number | null)[]> = {};
  fields.forEach((f) => (cols[f] = []));
  const periods: number[] = [];
  for (const row of rows) {
    periods.push(row[0]);
    fields.forEach((f, i) => cols[f].push(row[i + 1] ?? null));
  }
  return { periods, cols };
}

/** The composite column is stored under the country's own code; expose it as COMPOSITE. */
function normaliseStore(store: Store, indexCode: string): Store {
  if (store.cols[indexCode]) store.cols.COMPOSITE = store.cols[indexCode];
  return store;
}

const SMALL = new Set(["and", "of", "the", "on", "upon", "in", "with"]);

export function displayName(key: string): string {
  return key
    .replace(/#/g, "U") // the Bengaluru rows carry a lost character in the source data
    .toLowerCase()
    .split(/(\s+|-|\()/)
    .map((w, i) =>
      i > 0 && SMALL.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1)
    )
    .join("")
    .replace(/\bAnd\b/g, "and");
}

function makePlace(
  c: CountrySlug,
  level: PlaceLevel,
  levelLabel: string,
  key: string,
  store: Store,
  parent: Place | null,
  nameOverride?: string
): Place {
  const info = COUNTRY_INFO[c];
  const id =
    level === "country"
      ? c
      : level === "top"
        ? `${c}/${info.topId}/${key}`
        : `${c}/${info.childId}/${parent?.key}/${key}`;
  return {
    id,
    country: c,
    level,
    levelLabel,
    name: nameOverride ?? displayName(key),
    key,
    parentId: parent?.id ?? null,
    parentName: parent?.name ?? null,
    store,
    coastal: store.cols.SS ? store.cols.SS.some((v) => v != null) : false,
  };
}

const cache = new Map<CountrySlug, CountryData>();

export function loadCountry(c: CountrySlug): CountryData {
  const hit = cache.get(c);
  if (hit) return hit;
  const info = COUNTRY_INFO[c];
  const places = new Map<string, Place>();

  const country = readJson<{ fields: string[]; rows: Row[] }>(`${c}/country.json`);
  if (!country) throw new Error(`No data found for ${c}`);
  const countryPlace = makePlace(
    c, "country", "Country", info.name.toUpperCase(),
    normaliseStore(toStore(country.fields, country.rows), info.indexCode),
    null, info.name
  );
  places.set(countryPlace.id, countryPlace);

  const top = readJson<{ fields: string[]; regions: Record<string, Row[]> }>(
    `${c}/${info.topId}.json`
  );
  for (const [key, rows] of Object.entries(top?.regions ?? {})) {
    const p = makePlace(c, "top", info.topLabel, key,
      normaliseStore(toStore(top!.fields, rows), info.indexCode), countryPlace);
    places.set(p.id, p);
    const child = readJson<{ fields: string[]; regions: Record<string, Row[]> }>(
      `${c}/${info.childId}/${slugifyState(key)}.json`
    );
    for (const [ck, crows] of Object.entries(child?.regions ?? {})) {
      const cp = makePlace(c, "child", info.childLabel, ck,
        normaliseStore(toStore(child!.fields, crows), info.indexCode), p);
      places.set(cp.id, cp);
    }
  }

  const periods = countryPlace.store.periods;
  const data: CountryData = { slug: c, places, first: periods[0], last: periods[periods.length - 1] };
  cache.set(c, data);
  return data;
}

export function getPlace(id: string): Place | null {
  const c = id.split("/")[0] as CountrySlug;
  if (!COUNTRY_INFO[c]) return null;
  return loadCountry(c).places.get(id) ?? null;
}

// ---------------------------------------------------------------------------
// Place resolution
// ---------------------------------------------------------------------------

export function norm(s: string): string {
  return s
    .toLowerCase()
    .replace(/#/g, "u")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\b(district|city of|county|state)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function editDistance(a: string, b: string): number {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
  return dp[a.length][b.length];
}

export interface PlaceMatch {
  place: Place;
  /** exact | alias | prefix | fuzzy */
  how: "exact" | "alias" | "prefix" | "fuzzy";
}

/** All candidate places for a free-text name, best first. */
export function findPlaces(query: string, countries: CountrySlug[]): PlaceMatch[] {
  const q0 = norm(query);
  if (!q0) return [];
  const alias = PLACE_ALIASES[q0];
  const q = alias ?? q0;
  const out: PlaceMatch[] = [];
  for (const c of countries) {
    for (const p of loadCountry(c).places.values()) {
      const n = norm(p.name);
      if (n === q) out.push({ place: p, how: alias ? "alias" : "exact" });
      else if (q.length >= 4 && (n.startsWith(q + " ") || n.startsWith(q))) out.push({ place: p, how: "prefix" });
    }
  }
  if (out.length) return out;
  // Fuzzy: small edit distance on the whole name (typos such as "Guntoor").
  const max = q.length <= 5 ? 1 : 2;
  for (const c of countries) {
    for (const p of loadCountry(c).places.values()) {
      if (p.level === "country") continue;
      if (editDistance(norm(p.name), q) <= max) out.push({ place: p, how: "fuzzy" });
    }
  }
  return out;
}
