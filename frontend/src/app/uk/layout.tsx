import type { Metadata } from "next";
import DemoBanner from "../../components/DemoBanner";
import { COUNTRY } from "../../lib/countries/uk";

/**
 * Wraps every page under /uk.
 *
 * UNLISTED, NOT PRIVATE. `noindex, nofollow` keeps search engines from listing
 * these pages, and nothing on the site links here, so the only way in is to be
 * given the URL. Anyone with the URL can still open it. To make the portal
 * public, delete `robots` below and turn the landing-page card into a link
 * (components/GeneralHero.tsx).
 *
 * It also shows the demo-data banner on every page while the data is fake.
 */
export const metadata: Metadata = {
  title: COUNTRY.indexName,
  robots: {
    index: false,
    follow: false,
    googleBot: { index: false, follow: false },
  },
};

export default function CountryLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <DemoBanner country={COUNTRY} />
      {children}
    </>
  );
}
