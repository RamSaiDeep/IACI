/**
 * THE ONLY UK-SPECIFIC FILE IN THE FRONTEND (apart from one entry in
 * components/Header.tsx).
 *
 * Every page under app/uk/ reads from this object. To make a portal for
 * another three-level country, copy this file, change the values, and point
 * the copied pages at the copy. See lib/countryPortal.ts for the full recipe.
 *
 * Keep `slug`, `indexCode`, `components` and the level ids in step with the
 * country's entry in backend/countries.py. They name the files the backend
 * writes, so a mismatch shows up as empty maps.
 */

import type { CountryConfig } from "../countryPortal";

export const COUNTRY: CountryConfig = {
  slug: "uk",
  name: "United Kingdom",
  indexCode: "UKACI",
  indexName: "UK Actuaries Climate Index",

  // Six components. SS (sea level) exists only for regions that touch the
  // coast; inland regions carry null for it and show "No Data", and their
  // composite is the five-component average. Same rule as India.
  components: ["T90S", "T10S", "PS", "W", "DS", "SS"],

  top: { id: "nation", label: "Nation", plural: "Nations" },
  child: { id: "county_ua", label: "County", plural: "Counties" }, // id = the pipeline's level name

  tagline:
    "A monthly, standardized measure of change in the frequency of climate extremes across the United Kingdom, reported for England, Scotland, Wales and Northern Ireland and for every county and unitary authority, on a 1991–2020 baseline.",

  facts: [
    { value: "4", label: "Nations" },
    { value: "218", label: "Counties & Unitary Authorities" },
    { value: "6", label: "Climate Hazards" },
    { value: "1991–2026", label: "Monthly Record" },
  ],

  boundarySource: [
    {
      label: "ONS Open Geography Portal (Counties and Unitary Authorities, Dec 2025)",
      href: "https://geoportal.statistics.gov.uk/",
    },
  ],

  notes: [
    "Counties follow the Office for National Statistics 'Counties and Unitary Authorities' layer: English counties and unitary authorities, Scottish council areas, Welsh principal areas and Northern Ireland's 11 council areas. The nation a county belongs to is read from the first letter of its ONS code.",
    "Nation values are the area-weighted average of their counties' values, component by component; the composite is then the mean of those components. The index itself is computed for the United Kingdom as a whole and for each county.",
    "Sea level is measured only where a region meets the sea. For coastal regions the composite averages all six components. For inland regions sea level shows as 'No Data' and the composite averages the other five, as the methodology sets out.",
  ],
};
