"use client";

import { useState, useMemo } from "react";
import Link from "next/link";

type Category = "Overview" | "Methodology" | "Datasets" | "Interpretation" | "Applications";

interface FaqItem {
  id: number;
  category: Category;
  question: string;
  /** Plain-text mirror of the answer, so search covers the body too. */
  keywords: string;
  answer: React.ReactNode;
}

const CATEGORIES: ("All" | Category)[] = [
  "All",
  "Overview",
  "Methodology",
  "Datasets",
  "Interpretation",
  "Applications",
];

const componentSummary = [
  { name: "Warm Temperature (T90S)", tone: "text-orange-600", desc: "Frequency of unusually warm days and nights" },
  { name: "Cold Temperature (T10S)", tone: "text-teal-700", desc: "Frequency of unusually cold days and nights" },
  { name: "Extreme Precipitation (PS)", tone: "text-blue-600", desc: "Maximum consecutive five-day precipitation total" },
  { name: "Wind (W)", tone: "text-sky-600", desc: "Frequency of unusually high wind-speed days" },
  { name: "Drought & Dry Spell (DS)", tone: "text-amber-700", desc: "Consecutive dry days anomaly" },
  { name: "Sea Level (SS)", tone: "text-emerald-600", desc: "Monthly mean sea-level anomaly, coastal regions only" },
];

