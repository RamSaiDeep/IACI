import type { Metadata } from "next";
import DemoBanner from "../../components/DemoBanner";
import { COUNTRY } from "../../lib/countries/uk";

/**
 * Wraps every page under /uk.
 *
 * The portal is public and indexable (the earlier `noindex, nofollow` robots
 * metadata was removed); the landing-page card links here.
 *
 * It also shows the demo-data banner on every page while the data is fake.
 */
export const metadata: Metadata = {
  title: COUNTRY.indexName,
};

export default function CountryLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <DemoBanner country={COUNTRY} />
      {children}
    </>
  );
}
