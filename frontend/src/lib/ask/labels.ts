/** Names the Ask page needs in the browser. The Python backend (backend/ask_api) owns everything else. */

export type CountrySlug = "india" | "uk" | "nepal";
export const COUNTRY_SLUGS: CountrySlug[] = ["india", "uk", "nepal"];

export const COUNTRY_INFO: Record<CountrySlug, { name: string; topLabel: string; childLabel: string; example: string }> = {
  india: { name: "India", topLabel: "State", childLabel: "District", example: "Guntur" },
  uk: { name: "United Kingdom", topLabel: "Nation", childLabel: "County", example: "Kent" },
  nepal: { name: "Nepal", topLabel: "Province", childLabel: "District", example: "Kathmandu" },
};

export const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