const FAQS: FaqItem[] = [
  {
    id: 1,
    category: "Overview",
    question: "What is the Indian Actuarial Climate Index (IACI)?",
    keywords:
      "composite index climate extremes actuarial insurance pricing catastrophe modelling financial risk management economic losses",
    answer: (
      <>
        <p>
          The <strong className="text-foreground">Indian Actuarial Climate Index (IACI)</strong> is a
          standardized composite index that quantifies changes in climate extremes over time, built
          specifically for actuarial applications such as insurance pricing, catastrophe modelling
          and financial risk management.
        </p>
        <p>
          Unlike traditional climate indicators, which track average conditions, the IACI focuses on{" "}
          <strong className="text-foreground">extreme events</strong> — these drive most insured and
          uninsured economic losses.
        </p>
      </>
    ),
  },
  {
    id: 2,
    category: "Overview",
    question: "What components make up the index, and why these six?",
    keywords:
      "six components T90S T10S PS DS W SS warm cold precipitation drought wind sea level North American Actuaries Climate Index",
    answer: (
      <>
        <p>The IACI is built from six standardized components, each capturing a distinct hazard:</p>
        <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 my-1">
          {componentSummary.map((c) => (
            <li
              key={c.name}
              className="p-3 rounded-xl bg-surface-muted/70 border border-foreground/8 flex flex-col gap-1"
            >
              <span className={`font-bold text-xs uppercase ${c.tone}`}>{c.name}</span>
              <span className="text-xs text-foreground/70">{c.desc}</span>
            </li>
          ))}
        </ul>
        <p>
          These mirror the components used in comparable international frameworks such as the North
          American Actuaries Climate Index, giving broad coverage of the physical hazards most
          relevant to actuarial risk.
        </p>
      </>
    ),
  },
  {
    id: 3,
    category: "Datasets",
    question: "What datasets were used to build the index?",
    keywords:
      "ERA5-Land ORAS5 ECMWF reanalysis hourly 2m air temperature daily total precipitation 10m U V wind sea level",
    answer: (
      <>
        <p>Two state-of-the-art reanalysis datasets are used:</p>
        <div className="flex flex-col gap-3">
          <div className="p-3.5 rounded-xl bg-surface-muted/70 border border-foreground/8 flex flex-col gap-1.5">
            <span className="text-xs font-black uppercase tracking-wide text-accent">
              01 · ECMWF ERA5-Land reanalysis
            </span>
            <p className="text-xs text-foreground/70">
              Hourly 2 m air temperature (used to derive daily max/min for the warm and cold
              components), daily total precipitation (for the precipitation and drought components),
              and 10 m U- and V-wind components (for the wind component).
            </p>
          </div>
          <div className="p-3.5 rounded-xl bg-surface-muted/70 border border-foreground/8 flex flex-col gap-1.5">
            <span className="text-xs font-black uppercase tracking-wide text-teal-700">
              02 · ECMWF ORAS5 ocean reanalysis
            </span>
            <p className="text-xs text-foreground/70">
              Monthly mean sea level at coastal grid cells, used for the sea-level anomaly component.
            </p>
          </div>
        </div>
      </>
    ),
  },
  {
    id: 4,
    category: "Methodology",
    question: "How does the grid system work, and how are regional values decided?",
    keywords:
      "grid cell first methodology aggregation arithmetic mean region standardization ERA5 grid cells equally weighted",
    answer: (
      <>
        <p>
          The IACI follows a <strong className="text-foreground">grid-cell-first methodology</strong>
          : each component is computed independently for every individual ERA5 grid cell in the
          region, and only after standardization are those values aggregated up to the study region.
        </p>
        <div className="p-3.5 rounded-xl bg-surface-muted/70 border border-foreground/8">
          <p className="text-xs text-foreground/75 font-medium">
            A region&apos;s value for any component is the{" "}
            <strong className="text-foreground">arithmetic mean across all grid cells</strong> within
            that region, with every grid cell contributing equally.
          </p>
        </div>
      </>
    ),
  },
  {
    id: 5,
    category: "Methodology",
    question: "What calculations are used to build the index?",
    keywords:
      "climatological mean standard deviation 1991-2020 reference period standardize z-score daily thresholds 90th 10th percentile five-day moving window",
    answer: (
      <>
        <p>Every component follows the same general statistical framework:</p>
        <div className="flex flex-col gap-2.5">
          {[
            <>
              For each grid cell and calendar month, a <strong>climatological mean</strong> and{" "}
              <strong>standard deviation</strong> are calculated over the 1991–2020 reference period,
              and the raw monthly statistic is standardized by subtracting the mean and dividing by
              the standard deviation.
            </>,
            <>
              <strong>Daily thresholds</strong> (such as the 90th or 10th percentile) are computed
              using a centred five-day moving window around each calendar day, pooling data across
              all 30 reference years.
            </>,
            <>
              This standardization is applied consistently across all six components before they are
              combined into the composite index.
            </>,
          ].map((body, idx) => (
            <div
              key={idx}
              className="flex items-start gap-3 p-3 rounded-xl bg-surface-muted/70 border border-foreground/8"
            >
              <span className="w-6 h-6 rounded-md bg-accent/10 text-accent flex items-center justify-center font-bold text-xs flex-shrink-0">
                {"abc"[idx]}
              </span>
              <p className="text-xs text-foreground/75">{body}</p>
            </div>
          ))}
        </div>
      </>
    ),
  },
  {
    id: 6,
    category: "Interpretation",
    question: "What do the final index values represent, and does the formula differ by region?",
    keywords:
      "z-score standard deviation units coastal inland formula divided by 6 5 near zero baseline positive values hazard",
    answer: (
      <>
        <p>
          The composite shows how far current conditions have shifted from what was normal in the
          past (the 1991–2020 reference period), measured in{" "}
          <strong className="text-foreground">standard deviation units (z-scores)</strong>.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 my-1">
          {[
            {
              label: "Coastal regions",
              formula: "IACI = (T90S + T10S + PS + W + DS + SS) / 6",
              note: "All six standardized components, including sea level, contribute equally.",
            },
            {
              label: "Inland regions",
              formula: "IACI = (T90S + T10S + PS + W + DS) / 5",
              note: "The sea-level component is excluded and the remaining five are averaged.",
            },
          ].map((row) => (
            <div
              key={row.label}
              className="p-3.5 rounded-xl bg-surface-muted/70 border border-foreground/8 flex flex-col gap-1.5"
            >
              <span className="text-xs font-bold uppercase tracking-wide">{row.label}</span>
              <code className="text-[11px] text-accent font-mono font-bold bg-surface px-2 py-1 rounded-lg border border-foreground/8 overflow-x-auto">
                {row.formula}
              </code>
              <p className="text-[11px] text-foreground/60">{row.note}</p>
            </div>
          ))}
        </div>
        <div className="p-3.5 rounded-xl bg-surface-muted/70 border border-foreground/8 flex flex-col gap-1.5 text-xs text-foreground/75">
          <p>Since each component is standardized, it can take any positive or negative value:</p>
          <ul className="list-disc pl-4 space-y-1">
            <li>
              <strong>Near zero:</strong> conditions close to the historical baseline average.
            </li>
            <li>
              <strong>Larger positive values:</strong> multiple hazards simultaneously exceeding
              historical behaviour — more extreme conditions, whether warmer, colder, wetter, drier,
              windier or higher sea level.
            </li>
          </ul>
        </div>
      </>
    ),
  },
  {
    id: 7,
    category: "Methodology",
    question: "Could additional components be added in the future?",
    keywords: "future refinement higher resolution datasets additional indicators extensible framework",
    answer: (
      <p>
        <strong className="text-foreground">Yes.</strong> The methodology is designed to permit
        future refinement as improved datasets, higher-resolution climate products or additional
        indicators become available, while preserving the core framework of standardized,
        reproducible measurement.
      </p>
    ),
  },
  {
    id: 8,
    category: "Applications",
    question: "What are the applications of the index?",
    keywords:
      "actuarial risk assessment insurance climate risk monitoring regulatory reporting research hazard exposure vulnerability losses",
    answer: (
      <>
        <p>
          The framework supports{" "}
          <strong className="text-foreground">
            actuarial risk assessment, insurance applications, climate-risk monitoring, regulatory
            reporting and further research
          </strong>
          .
        </p>
        <div className="p-3.5 rounded-xl bg-amber-500/8 border border-amber-500/20 text-xs text-amber-900 leading-relaxed">
          <strong>Important distinction:</strong> the IACI provides an objective, reproducible
          measure of <em>physical climate hazard</em> that compares consistently across regions and
          over time. It measures hazard only — not exposure, vulnerability, or actual economic and
          insurance losses.
        </div>
      </>
    ),
  },
  {
    id: 9,
    category: "Methodology",
    question: "What do the 90th and 10th percentile thresholds mean?",
    keywords:
      "90th percentile 10th percentile 150 observations five-day window 30 reference years unusually warm cold windy day threshold",
    answer: (
      <>
        <p>
          These percentiles decide what counts as an &ldquo;unusually&rdquo; warm, cold or windy day:
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 my-1">
          <div className="p-3.5 rounded-xl bg-orange-500/5 border border-orange-500/20 flex flex-col gap-1.5">
            <span className="text-xs font-bold uppercase text-orange-600">
              90th percentile — warm / wind
            </span>
            <p className="text-xs text-foreground/75 leading-relaxed">
              Calculated from <strong>150 past observations</strong> (a 5-day window × 30 reference
              years) for that specific calendar day and grid cell, then taking the value only the top
              10% exceed. Any day above it is &ldquo;unusually warm&rdquo; or &ldquo;unusually
              windy&rdquo;.
            </p>
          </div>
          <div className="p-3.5 rounded-xl bg-teal-500/5 border border-teal-500/20 flex flex-col gap-1.5">
            <span className="text-xs font-bold uppercase text-teal-700">
              10th percentile — cold
            </span>
            <p className="text-xs text-foreground/75 leading-relaxed">
              The same idea for unusually cold days: the value only the bottom 10% of past
              observations fall below. Any day below it counts as &ldquo;unusually cold&rdquo;.
            </p>
          </div>
        </div>
      </>
    ),
  },
];

