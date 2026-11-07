"use client";

import { useEffect, useState } from "react";
import { isDemoData } from "../lib/countryPortal";
import type { CountryConfig } from "../lib/countryPortal";

/**
 * A loud warning shown while a country's data is the random placeholder from
 * `backend/make_demo_data.py`. It disappears by itself once
 * `backend/process_country_data.py` writes the real data.
 */
export default function DemoBanner({ country }: { country: CountryConfig }) {
  const [demo, setDemo] = useState(false);

  useEffect(() => {
    isDemoData(country).then(setDemo);
  }, [country]);

  if (!demo) return null;
  return (
    <div className="w-full bg-amber-400 text-amber-950 text-center text-xs font-bold tracking-wider uppercase px-4 py-2">
      Demo data: these numbers are random placeholders, not the {country.indexCode}. Do not
      publish.
    </div>
  );
}
