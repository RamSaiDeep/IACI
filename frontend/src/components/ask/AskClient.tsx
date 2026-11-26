"use client";

import { useEffect, useRef, useState } from "react";
import { ApiError, DEFAULT_MODELS, PROVIDER_LABELS, ask, loadChoice, loadKey, readSharedRequest } from "../../lib/ask/client";
import { COUNTRY_INFO, COUNTRY_SLUGS, type CountrySlug } from "../../lib/ask/labels";
import type { AskRequest, Category, ClarifyResponse, ReportCard, Slots } from "../../lib/ask/report-types";
import KeyPanel, { type KeyState } from "./KeyPanel";
import ReportView from "./ReportView";

// Event is hidden from the page for now (the backend still supports it).
type Mode = Exclude<Category, "help" | "event">;

const CARDS: { mode: Mode; title: string; blurb: string; example: string; icon: string }[] = [
  { mode: "snapshot", title: "Snapshot", blurb: "How one place did in a year, season or month, ranked against every year since 1991.", example: "“How was 2024 for Nellore?”", icon: "M3 4h18v18H3zM16 2v4M8 2v4M3 10h18" },
  { mode: "compare", title: "Compare", blurb: "Two places side by side over a period, hazard by hazard.", example: "“Chennai vs Hyderabad, 2015–2025”", icon: "M3 4h7v16H3zM14 4h7v16h-7z" },
  { mode: "rank", title: "Ranking", blurb: "A ranked list of districts for any hazard and period.", example: "“Worst drought districts in Maharashtra”", icon: "M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" },
  { mode: "trend", title: "Trend", blurb: "Is a hazard rising or falling at a place, and how sure is that?", example: "“Is heat increasing in Guntur?”", icon: "M3 17l6-6 4 4 8-8M14 7h7v7" },
];

const HAZARDS: [string, string][] = [
  ["composite", "Overall index"], ["heat", "Extreme heat"], ["cold", "Extreme cold"],
  ["rainfall", "Heavy rainfall"], ["drought", "Drought"], ["wind", "Strong wind"], ["sea level", "Sea level"],
];
const SEASONS: [string, string][] = [["", "Whole year"], ["monsoon", "Monsoon (Jun–Sep)"], ["summer", "Summer (Mar–May)"], ["post_monsoon", "Post-monsoon (Oct–Nov)"], ["winter", "Winter (Dec–Feb)"]];
const RANK_PERIODS: { id: string; label: string; slots: Slots }[] = [
  { id: "monsoon2024", label: "Monsoon 2024", slots: { year: 2024, season: "monsoon" } },
  { id: "summer2024", label: "Summer 2024", slots: { year: 2024, season: "summer" } },
  { id: "year2024", label: "Year 2024", slots: { year: 2024 } },
  { id: "last10", label: "Last 10 years", slots: { last_years: 10 } },
  { id: "all", label: "Whole record (1991 onwards)", slots: { from_year: 1991 } },
];
const YEARS = Array.from({ length: 2026 - 1991 + 1 }, (_, i) => 2026 - i);
const field = "min-h-11 rounded-xl border border-foreground/20 bg-surface px-3 text-[15px]";

