/**
 * Plain-language names, per-country facts and constants for Ask the Index.
 * The UI and every report use these names; bare component codes never appear
 * in user-facing text.
 */

export type CountrySlug = "india" | "uk" | "nepal";
export const COUNTRY_SLUGS: CountrySlug[] = ["india", "uk", "nepal"];

/** Component keys as stored in the data files. */
export type ComponentCode = "T90S" | "T10S" | "PS" | "DS" | "W" | "SS";
export const COMPONENT_CODES: ComponentCode[] = ["T90S", "T10S", "PS", "W", "DS", "SS"];

export const COMPONENT_LABEL: Record<ComponentCode, string> = {
  T90S: "Extreme heat",
  T10S: "Extreme cold",
  PS: "Heavy rainfall",
  W: "Strong wind",
  DS: "Drought",
  SS: "Sea level",
};

/** Sign with which each component enters the composite (T10S enters negatively). */
export const COMPONENT_SIGN: Record<ComponentCode, 1 | -1> = {
  T90S: 1,
  T10S: -1,
  PS: 1,
  W: 1,
  DS: 1,
  SS: 1,
};

export const COMPOSITE_KEY = "COMPOSITE";

export interface CountryInfo {
  slug: CountrySlug;
  name: string;
  indexCode: string;
  indexName: string;
  /** Version string as shown on the site's home page. */
  version: string;
  topId: string;
  topLabel: string;
  childId: string;
  childLabel: string;
  components: ComponentCode[];
  /** Short example place for placeholders. */
  example: string;
}

export const COUNTRY_INFO: Record<CountrySlug, CountryInfo> = {
  india: {
    slug: "india",
    name: "India",
    indexCode: "IACI",
    indexName: "Indian Actuaries Climate Index",
    version: "Version 1.0",
    topId: "state",
    topLabel: "State",
    childId: "district",
    childLabel: "District",
    components: ["T90S", "T10S", "PS", "W", "DS", "SS"],
    example: "Guntur",
  },
  uk: {
    slug: "uk",
    name: "United Kingdom",
    indexCode: "UKACI",
    indexName: "UK Actuaries Climate Index",
    version: "Draft Version 1.0",
    topId: "nation",
    topLabel: "Nation",
    childId: "county_ua",
    childLabel: "County",
    components: ["T90S", "T10S", "PS", "W", "DS", "SS"],
    example: "Kent",
  },
  nepal: {
    slug: "nepal",
    name: "Nepal",
    indexCode: "NACI",
    indexName: "Nepal Actuaries Climate Index",
    version: "Version 1.0",
    topId: "province",
    topLabel: "Province",
    childId: "district",
    childLabel: "District",
    // Nepal is landlocked: sea level is not part of the index there at all.
    components: ["T90S", "T10S", "PS", "W", "DS"],
    example: "Kathmandu",
  },
};

export const BASELINE = "1991–2020";
export const DATA_SOURCE = "Copernicus (C3S) ERA5-Land and ORAS5 reanalysis";

/** Composite formula as set out on the methodology page (T10S enters negatively). */
export const COMPOSITE_FORMULA = {
  coastal: "(T90S − T10S + PS + W + DS + SS) / 6",
  inland: "(T90S − T10S + PS + W + DS) / 5",
};

/** Standing caveats attached to every report. */
export const STANDARD_CAVEATS = [
  "Values are standardized anomalies (z-scores) against the 1991–2020 baseline, not raw weather measurements.",
  "Figures are monthly averages over each district's area, so very local or short-lived events are smoothed out.",
  "Ranks run from 1 (highest value) among the years or months in the record.",
];

/** Named seasons. `months` are calendar months; winter spans the year boundary. */
export const SEASONS = {
  monsoon: { months: [6, 7, 8, 9], label: "Monsoon (Jun–Sep)" },
  summer: { months: [3, 4, 5], label: "Summer / pre-monsoon (Mar–May)" },
  post_monsoon: { months: [10, 11], label: "Post-monsoon (Oct–Nov)" },
  winter: { months: [12, 1, 2], label: "Winter (Dec–Feb)" },
} as const;
export type SeasonName = keyof typeof SEASONS;

export const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/** Renamed / alternative place names -> the name used in the data (normalized). */
export const PLACE_ALIASES: Record<string, string> = {
  gurgaon: "gurugram",
  bombay: "mumbai",
  madras: "chennai",
  calcutta: "kolkata",
  bangalore: "bengaluru",
  "bangalore urban": "bengaluru urban",
  "bangalore rural": "bengaluru rural",
  allahabad: "prayagraj",
  trivandrum: "thiruvananthapuram",
  vizag: "visakhapatnam",
  waltair: "visakhapatnam",
  "sambhaji nagar": "chhatrapati sambhaji nagar",
  "chhatrapati sambhajinagar": "chhatrapati sambhaji nagar",
  khurda: "khordha",
  pondicherry: "puducherry",
  orissa: "odisha",
  uttaranchal: "uttarakhand",
  "j&k": "jammu and kashmir",
  "jammu kashmir": "jammu and kashmir",
  "andaman and nicobar": "andaman nicobar",
  "andaman and nicobar islands": "andaman nicobar",
};
