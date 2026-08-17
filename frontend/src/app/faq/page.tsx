"use client";

import { useState, useMemo } from "react";
import Header from "../../components/Header";
import Link from "next/link";

interface FAQItem {
  id: number;
  question: string;
  category: "Overview" | "Methodology" | "Datasets" | "Interpretation" | "Applications";
  answer: React.ReactNode;
}

export default function FAQPage() {
  const [openIds, setOpenIds] = useState<number[]>([1]); // First item open by default
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("All");

  const faqs: FAQItem[] = [
    {
      id: 1,
      category: "Overview",
      question: "What is the Indian Actuarial Climate Index (IACI)?",
      answer: (
        <div className="flex flex-col gap-3 text-foreground/80 leading-relaxed text-xs sm:text-sm">
          <p>
            The <strong className="text-foreground">Indian Actuarial Climate Index (IACI)</strong> is a standardized composite index developed to quantify changes in climate extremes over time, built specifically for actuarial applications like insurance pricing, catastrophe modelling, and financial risk management.
          </p>
          <p>
            Unlike traditional climate indicators, which track average conditions, the IACI focuses on <strong className="text-foreground">extreme events</strong> since these drive most insured and uninsured economic losses.
          </p>
        </div>
      )
    },
    {
      id: 2,
      category: "Overview",
      question: "What components make up the index, and why these six?",
      answer: (
        <div className="flex flex-col gap-3 text-foreground/80 leading-relaxed text-xs sm:text-sm">
          <p>
            The IACI is built from six standardized components, each capturing a distinct climate hazard:
          </p>
          <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 my-1">
            <li className="p-3 rounded-xl bg-foreground/3 border border-foreground/10 flex flex-col gap-1">
              <span className="font-bold text-foreground text-xs uppercase text-orange-600">Warm Temperature (T90S)</span>
              <span className="text-xs text-foreground/70">Frequency of unusually warm days and nights</span>
            </li>
            <li className="p-3 rounded-xl bg-foreground/3 border border-foreground/10 flex flex-col gap-1">
              <span className="font-bold text-foreground text-xs uppercase text-teal-600">Cold Temperature (T10S)</span>
              <span className="text-xs text-foreground/70">Frequency of unusually cold days and nights</span>
            </li>
            <li className="p-3 rounded-xl bg-foreground/3 border border-foreground/10 flex flex-col gap-1">
              <span className="font-bold text-foreground text-xs uppercase text-blue-600">Extreme Precipitation (P)</span>
              <span className="text-xs text-foreground/70">Monthly maximum consecutive five-day precipitation total</span>
            </li>
            <li className="p-3 rounded-xl bg-foreground/3 border border-foreground/10 flex flex-col gap-1">
              <span className="font-bold text-foreground text-xs uppercase text-amber-600">Drought (D)</span>
              <span className="text-xs text-foreground/70">Consecutive dry days anomaly</span>
            </li>
            <li className="p-3 rounded-xl bg-foreground/3 border border-foreground/10 flex flex-col gap-1">
              <span className="font-bold text-foreground text-xs uppercase text-sky-600">Wind (W)</span>
              <span className="text-xs text-foreground/70">Frequency of unusually high wind-speed days</span>
            </li>
            <li className="p-3 rounded-xl bg-foreground/3 border border-foreground/10 flex flex-col gap-1">
              <span className="font-bold text-foreground text-xs uppercase text-emerald-600">Sea Level (SS)</span>
              <span className="text-xs text-foreground/70">Monthly mean sea-level anomaly (coastal regions only)</span>
            </li>
          </ul>
          <p>
            These mirror the components used in comparable international frameworks (such as the North American Actuaries Climate Index), giving broad coverage of the physical hazards most relevant to actuarial risk.
          </p>
        </div>
      )
    },
    {
      id: 3,
      category: "Datasets",
      question: "What datasets were used to build the index?",
      answer: (
        <div className="flex flex-col gap-3 text-foreground/80 leading-relaxed text-xs sm:text-sm">
          <p>Two state-of-the-art reanalysis datasets are used:</p>
          <div className="flex flex-col gap-3">
            <div className="p-3.5 rounded-xl bg-foreground/3 border border-foreground/10 flex flex-col gap-1.5">
              <div className="flex items-center gap-2">
                <span className="text-xs font-black uppercase text-[#f26a21]">01. ECMWF ERA5-Land Reanalysis</span>
              </div>
              <p className="text-xs text-foreground/70">
                Provides hourly 2m air temperature (used to derive daily max/min temperature for the warm and cold components), daily total precipitation (used for the precipitation and drought components), and 10m U- and V-wind components (used for the wind component).
              </p>
            </div>
            <div className="p-3.5 rounded-xl bg-foreground/3 border border-foreground/10 flex flex-col gap-1.5">
              <div className="flex items-center gap-2">
                <span className="text-xs font-black uppercase text-teal-600">02. ECMWF ORAS5 Ocean Reanalysis</span>
              </div>
              <p className="text-xs text-foreground/70">
                Provides monthly mean sea level at coastal grid cells, used specifically for the sea-level anomaly component.
              </p>
            </div>
          </div>
        </div>
      )
    },
    {
      id: 4,
      category: "Methodology",
      question: "How does the grid system work, and how are regional values decided?",
      answer: (
        <div className="flex flex-col gap-3 text-foreground/80 leading-relaxed text-xs sm:text-sm">
          <p>
            The IACI follows a <strong className="text-foreground">&ldquo;grid-cell-first&rdquo; methodology</strong>: each climate component is first computed independently for every individual ERA5 grid cell present in the region, and only after standardization, these grid-cell values are aggregated up to the level of the study region.
          </p>
          <div className="p-3.5 rounded-xl bg-foreground/3 border border-foreground/10">
            <p className="text-xs text-foreground/75 font-medium">
              A region&apos;s value for any component is simply the <strong className="text-foreground">arithmetic mean across all grid cells</strong> within that region, with every grid cell contributing equally.
            </p>
          </div>
        </div>
      )
    },
    {
      id: 5,
      category: "Methodology",
      question: "What calculations are used to build the index?",
      answer: (
        <div className="flex flex-col gap-3 text-foreground/80 leading-relaxed text-xs sm:text-sm">
          <p>Every component follows the same general statistical framework:</p>
          <div className="flex flex-col gap-2.5">
            <div className="flex items-start gap-3 p-3 rounded-xl bg-foreground/3 border border-foreground/10">
              <span className="w-6 h-6 rounded-md bg-[#f26a21]/10 text-[#f26a21] flex items-center justify-center font-bold text-xs flex-shrink-0">a</span>
              <p className="text-xs text-foreground/75">
                For each grid cell and calendar month, a <strong>climatological mean</strong> and <strong>standard deviation</strong> are calculated over the 1991–2020 reference period, and the raw monthly statistic is standardized by subtracting the mean and dividing by the standard deviation.
              </p>
            </div>
            <div className="flex items-start gap-3 p-3 rounded-xl bg-foreground/3 border border-foreground/10">
              <span className="w-6 h-6 rounded-md bg-[#f26a21]/10 text-[#f26a21] flex items-center justify-center font-bold text-xs flex-shrink-0">b</span>
              <p className="text-xs text-foreground/75">
                <strong>Daily thresholds</strong> (like the 90th or 10th percentile) are computed using a centred five-day moving window around each calendar day, using data pooled across all 30 reference years.
              </p>
            </div>
            <div className="flex items-start gap-3 p-3 rounded-xl bg-foreground/3 border border-foreground/10">
              <span className="w-6 h-6 rounded-md bg-[#f26a21]/10 text-[#f26a21] flex items-center justify-center font-bold text-xs flex-shrink-0">c</span>
              <p className="text-xs text-foreground/75">
                This standardization approach is applied consistently across all six components before they&apos;re combined into the composite index.
              </p>
            </div>
          </div>
        </div>
      )
    },
    {
      id: 6,
      category: "Interpretation",
      question: "What do the final index values represent, and does the formula differ by region?",
      answer: (
        <div className="flex flex-col gap-3 text-foreground/80 leading-relaxed text-xs sm:text-sm">
          <p>
            The final composite index (IACI) shows how far current climate conditions have shifted from what was normal in the past (based on the 1991–2020 reference period). It is measured in <strong className="text-foreground">standard deviation units (z-scores)</strong>.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 my-1">
            <div className="p-3.5 rounded-xl bg-foreground/3 border border-foreground/10 flex flex-col gap-1.5">
              <span className="text-xs font-bold text-foreground uppercase tracking-wide">Coastal Regions</span>
              <code className="text-xs text-[#f26a21] font-mono font-bold bg-white/80 px-2 py-1 rounded border border-foreground/5 w-fit">
                IACI = (T90S + T10S + P + D + W + SS) / 6
              </code>
              <p className="text-[11px] text-foreground/60">
                All six standardized components including sea level are averaged together, each contributing equally (divided by 6).
              </p>
            </div>
            <div className="p-3.5 rounded-xl bg-foreground/3 border border-foreground/10 flex flex-col gap-1.5">
              <span className="text-xs font-bold text-foreground uppercase tracking-wide">Inland Regions</span>
              <code className="text-xs text-[#f26a21] font-mono font-bold bg-white/80 px-2 py-1 rounded border border-foreground/5 w-fit">
                IACI = (T90S + T10S + P + D + W) / 5
              </code>
              <p className="text-[11px] text-foreground/60">
                The sea-level component is excluded, and the remaining five components are averaged (divided by 5).
              </p>
            </div>
          </div>
          <div className="p-3.5 rounded-xl bg-foreground/3 border border-foreground/10 flex flex-col gap-1.5 text-xs text-foreground/75">
            <p>
              Since each component is a standardized value, it can, in principle, take on any positive or negative value:
            </p>
            <ul className="list-disc pl-4 space-y-1">
              <li><strong>Value near zero:</strong> indicates conditions close to the historical climatological baseline average.</li>
              <li><strong>Larger positive values:</strong> indicate that multiple climate hazards are simultaneously exceeding historical behavior — i.e., more extreme, hazardous conditions (whether warmer, colder, wetter, drier, windier, or higher sea level).</li>
            </ul>
          </div>
        </div>
      )
    },
    {
      id: 7,
      category: "Methodology",
      question: "Could additional components be added in the future?",
      answer: (
        <div className="flex flex-col gap-3 text-foreground/80 leading-relaxed text-xs sm:text-sm">
          <p>
            <strong className="text-foreground">Yes.</strong> The methodology has been designed to permit future refinement as improved datasets, higher-resolution climate products, or additional climate indicators become available, while preserving the core framework of standardized, reproducible measurement.
          </p>
        </div>
      )
    },
    {
      id: 8,
      category: "Applications",
      question: "What are the applications of the index?",
      answer: (
        <div className="flex flex-col gap-3 text-foreground/80 leading-relaxed text-xs sm:text-sm">
          <p>
            The framework is designed to support <strong className="text-foreground">actuarial risk assessment, insurance applications, climate-risk monitoring, regulatory reporting, and future research</strong>.
          </p>
          <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-900 leading-relaxed">
            <strong>Important distinction:</strong> The IACI provides an objective, reproducible measure of <em>physical climate hazard</em> that can be compared consistently across regions and over time. It measures hazard only, not exposure, vulnerability, or actual economic/insurance losses.
          </div>
        </div>
      )
    },
    {
      id: 9,
      category: "Methodology",
      question: "What do the 90th and 10th percentile thresholds mean in this methodology?",
      answer: (
        <div className="flex flex-col gap-3 text-foreground/80 leading-relaxed text-xs sm:text-sm">
          <p>
            These percentiles are used to decide what counts as an &ldquo;unusually&rdquo; warm, cold, or windy day:
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 my-1">
            <div className="p-3.5 rounded-xl bg-orange-500/5 border border-orange-500/20 flex flex-col gap-1.5">
              <span className="text-xs font-bold uppercase text-orange-600">90th Percentile (Warm / Wind Extreme)</span>
              <p className="text-xs text-foreground/75 leading-relaxed">
                Calculated by looking at <strong>150 past observations</strong> (5-day window × 30 reference years) for that specific calendar day and grid cell, then finding the value that only the top 10% of those observations exceed. Any day that goes above this becomes &ldquo;unusually warm&rdquo; or &ldquo;unusually windy.&rdquo;
              </p>
            </div>
            <div className="p-3.5 rounded-xl bg-teal-500/5 border border-teal-500/20 flex flex-col gap-1.5">
              <span className="text-xs font-bold uppercase text-teal-700">10th Percentile (Cold Extreme)</span>
              <p className="text-xs text-foreground/75 leading-relaxed">
                The same idea, but for unusually cold days. It is the value that only the bottom 10% of past observations fall below. Any day that goes below this counts as &ldquo;unusually cold.&rdquo;
              </p>
            </div>
          </div>
        </div>
      )
    }
  ];

  const categories = ["All", "Overview", "Methodology", "Datasets", "Interpretation", "Applications"];

  // Filtered FAQs
  const filteredFaqs = useMemo(() => {
    return faqs.filter((faq) => {
      const matchesCategory = selectedCategory === "All" || faq.category === selectedCategory;
      const matchesQuery =
        searchQuery.trim() === "" ||
        faq.question.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesCategory && matchesQuery;
    });
  }, [faqs, selectedCategory, searchQuery]);

  const toggleItem = (id: number) => {
    setOpenIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    );
  };

  const expandAll = () => setOpenIds(faqs.map((f) => f.id));
  const collapseAll = () => setOpenIds([]);

  return (
    <div className="min-h-screen bg-background font-sans flex flex-col">
      <Header />

      <main className="flex-1 max-w-5xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-8 sm:py-12 flex flex-col gap-8 sm:gap-10">
        
        {/* Header Hero Section */}
        <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#0b2b5f] via-[#103b7b] to-[#071d42] text-white p-6 sm:p-10 shadow-2xl border border-white/10">
          <div className="absolute top-0 right-0 -mt-10 -mr-10 w-80 h-80 bg-[#f26a21]/20 rounded-full blur-3xl pointer-events-none" />
          
          <div className="relative z-10 flex flex-col gap-3 sm:gap-4 max-w-2xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 backdrop-blur-md border border-white/15 w-fit">
              <span className="w-2 h-2 rounded-full bg-[#f26a21] animate-pulse" />
              <span className="text-[10px] sm:text-xs font-bold uppercase tracking-widest text-[#f26a21]">
                Knowledge Base &amp; Documentation
              </span>
            </div>

            <h1 className="text-2xl sm:text-4xl font-black tracking-tight uppercase leading-tight">
              Frequently Asked Questions
            </h1>

            <p className="text-xs sm:text-sm text-white/80 leading-relaxed font-light">
              Clear answers to essential questions regarding the <strong className="text-white font-semibold">Indian Actuarial Climate Index (IACI)</strong>, its scientific methodology, climate hazard components, dataset sources, and actuarial applications.
            </p>
          </div>
        </section>

        {/* Controls: Search & Category Chips & Expand/Collapse */}
        <div className="flex flex-col gap-4">
          <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
            {/* Search Input */}
            <div className="relative flex-1 max-w-md">
              <input
                type="text"
                placeholder="Search questions..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-4 py-2.5 bg-[#fcfcfa] text-foreground border border-foreground/10 rounded-xl focus:border-[#f26a21] focus:ring-1 focus:ring-[#f26a21] outline-none text-xs sm:text-sm placeholder:text-foreground/40 shadow-sm"
              />
              <svg
                className="w-4 h-4 text-foreground/40 absolute left-3 top-1/2 -translate-y-1/2"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>

            {/* Expand / Collapse All Buttons */}
            <div className="flex items-center gap-2 self-end sm:self-center">
              <button
                onClick={expandAll}
                className="px-3 py-1.5 rounded-lg border border-foreground/10 hover:border-foreground/30 bg-[#fcfcfa] text-foreground/70 hover:text-foreground text-[10px] sm:text-xs font-bold uppercase tracking-wider transition-colors shadow-sm"
              >
                Expand All
              </button>
              <button
                onClick={collapseAll}
                className="px-3 py-1.5 rounded-lg border border-foreground/10 hover:border-foreground/30 bg-[#fcfcfa] text-foreground/70 hover:text-foreground text-[10px] sm:text-xs font-bold uppercase tracking-wider transition-colors shadow-sm"
              >
                Collapse All
              </button>
            </div>
          </div>

          {/* Category Filter Chips */}
          <div className="flex items-center gap-1.5 sm:gap-2 overflow-x-auto pb-1 scrollbar-none">
            {categories.map((cat) => {
              const isActive = selectedCategory === cat;
              return (
                <button
                  key={cat}
                  onClick={() => setSelectedCategory(cat)}
                  className={`px-3 py-1.5 rounded-lg text-[10px] sm:text-xs font-bold tracking-wider uppercase whitespace-nowrap transition-all ${
                    isActive
                      ? "bg-[#f26a21] text-white shadow-md shadow-[#f26a21]/20"
                      : "bg-[#fcfcfa] border border-foreground/10 text-foreground/70 hover:border-foreground/30 hover:text-foreground"
                  }`}
                >
                  {cat}
                </button>
              );
            })}
          </div>
        </div>

        {/* FAQ Accordion List */}
        <div className="flex flex-col gap-3.5 sm:gap-4">
          {filteredFaqs.length === 0 ? (
            <div className="p-8 text-center border border-dashed border-foreground/15 rounded-2xl bg-foreground/2">
              <p className="text-xs sm:text-sm font-semibold text-foreground/50 uppercase tracking-wider">
                No matching questions found for &ldquo;{searchQuery}&rdquo;
              </p>
              <button
                onClick={() => {
                  setSearchQuery("");
                  setSelectedCategory("All");
                }}
                className="mt-3 text-xs font-bold text-[#f26a21] uppercase tracking-wider hover:underline"
              >
                Reset Filters
              </button>
            </div>
          ) : (
            filteredFaqs.map((faq) => {
              const isOpen = openIds.includes(faq.id);
              return (
                <div
                  key={faq.id}
                  className={`rounded-2xl border transition-all duration-200 overflow-hidden bg-[#fcfcfa] shadow-sm ${
                    isOpen ? "border-[#f26a21]/40 shadow-md ring-1 ring-[#f26a21]/20" : "border-foreground/10 hover:border-foreground/25"
                  }`}
                >
                  <button
                    onClick={() => toggleItem(faq.id)}
                    className="w-full text-left p-4 sm:p-5 flex items-start justify-between gap-3 sm:gap-4 transition-colors"
                  >
                    <div className="flex items-start gap-2.5 sm:gap-3.5">
                      <span className="w-6 h-6 rounded-lg bg-foreground/5 text-foreground/70 flex items-center justify-center font-bold text-xs flex-shrink-0 mt-0.5">
                        {faq.id}
                      </span>
                      <div className="flex flex-col gap-1">
                        <span className="text-[9px] font-bold uppercase tracking-widest text-[#f26a21]">
                          {faq.category}
                        </span>
                        <h3 className="text-xs sm:text-sm md:text-base font-bold text-foreground leading-snug">
                          {faq.question}
                        </h3>
                      </div>
                    </div>

                    <div className={`w-7 h-7 rounded-full flex items-center justify-center border flex-shrink-0 transition-transform duration-200 ${
                      isOpen ? "rotate-180 bg-[#f26a21] border-[#f26a21] text-white" : "border-foreground/10 text-foreground/60 bg-foreground/3"
                    }`}>
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
                      </svg>
                    </div>
                  </button>

                  {isOpen && (
                    <div className="px-4 sm:px-5 pb-5 sm:pb-6 pt-1 border-t border-foreground/5">
                      <div className="pl-8 sm:pl-9">
                        {faq.answer}
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Bottom CTA / Link to Explore & About */}
        <div className="p-6 sm:p-8 rounded-2xl bg-foreground/2 border border-foreground/10 flex flex-col sm:flex-row items-center justify-between gap-4 mt-4">
          <div className="flex flex-col gap-1 text-center sm:text-left">
            <h4 className="text-sm font-bold uppercase text-foreground">
              Looking to explore real climate data?
            </h4>
            <p className="text-xs text-foreground/60">
              Navigate interactive district &amp; state heatmaps or run comparative climate analyses.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/explore"
              className="px-4 py-2 rounded-xl bg-[#f26a21] text-white text-xs font-bold uppercase tracking-wider hover:bg-[#d65715] transition-all shadow-md"
            >
              Explore Map
            </Link>
            <Link
              href="/about"
              className="px-4 py-2 rounded-xl border border-foreground/10 hover:bg-foreground/5 text-foreground text-xs font-bold uppercase tracking-wider transition-all"
            >
              Methodology
            </Link>
          </div>
        </div>

      </main>
    </div>
  );
}