/** Elapsed-seconds ticker for the progress box. */
function startTimer(set: (s: number) => void) {
  const t0 = Date.now();
  return setInterval(() => set(Math.floor((Date.now() - t0) / 1000)), 1000);
}

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
  const [mode, setMode] = useState<Mode>("snapshot");
  const [keyState, setKeyState] = useState<KeyState>({ key: "", store: null, provider: "anthropic", model: DEFAULT_MODELS.anthropic });
  const [panelOpen, setPanelOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [steps, setSteps] = useState<string[]>([]);
  const [secs, setSecs] = useState(0);
  const [report, setReport] = useState<ReportCard | null>(null);
  const [clarify, setClarify] = useState<{ c: ClarifyResponse; req: AskRequest } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [shared, setShared] = useState<AskRequest | null>(null);
  const resultRef = useRef<HTMLDivElement>(null);

  // guided form state
  const [place, setPlace] = useState("");
  const [placeB, setPlaceB] = useState("");
  const [year, setYear] = useState(2024);
  const [season, setSeason] = useState("");
  const [fromYear, setFromYear] = useState(2015);
  const [toYear, setToYear] = useState(2025);
  const [region, setRegion] = useState("");
  const [hazard, setHazard] = useState("composite");
  const [period, setPeriod] = useState("monsoon2024");
  const [rankBy, setRankBy] = useState<"value" | "worsening">("value");

  // Restore the key, model choice and any shared request once, after mount (storage is client-only).
  useEffect(() => {
    const k = loadKey();
    const m = loadChoice();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setKeyState((s) => ({ ...s, key: k.key, store: k.store, ...(m ?? {}) }));
    setShared(readSharedRequest());
  }, []);

  const hasKey = !!keyState.key;
  const info = COUNTRY_INFO[country];
  const hazards = HAZARDS.filter(([id]) => !(country === "nepal" && id === "sea level"));

  const openPanel = (msg?: string) => {
    setNotice(msg ?? null);
    setPanelOpen(true);
    setTimeout(() => document.getElementById("key-panel")?.scrollIntoView({ behavior: "smooth", block: "start" }), 30);
  };

  async function run(req: AskRequest) {
    setError(null);
    setClarify(null);
    if (!hasKey) {
      openPanel("Set an API key to get answers.");
      return;
    }
    setBusy(true);
    setSteps([]);
    setSecs(0);
    const timer = startTimer(setSecs);
    try {
      const out = await ask({ ...req, model: keyState.model, provider: keyState.provider }, keyState.key, (t) => setSteps((s) => [...s, t]));
      if (out.kind === "report") setReport(out.report);
      else { setReport(null); setClarify({ c: out, req }); }
      setTimeout(() => resultRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
    } catch (e) {
      if (e instanceof ApiError && (e.code === "missing_key" || e.code === "invalid_key")) openPanel(e.message);
      else setError(e instanceof ApiError ? e.message : "Something went wrong. Please try again.");
    } finally {
      clearInterval(timer);
      setBusy(false);
    }
  }

  const pick = (o: ClarifyResponse["options"][number]) => {
    if (!clarify) return;
    const { c, req } = clarify;
    if (o.category) { void run({ ...req, category: o.category, slots: null }); return; }
    void run({ ...req, category: c.category ?? req.category, slots: c.slots ?? req.slots,
      resolved: { ...req.resolved, [(c.query ?? "").toLowerCase()]: o.id ?? "" } });
  };

  const submitGuided = () => {
    const slots: Slots =
      mode === "snapshot" ? { place, year, season: season || null, month: null }
      : mode === "compare" ? { places: [place, placeB], from_year: fromYear, to_year: toYear, hazard: null }
      : mode === "rank" ? { region: region || null, country, hazard, rank_by: rankBy, order: "highest", limit: null,
          year: null, season: null, month: null, from_year: null, to_year: null, last_years: null,
          ...RANK_PERIODS.find((p) => p.id === period)!.slots }
      : { place, hazard, season: null, from_year: null, to_year: null };
    void run({ country, category: mode, slots });
  };

  const guidedReady = mode === "compare" ? !!place.trim() && !!placeB.trim() : mode === "rank" ? true : !!place.trim();

  return (
    <div className="flex flex-col gap-10">
      <style>{`@media print{header,footer,.no-print{display:none!important}main{padding:0!important}}`}</style>

      {/* API key bar: directly under the site header */}
      <div className="no-print -mt-4 flex flex-col gap-3 sm:-mt-8">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-foreground/10 bg-surface px-4 py-2.5 text-sm">
          <span className="flex items-center gap-2" role="status">
            <span aria-hidden className={`h-2.5 w-2.5 rounded-full ${hasKey ? "bg-teal-600" : "bg-foreground/30"}`} />
            {hasKey
              ? <>API key set · <span className="font-mono text-xs">{PROVIDER_LABELS[keyState.provider]} · {keyState.model}</span></>
              : "No API key set. Answers need your own key."}
          </span>
          <button type="button" onClick={() => (panelOpen ? setPanelOpen(false) : openPanel())} aria-expanded={panelOpen} aria-controls="key-panel"
            className={`min-h-11 rounded-xl px-4 font-semibold ${hasKey ? "border border-foreground/20 hover:border-accent" : "bg-accent text-white"}`}>
            {hasKey ? "Change API key" : "Set API key"}
          </button>
        </div>
        {panelOpen && <KeyPanel state={keyState} onChange={setKeyState} onClose={() => setPanelOpen(false)} notice={notice} />}
      </div>

      {shared && !report && (
        <div className="no-print flex flex-wrap items-center gap-3 rounded-xl border border-accent/40 bg-accent/5 p-4 text-sm" role="status">
          <span>A shared question was loaded: <strong>{shared.question ?? `${shared.category} report`}</strong>.</span>
          <button type="button" className="min-h-11 rounded-xl bg-accent px-4 font-semibold text-white" onClick={() => { setCountry(shared.country); void run(shared); setShared(null); }}>Run it</button>
        </div>
      )}

      {/* Heading + country */}
      <section className="no-print flex flex-col items-center gap-5 text-center">
        <span className="eyebrow">Ask the Index</span>
        <h1 className="max-w-3xl text-3xl font-bold leading-tight tracking-tight sm:text-5xl">Get to know your climate</h1>
        <p className="max-w-2xl text-base text-foreground/70 sm:text-lg">
          Pick what you want to find out, fill in a place and a period, and get a written answer with a chart and a table, built from the index&apos;s own monthly values.
        </p>
        <div role="group" aria-label="Country" className="flex flex-wrap items-center justify-center gap-2">
          <span className="mr-1 text-sm text-foreground/60">Country</span>
          {COUNTRY_SLUGS.map((c) => (
            <button key={c} type="button" aria-pressed={country === c} onClick={() => setCountry(c)}
              className={`min-h-11 rounded-full px-4 text-sm ${country === c ? "bg-accent font-semibold text-white" : "bg-surface-muted text-foreground/80"}`}>
              {COUNTRY_INFO[c].name}
            </button>
          ))}
        </div>
      </section>

      {/* Starting points */}
      <section aria-labelledby="start-h" className="no-print flex flex-col gap-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="start-h" className="text-xl font-bold">What would you like to know?</h2>
          <span className="text-sm text-foreground/60">Choose one, then fill in the short form below it</span>
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
            {mode === "snapshot" && (<>
              <Field id="sn-place" label={`${info.childLabel} or ${info.topLabel.toLowerCase()}`}><input id="sn-place" className={field} value={place} onChange={(e) => setPlace(e.target.value)} placeholder={`e.g. ${info.example}`} /></Field>
              <Field id="sn-year" label="Year"><select id="sn-year" className={field} value={year} onChange={(e) => setYear(+e.target.value)}>{YEARS.map((y) => <option key={y}>{y}</option>)}</select></Field>
              <Field id="sn-season" label="Period"><select id="sn-season" className={field} value={season} onChange={(e) => setSeason(e.target.value)}>{SEASONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Field>
            </>)}
            {mode === "compare" && (<>
              <Field id="cmp-a" label="First place"><input id="cmp-a" className={field} value={place} onChange={(e) => setPlace(e.target.value)} placeholder="e.g. Chennai" /></Field>
              <Field id="cmp-b" label="Second place"><input id="cmp-b" className={field} value={placeB} onChange={(e) => setPlaceB(e.target.value)} placeholder="e.g. Hyderabad" /></Field>
              <Field id="cmp-from" label="From"><select id="cmp-from" className={field} value={fromYear} onChange={(e) => setFromYear(+e.target.value)}>{YEARS.map((y) => <option key={y}>{y}</option>)}</select></Field>
              <Field id="cmp-to" label="To"><select id="cmp-to" className={field} value={toYear} onChange={(e) => setToYear(+e.target.value)}>{YEARS.map((y) => <option key={y}>{y}</option>)}</select></Field>
            </>)}
            {mode === "rank" && (<>
              <Field id="rk-region" label="Within"><input id="rk-region" className={field} value={region} onChange={(e) => setRegion(e.target.value)} placeholder={`All ${info.name}, or a ${info.topLabel.toLowerCase()}`} /></Field>
              <Field id="rk-hazard" label="Hazard"><select id="rk-hazard" className={field} value={hazard} onChange={(e) => setHazard(e.target.value)}>{hazards.map(([id, l]) => <option key={id} value={id}>{l}</option>)}</select></Field>
              <Field id="rk-period" label="Period"><select id="rk-period" className={field} value={period} onChange={(e) => setPeriod(e.target.value)}>{RANK_PERIODS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}</select></Field>
              <Field id="rk-by" label="Rank by"><select id="rk-by" className={field} value={rankBy} onChange={(e) => setRankBy(e.target.value as typeof rankBy)}><option value="value">Most extreme</option><option value="worsening">Fastest worsening</option></select></Field>
            </>)}
            {mode === "trend" && (<>
              <Field id="tr-place" label="Place"><input id="tr-place" className={field} value={place} onChange={(e) => setPlace(e.target.value)} placeholder={`e.g. ${info.example}`} /></Field>
              <Field id="tr-hazard" label="Hazard"><select id="tr-hazard" className={field} value={hazard} onChange={(e) => setHazard(e.target.value)}>{hazards.map(([id, l]) => <option key={id} value={id}>{l}</option>)}</select></Field>
            </>)}
            <button type="submit" disabled={busy || !guidedReady} className="min-h-11 rounded-xl bg-accent px-5 text-[15px] font-semibold text-white disabled:opacity-50">
              {mode === "compare" ? "Compare" : mode === "rank" ? "Show ranking" : mode === "trend" ? "Show trend" : "Generate report"}
            </button>
          </div>
          {!hasKey && <p className="text-sm text-foreground/60">Answers need an API key. Use &ldquo;Set API key&rdquo; at the top of the page.</p>}
        </form>
      </section>

      {/* Result area */}
      <div ref={resultRef} aria-live="polite" className="flex flex-col gap-4 scroll-mt-24">
        {busy && (
          <div className="w-full max-w-3xl rounded-xl bg-surface p-4 text-left text-sm shadow-card" role="status" aria-live="polite">
            <p className="font-semibold">Working on it… {secs}s</p>
            <ol className="mt-2 flex flex-col gap-1">
              {steps.map((t, i) => (
                <li key={i} className={i === steps.length - 1 ? "text-foreground" : "text-foreground/60"}>
                  <span aria-hidden>{i === steps.length - 1 ? "⏳" : "✓"}</span> {t}
                </li>
              ))}
            </ol>
          </div>
        )}
        {error && <p role="alert" className="rounded-xl border border-rose-600/30 bg-rose-600/10 p-4 text-sm text-rose-800">{error}</p>}
        {clarify && (
          <div className="rounded-xl border border-accent/40 bg-surface p-5 shadow-card">
            <p className="font-semibold">{clarify.c.question}</p>
            {clarify.c.options.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {clarify.c.options.map((o) => (
                  <button key={o.id ?? o.category ?? o.label} type="button" disabled={busy} onClick={() => pick(o)}
                    className="min-h-11 rounded-full border border-foreground/20 px-4 text-sm hover:border-accent">{o.label}</button>
                ))}
              </div>
            )}
            {clarify.c.options.length === 0 && <p className="mt-1 text-sm text-foreground/60">Change the form above and try again.</p>}
          </div>
        )}
        {report && <ReportView report={report} />}
      </div>

      {/* How answers work */}
      <section aria-labelledby="how-h" className="no-print rounded-2xl border border-foreground/10 bg-surface p-6">
        <h2 id="how-h" className="mb-4 text-lg font-bold">How answers work</h2>
        <div className="grid gap-6 sm:grid-cols-3">
          {[
            ["Numbers come only from the index", "Our code reads and calculates every figure, and your chosen model only writes the sentences. Each number in the text is checked."],
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
