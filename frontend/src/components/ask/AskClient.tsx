"use client";

import { useEffect, useRef, useState } from "react";
import { ApiError, ask, loadKey, loadModel, readSharedRequest } from "../../lib/ask/client";
import { COUNTRY_INFO, COUNTRY_SLUGS, MONTH_NAMES, type CountrySlug } from "../../lib/ask/labels";
import { DEFAULT_MODEL } from "../../lib/ask/providers/types";
import type { AskRequest, ClarifyResponse, Feature, GuidedParams, ReportCard } from "../../lib/ask/report-types";
import KeyPanel, { type KeyState } from "./KeyPanel";
import ReportView from "./ReportView";

type Mode = Feature;

const CARDS: { mode: Mode; title: string; blurb: string; example: string; icon: string }[] = [
  { mode: "year", title: "Year in review", blurb: "How one place's year went, which months and hazards stood out, and how it ranks since 1991.", example: "“How was 2024 for Guntur?”", icon: "M3 4h18v18H3zM16 2v4M8 2v4M3 10h18" },
  { mode: "compare", title: "Compare places", blurb: "Two places side by side over a period: which faces more of each hazard, and why they differ.", example: "“Chennai vs Hyderabad, 2015–2025”", icon: "M3 4h7v16H3zM14 4h7v16h-7z" },
  { mode: "screen", title: "Find places", blurb: "A ranked list of districts for any hazard and period, with a chart of the result.", example: "“Worst drought districts in Maharashtra”", icon: "M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" },
  { mode: "event", title: "Explain an event", blurb: "What the index recorded during a flood, heatwave or drought, and how rare it was for that place.", example: "“Wayanad, July 2024”", icon: "M22 12h-4l-3 9L9 3l-3 9H2" },
];

const EXAMPLES = [
  "Which Odisha districts had the worst rainfall extremes in monsoon 2024?",
  "Where is drought getting worse fastest?",
  "Chennai vs Hyderabad, 2015–2025",
  "Top 10 districts for extreme heat in summer 2024",
  "How was 2024 for Guntur district?",
  "What drove the high index in Assam in June 2022?",
];

const HAZARDS: [string, string][] = [
  ["composite", "Overall index"], ["heat", "Extreme heat"], ["cold", "Extreme cold"],
  ["rainfall", "Heavy rainfall"], ["drought", "Drought"], ["wind", "Strong wind"], ["sea level", "Sea level"],
];

const PERIODS: { id: string; label: string; apply: (p: GuidedParams) => void }[] = [
  { id: "monsoon2024", label: "Monsoon 2024", apply: (p) => { p.season = "monsoon"; p.periodYear = 2024; } },
  { id: "summer2024", label: "Summer 2024", apply: (p) => { p.season = "summer"; p.periodYear = 2024; } },
  { id: "year2024", label: "Year 2024", apply: (p) => { p.periodYear = 2024; } },
  { id: "last10", label: "Last 10 years", apply: (p) => { p.lastYears = 10; } },
  { id: "all", label: "Whole record (1991 onwards)", apply: () => {} },
];

const YEARS = Array.from({ length: 2026 - 1991 + 1 }, (_, i) => 2026 - i);

const field = "min-h-11 rounded-xl border border-foreground/20 bg-surface px-3 text-[15px]";

function Field({ id, label, children }: { id: string; label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium">{label}</label>
      {children}
    </div>
  );
}