export default function FaqSection() {
  const [openIds, setOpenIds] = useState<number[]>([1]);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<"All" | Category>("All");

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return FAQS.filter((faq) => {
      const matchesCategory = category === "All" || faq.category === category;
      const matchesQuery =
        needle === "" ||
        faq.question.toLowerCase().includes(needle) ||
        faq.keywords.toLowerCase().includes(needle);
      return matchesCategory && matchesQuery;
    });
  }, [query, category]);

  const toggle = (id: number) =>
    setOpenIds((prev) => (prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]));

  return (
    <section id="faq" className="flex flex-col gap-9 scroll-mt-24">
      <header className="flex flex-col gap-2.5 max-w-2xl">
        <span className="eyebrow">Knowledge base</span>
        <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight uppercase leading-tight">
          Frequently asked questions
        </h2>
        <p className="text-sm text-foreground/60 leading-relaxed">
          Answers on the statistical framework, percentile thresholds, ERA5 and ORAS5 datasets, and
          actuarial applications.
        </p>
      </header>

      <div className="flex flex-col gap-4">
        <div className="flex flex-col sm:flex-row gap-3 sm:items-center justify-between">
          <div className="relative flex-1 max-w-md">
            <label htmlFor="faq-search" className="sr-only">
              Search questions
            </label>
            <input
              id="faq-search"
              type="search"
              placeholder="Search questions…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="field !pl-9 !py-2.5 !text-sm !font-normal !tracking-normal placeholder:text-foreground/40"
            />
            <svg
              className="w-4 h-4 text-foreground/40 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
          </div>

          <div className="flex items-center gap-2 self-end sm:self-center">
            <button
              onClick={() => setOpenIds(FAQS.map((f) => f.id))}
              className="px-3 py-1.5 rounded-lg border border-foreground/10 hover:border-foreground/30 bg-surface text-foreground/70 hover:text-foreground text-[11px] font-bold uppercase tracking-widest transition-colors"
            >
              Expand all
            </button>
            <button
              onClick={() => setOpenIds([])}
              className="px-3 py-1.5 rounded-lg border border-foreground/10 hover:border-foreground/30 bg-surface text-foreground/70 hover:text-foreground text-[11px] font-bold uppercase tracking-widest transition-colors"
            >
              Collapse all
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
          {CATEGORIES.map((cat) => (
            <button
              key={cat}
              onClick={() => setCategory(cat)}
              aria-pressed={category === cat}
              className={`px-3 py-1.5 rounded-lg text-[11px] font-bold tracking-widest uppercase whitespace-nowrap transition-colors ${
                category === cat
                  ? "bg-accent text-white shadow-card"
                  : "bg-surface border border-foreground/10 text-foreground/65 hover:border-foreground/30 hover:text-foreground"
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-4">
        {filtered.length === 0 ? (
          <div className="p-8 text-center border border-dashed border-foreground/15 rounded-2xl">
            <p className="text-sm font-semibold text-foreground/50 uppercase tracking-widest">
              No matching questions
            </p>
            <button
              onClick={() => {
                setQuery("");
                setCategory("All");
              }}
              className="mt-3 text-xs font-bold text-accent uppercase tracking-widest hover:underline"
            >
              Reset filters
            </button>
          </div>
        ) : (
          filtered.map((faq) => {
            const isOpen = openIds.includes(faq.id);
            return (
              <article
                key={faq.id}
                className={`card overflow-hidden transition-shadow ${
                  isOpen ? "ring-1 ring-accent/25 shadow-card-lg" : ""
                }`}
              >
                <h4>
                  <button
                    onClick={() => toggle(faq.id)}
                    aria-expanded={isOpen}
                    aria-controls={`faq-panel-${faq.id}`}
                    className="w-full text-left p-5 sm:p-6 flex items-start justify-between gap-4"
                  >
                    <span className="flex items-start gap-4">
                      <span className="w-7 h-7 rounded-lg bg-foreground/5 text-foreground/60 flex items-center justify-center font-bold text-xs flex-shrink-0 mt-0.5">
                        {faq.id}
                      </span>
                      <span className="flex flex-col gap-1.5">
                        <span className="text-[9px] font-bold uppercase tracking-widest text-accent">
                          {faq.category}
                        </span>
                        <span className="text-base font-bold leading-snug">{faq.question}</span>
                      </span>
                    </span>

                    <span
                      className={`w-7 h-7 rounded-full flex items-center justify-center border flex-shrink-0 transition-transform duration-200 ${
                        isOpen
                          ? "rotate-180 bg-accent border-accent text-white"
                          : "border-foreground/10 text-foreground/55"
                      }`}
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2.5}
                          d="M19 9l-7 7-7-7"
                        />
                      </svg>
                    </span>
                  </button>
                </h4>

                {isOpen && (
                  <div
                    id={`faq-panel-${faq.id}`}
                    className="px-5 sm:px-6 pb-6 pt-2 border-t border-foreground/5"
                  >
                    <div className="sm:pl-11 flex flex-col gap-4 text-foreground/70 leading-relaxed text-sm">
                      {faq.answer}
                    </div>
                  </div>
                )}
              </article>
            );
          })
        )}
      </div>

      <div className="card p-6 sm:p-7 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex flex-col gap-1 text-center sm:text-left">
          <h4 className="text-sm font-bold uppercase tracking-tight">
            Ready to look at the data?
          </h4>
          <p className="text-xs text-foreground/60">
            Browse district and state choropleths, or compare two regions and periods side by side.
          </p>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          <Link
            href="/explore"
            className="px-4 py-2.5 rounded-xl bg-accent text-white text-xs font-bold uppercase tracking-widest hover:bg-accent-strong transition-colors shadow-card"
          >
            Explore map
          </Link>
          <Link
            href="/analyze"
            className="px-4 py-2.5 rounded-xl border border-foreground/12 hover:bg-foreground/5 text-xs font-bold uppercase tracking-widest transition-colors"
          >
            Compare
          </Link>
        </div>
      </div>
    </section>
  );
}