export default function AskClient() {
  const [country, setCountry] = useState<CountrySlug>("india");
  const [question, setQuestion] = useState("");
  const [mode, setMode] = useState<Mode>("year");
  const [keyState, setKeyState] = useState<KeyState>({ key: "", store: null, demo: false, model: DEFAULT_MODEL });
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState<ReportCard | null>(null);
  const [clarify, setClarify] = useState<{ c: ClarifyResponse; req: AskRequest } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [shared, setShared] = useState<AskRequest | null>(null);
  const resultRef = useRef<HTMLDivElement>(null);

  // guided form state
  const [place, setPlace] = useState("");
  const [placeB, setPlaceB] = useState("");
  const [year, setYear] = useState(2024);
  const [fromYear, setFromYear] = useState(2015);
  const [toYear, setToYear] = useState(2025);
  const [region, setRegion] = useState("");
  const [hazard, setHazard] = useState("composite");
  const [period, setPeriod] = useState("monsoon2024");
  const [rankBy, setRankBy] = useState<"most_extreme" | "fastest_worsening">("most_extreme");
  const [month, setMonth] = useState(7);
  const [news, setNews] = useState(false);

  // Restore the key and any shared request once, after mount (storage is client-only).
  useEffect(() => {
    const k = loadKey();
    const m = loadModel();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setKeyState((s) => ({ ...s, key: k.key, store: k.store, model: m ?? s.model }));
    setShared(readSharedRequest());
  }, []);

  const hasAccess = !!keyState.key || keyState.demo;
  const info = COUNTRY_INFO[country];
  const hazards = HAZARDS.filter(([id]) => !(country === "nepal" && id === "sea level"));

  async function run(req: AskRequest) {
    setError(null);
    setClarify(null);
    if (!hasAccess) {
      setError("Add your API key above to get answers. The forms work, but the writing needs a model.");
      return;
    }
    setBusy(true);
    try {
      const out = await ask({ ...req, model: keyState.model }, keyState.key, keyState.demo);
      if (out.kind === "report") setReport(out.report);
      else { setReport(null); setClarify({ c: out, req }); }
      setTimeout(() => resultRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  const askFree = (q: string, previous?: AskRequest["previous"]) =>
    run({ mode: "free", country, question: q, previous });

  const submitGuided = () => {
    const params: GuidedParams = {};
    if (mode === "year") Object.assign(params, { place, year });
    if (mode === "compare") Object.assign(params, { place, placeB, fromYear, toYear });
    if (mode === "screen") {
      Object.assign(params, { region: region || undefined, component: hazard, rankBy });
      PERIODS.find((p) => p.id === period)?.apply(params);
    }
    if (mode === "event") Object.assign(params, { place, month, year, news });
    void run({ mode, country, params });
  };

  const guidedReady =
    mode === "year" ? !!place.trim() : mode === "compare" ? !!place.trim() && !!placeB.trim() : mode === "event" ? !!place.trim() : true;

  const followUp = (q: string) =>
    askFree(q, report ? { question: report.request.question, feature: report.feature, summary: `${report.title}. ${report.headline}` } : undefined);

  return (
    <div className="flex flex-col gap-10">
      <style>{`@media print{header,footer,.no-print{display:none!important}main{padding:0!important}}`}</style>

      {shared && !report && (
        <div className="no-print flex flex-wrap items-center gap-3 rounded-xl border border-accent/40 bg-accent/5 p-4 text-sm" role="status">
          <span>A shared question was loaded: <strong>{shared.question ?? `${shared.mode} report`}</strong>.</span>
          <button type="button" className="min-h-11 rounded-xl bg-accent px-4 font-semibold text-white" onClick={() => { setCountry(shared.country); void run(shared); setShared(null); }}>Run it</button>
        </div>
      )}

      {/* Question box */}
      <section className="no-print flex flex-col items-center gap-5 text-center">
        <span className="eyebrow">Ask the Index · AI assistant</span>
        <h1 className="max-w-3xl text-3xl font-bold leading-tight tracking-tight sm:text-5xl">Ask anything about climate extremes</h1>
        <p className="max-w-2xl text-base text-foreground/70 sm:text-lg">
          Get a written answer, a chart and a table, built from the index&apos;s own monthly values. No component codes needed.
        </p>

        <form className="flex w-full max-w-3xl flex-col gap-3 rounded-2xl border border-foreground/10 bg-surface p-4 text-left shadow-card"
          onSubmit={(e) => { e.preventDefault(); if (question.trim()) void askFree(question.trim()); }}>
          <label htmlFor="ask" className="sr-only">Your question</label>
          <input id="ask" type="text" value={question} onChange={(e) => setQuestion(e.target.value)} maxLength={500}
            placeholder={`e.g. How was 2024 for ${info.example}?`}
            className="w-full bg-transparent px-2 py-3 text-lg outline-none" />
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-foreground/10 pt-3">
            <div role="group" aria-label="Country" className="flex flex-wrap items-center gap-2">
              <span className="mr-1 text-sm text-foreground/60">Country</span>
              {COUNTRY_SLUGS.map((c) => (
                <button key={c} type="button" aria-pressed={country === c} onClick={() => setCountry(c)}
                  className={`min-h-11 rounded-full px-4 text-sm ${country === c ? "bg-accent font-semibold text-white" : "bg-surface-muted text-foreground/80"}`}>
                  {COUNTRY_INFO[c].name}
                </button>
              ))}
            </div>
            <button type="submit" disabled={busy || !question.trim()} className="min-h-12 rounded-xl bg-accent px-7 text-base font-semibold text-white disabled:opacity-50">
              {busy ? "Working…" : "Ask →"}
            </button>
          </div>
        </form>
      </section>

      <div className="no-print"><KeyPanel state={keyState} onChange={setKeyState} /></div>

      {/* Result area */}
      <div ref={resultRef} aria-live="polite" className="flex flex-col gap-4 scroll-mt-24">
        {busy && <p className="rounded-xl bg-surface p-4 text-sm shadow-card" role="status">Looking up the index values and writing the answer…</p>}
        {error && <p role="alert" className="rounded-xl border border-rose-600/30 bg-rose-600/10 p-4 text-sm text-rose-800">{error}</p>}
        {clarify && (
          <div className="rounded-xl border border-accent/40 bg-surface p-5 shadow-card">
            <p className="font-semibold">{clarify.c.question}</p>
            {clarify.c.options.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {clarify.c.options.map((o) => (
                  <button key={o.id ?? o.label} type="button" disabled={busy}
                    onClick={() => void run({ ...clarify.req, resolved: { ...clarify.req.resolved, [(clarify.c.query ?? "").toLowerCase()]: o.id ?? "" } })}
                    className="min-h-11 rounded-full border border-foreground/20 px-4 text-sm hover:border-accent">{o.label}</button>
                ))}
              </div>
            )}
            {clarify.c.options.length === 0 && <p className="mt-1 text-sm text-foreground/60">Reword your question above and ask again.</p>}
          </div>
        )}
        {report && <ReportView report={report} busy={busy} onFollowUp={followUp} />}
      </div>

      {/* Starting points */}
      <section aria-labelledby="start-h" className="no-print flex flex-col gap-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="start-h" className="text-xl font-bold">Or pick a starting point</h2>
          <span className="text-sm text-foreground/60">Each one opens a short guided form</span>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {CARDS.map((c) => (
            <button key={c.mode} type="button" aria-pressed={mode === c.mode} onClick={() => setMode(c.mode)}
              className={`flex flex-col gap-3 rounded-2xl p-5 text-left ${mode === c.mode ? "bg-accent/5 shadow-card ring-2 ring-accent" : "bg-surface ring-1 ring-foreground/15 hover:ring-accent/60"}`}>
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-accent/10">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#f26a21" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={c.icon} /></svg>
              </span>
              <span className="text-lg font-semibold">{c.title}</span>
              <span className="text-sm text-foreground/70">{c.blurb}</span>
              <span className="rounded-lg bg-surface-muted px-2.5 py-2 text-sm">{c.example}</span>
            </button>
          ))}
        </div>

        <form className="flex flex-col gap-4 rounded-2xl border border-foreground/10 bg-surface p-5 sm:p-6" onSubmit={(e) => { e.preventDefault(); submitGuided(); }}>
          <h3 className="text-lg font-semibold">{CARDS.find((c) => c.mode === mode)!.title}</h3>
          <div className="grid items-end gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {mode === "year" && (<>
              <Field id="yr-place" label={`${info.childLabel} or ${info.topLabel.toLowerCase()}`}><input id="yr-place" className={field} value={place} onChange={(e) => setPlace(e.target.value)} placeholder={`Start typing, e.g. ${info.example}`} /></Field>
              <Field id="yr-year" label="Year"><select id="yr-year" className={field} value={year} onChange={(e) => setYear(+e.target.value)}>{YEARS.map((y) => <option key={y}>{y}</option>)}</select></Field>
            </>)}
            {mode === "compare" && (<>
              <Field id="cmp-a" label="First place"><input id="cmp-a" className={field} value={place} onChange={(e) => setPlace(e.target.value)} placeholder="e.g. Chennai" /></Field>
              <Field id="cmp-b" label="Second place"><input id="cmp-b" className={field} value={placeB} onChange={(e) => setPlaceB(e.target.value)} placeholder="e.g. Hyderabad" /></Field>
              <Field id="cmp-from" label="From"><select id="cmp-from" className={field} value={fromYear} onChange={(e) => setFromYear(+e.target.value)}>{YEARS.map((y) => <option key={y}>{y}</option>)}</select></Field>
              <Field id="cmp-to" label="To"><select id="cmp-to" className={field} value={toYear} onChange={(e) => setToYear(+e.target.value)}>{YEARS.map((y) => <option key={y}>{y}</option>)}</select></Field>
            </>)}
            {mode === "screen" && (<>
              <Field id="fd-region" label="Within"><input id="fd-region" className={field} value={region} onChange={(e) => setRegion(e.target.value)} placeholder={`All ${info.name}, or a ${info.topLabel.toLowerCase()}`} /></Field>
              <Field id="fd-hazard" label="Hazard"><select id="fd-hazard" className={field} value={hazard} onChange={(e) => setHazard(e.target.value)}>{hazards.map(([id, l]) => <option key={id} value={id}>{l}</option>)}</select></Field>
              <Field id="fd-period" label="Period"><select id="fd-period" className={field} value={period} onChange={(e) => setPeriod(e.target.value)}>{PERIODS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}</select></Field>
              <Field id="fd-rank" label="Rank by"><select id="fd-rank" className={field} value={rankBy} onChange={(e) => setRankBy(e.target.value as typeof rankBy)}><option value="most_extreme">Most extreme</option><option value="fastest_worsening">Fastest worsening</option></select></Field>
            </>)}
            {mode === "event" && (<>
              <Field id="ev-place" label="Place"><input id="ev-place" className={field} value={place} onChange={(e) => setPlace(e.target.value)} placeholder="e.g. Wayanad" /></Field>
              <Field id="ev-month" label="Month"><select id="ev-month" className={field} value={month} onChange={(e) => setMonth(+e.target.value)}>{MONTH_NAMES.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}</select></Field>
              <Field id="ev-year" label="Year"><select id="ev-year" className={field} value={year} onChange={(e) => setYear(+e.target.value)}>{YEARS.map((y) => <option key={y}>{y}</option>)}</select></Field>
            </>)}
            <button type="submit" disabled={busy || !guidedReady} className="min-h-11 rounded-xl bg-accent px-5 text-[15px] font-semibold text-white disabled:opacity-50">
              {mode === "year" ? "Generate report" : mode === "compare" ? "Compare" : mode === "screen" ? "Show ranking" : "Explain"}
            </button>
          </div>
          {mode === "event" && (
            <label className="flex min-h-11 items-center gap-2 text-sm text-foreground/70">
              <input type="checkbox" checked={news} onChange={(e) => setNews(e.target.checked)} className="h-[18px] w-[18px]" />
              Include news coverage (shown separately from index values; switched off in this version)
            </label>
          )}
          {!hasAccess && <p className="text-sm text-foreground/60">Answers need an API key (above). You can fill in the form now and run it once a key is connected.</p>}
        </form>
      </section>

      {/* Try asking */}
      <section aria-labelledby="try-h" className="no-print flex flex-col gap-3">
        <h2 id="try-h" className="text-lg font-bold">Try asking</h2>
        <div className="flex flex-wrap gap-2.5">
          {EXAMPLES.map((q) => (
            <button key={q} type="button" onClick={() => { setQuestion(q); document.getElementById("ask")?.focus(); }}
              className="min-h-11 rounded-full border border-foreground/20 bg-surface px-4 text-sm hover:border-accent">{q}</button>
          ))}
        </div>
      </section>

      {/* How answers work */}
      <section aria-labelledby="how-h" className="no-print rounded-2xl border border-foreground/10 bg-surface p-6">
        <h2 id="how-h" className="mb-4 text-lg font-bold">How answers work</h2>
        <div className="grid gap-6 sm:grid-cols-3">
          {[
            ["Numbers come only from the index", "Every figure is read from the published values by our own code, never estimated by the AI. Each number in the text is checked against those results."],
            ["You can see how it was worked out", "Each answer lists the places, hazards, periods and baseline it used, step by step."],
            ["Clear about limits", "Baseline 1991–2020 · monthly area averages · standardized anomalies. Context, not attribution."],
          ].map(([t, d]) => (
            <div key={t} className="flex flex-col gap-1"><span className="text-[15px] font-semibold">{t}</span><span className="text-sm text-foreground/70">{d}</span></div>
          ))}
        </div>
      </section>
    </div>
  );
}
