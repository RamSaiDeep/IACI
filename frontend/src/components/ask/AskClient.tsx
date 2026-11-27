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
  { mode: "snapshot", title: "Snapshot", blurb: "How one place did in a year, season or month, ranked against every year since 1991.", example: "“How was 2024 for Mumbai?”", icon: "M3 4h18v18H3zM16 2v4M8 2v4M3 10h18" },
  { mode: "compare", title: "Compare", blurb: "Two places side by side over a period, hazard by hazard.", example: "“Chennai vs Kolkata, 2015–2025”", icon: "M3 4h7v16H3zM14 4h7v16h-7z" },
  { mode: "rank", title: "Ranking", blurb: "A ranked list of districts for any hazard and period.", example: "“Worst drought districts in Rajasthan”", icon: "M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" },
  { mode: "trend", title: "Trend", blurb: "Is a hazard rising or falling at a place, and how sure is that?", example: "“Is heat increasing in Delhi?”", icon: "M3 17l6-6 4 4 8-8M14 7h7v7" },
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
/** One turn in the chat thread. */
type Msg =
  | { role: "user"; text: string }
  | { role: "report"; report: ReportCard }
  | { role: "clarify"; c: ClarifyResponse; req: AskRequest }
  | { role: "error"; text: string };

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
  const [thread, setThread] = useState<Msg[]>([]);
  const started = thread.length > 0; // after the first question, the suggestions and forms make way for the chat
  const [question, setQuestion] = useState("");
  const [shared, setShared] = useState<AskRequest | null>(null);
  const endRef = useRef<HTMLLIElement>(null);

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

  const push = (m: Msg) => setThread((t) => [...t, m]);
  const scrollToEnd = () => setTimeout(() => endRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);

  async function run(req: AskRequest, label: string) {
    if (!hasKey) {
      openPanel("Set an API key to get answers.");
      return;
    }
    push({ role: "user", text: label });
    setBusy(true);
    setSteps([]);
    setSecs(0);
    scrollToEnd();
    const timer = startTimer(setSecs);
    try {
      const out = await ask({ ...req, model: keyState.model, provider: keyState.provider }, keyState.key, (t) => setSteps((s) => [...s, t]));
      push(out.kind === "report" ? { role: "report", report: out.report } : { role: "clarify", c: out, req });
    } catch (e) {
      if (e instanceof ApiError && (e.code === "missing_key" || e.code === "invalid_key")) openPanel(e.message);
      push({ role: "error", text: e instanceof ApiError ? e.message : "Something went wrong. Please try again." });
    } finally {
      clearInterval(timer);
      setBusy(false);
      scrollToEnd();
    }
  }

  // A typed question; the last report in the thread is sent as context so follow-ups work.
  const askFree = (q: string) => {
    // Memory, kept compact: the last 3 answers as question + headline only (no tables or tool results).
    const reports = thread.filter((m): m is Extract<Msg, { role: "report" }> => m.role === "report").map((m) => m.report);
    const last = reports[reports.length - 1];
    const history = reports.slice(-3).map((r) => ({ question: r.request.question ?? r.title, summary: r.headline }));
    const previous = last ? { question: last.request.question, category: last.feature, slots: last.request.slots,
      summary: `${last.title}. ${last.headline}`, history } : undefined;
    void run({ country, question: q, previous }, q);
  };

  const pick = (m: Extract<Msg, { role: "clarify" }>, o: ClarifyResponse["options"][number]) => {
    const { c, req } = m;
    if (o.question) { askFree(o.question); return; }
    if (o.category) { void run({ ...req, category: o.category, slots: null }, o.label); return; }
    void run({ ...req, category: c.category ?? req.category, slots: c.slots ?? req.slots,
      resolved: { ...req.resolved, [(c.query ?? "").toLowerCase()]: o.id ?? "" } }, o.label);
  };

  const submitGuided = () => {
    const slots: Slots =
      mode === "snapshot" ? { place, year, season: season || null, month: null }
      : mode === "compare" ? { places: [place, placeB], from_year: fromYear, to_year: toYear, hazard: null }
      : mode === "rank" ? { region: region || null, country, hazard, rank_by: rankBy, order: "highest", limit: null,
          year: null, season: null, month: null, from_year: null, to_year: null, last_years: null,
          ...RANK_PERIODS.find((p) => p.id === period)!.slots }
      : { place, hazard, season: null, from_year: null, to_year: null };
    const hz = HAZARDS.find(([id]) => id === hazard)![1];
    const label =
      mode === "snapshot" ? `Snapshot: ${place}, ${year}${season ? `, ${SEASONS.find(([v]) => v === season)![1]}` : ""}`
      : mode === "compare" ? `Compare: ${place} vs ${placeB}, ${fromYear}–${toYear}`
      : mode === "rank" ? `Ranking: ${hz} ${region ? `in ${region}` : `across ${info.name}`}, ${RANK_PERIODS.find((p) => p.id === period)!.label}`
      : `Trend: ${hz} in ${place}`;
    void run({ country, category: mode, slots }, label);
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

      {shared && (
        <div className="no-print flex flex-wrap items-center gap-3 rounded-xl border border-accent/40 bg-accent/5 p-4 text-sm" role="status">
          <span>A shared question was loaded: <strong>{shared.question ?? `${shared.category} report`}</strong>.</span>
          <button type="button" className="min-h-11 rounded-xl bg-accent px-4 font-semibold text-white" onClick={() => { setCountry(shared.country); void run(shared, shared.question ?? `${shared.category} report`); setShared(null); }}>Run it</button>
        </div>
      )}

      {/* Heading + country; once a chat starts, a compact bar instead so the chat gets the screen */}
      {started ? (
        <div className="no-print sticky top-(--header-h) z-10 -mx-4 flex flex-wrap items-center gap-2 border-b border-foreground/10 bg-background/95 px-4 py-2 backdrop-blur sm:-mx-6 sm:px-6">
          <span className="mr-auto text-lg font-semibold">Climate <strong className="font-extrabold text-accent">IQ</strong> Agent</span>
          <div role="group" aria-label="Country" className="order-last flex w-full flex-wrap gap-1.5 sm:order-none sm:w-auto">
            {COUNTRY_SLUGS.map((c) => (
              <button key={c} type="button" aria-pressed={country === c} onClick={() => setCountry(c)}
                className={`min-h-11 rounded-full px-3 text-sm ${country === c ? "bg-accent font-semibold text-white" : "bg-surface-muted text-foreground/80"}`}>
                {COUNTRY_INFO[c].name}
              </button>
            ))}
          </div>
          <button type="button" disabled={busy} onClick={() => setThread([])}
            className="min-h-11 rounded-xl border border-foreground/20 px-4 text-sm font-semibold hover:border-accent disabled:opacity-50">New chat</button>
        </div>
      ) : (
      <section className="no-print flex flex-col items-center gap-5 text-center">
        <span className="text-base font-semibold text-foreground/80">Climate <strong className="font-extrabold text-accent">IQ</strong> Agent</span>
        <h1 className="max-w-3xl text-3xl font-bold leading-tight tracking-tight sm:text-5xl">Get to know your climate</h1>
        <p className="max-w-2xl text-base text-foreground/70 sm:text-lg">
          Ask in your own words, or fill in a short form. Every answer comes with a chart and a table, built from the index&apos;s own monthly values.
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
      )}

      {/* Chat: framed before the first question, full width (no frame) once it starts */}
      <section aria-labelledby="chat-h" className={`flex flex-col gap-4 ${started ? "-mt-6 min-h-[calc(100dvh-var(--header-h)-4rem)]" : "rounded-2xl border border-foreground/10 bg-surface p-4 shadow-card sm:p-6"}`}>
        <h2 id="chat-h" className="sr-only">Chat with the index</h2>
        {/* Suggestions only before the first question; after that the follow-up buttons take over. */}
        {started || <div className="no-print flex flex-col gap-3 rounded-xl bg-surface-muted p-4 text-sm">
          <p className="font-semibold">Here are some things to try:</p>
          <ul className="grid gap-2 sm:grid-cols-2">
            {CARDS.map((c) => {
              const q = c.example.replace(/[“”]/g, "");
              return (
                <li key={c.mode}>
                  <button type="button" disabled={busy} onClick={() => askFree(q)}
                    className="flex min-h-11 w-full flex-col items-start rounded-xl bg-surface px-3 py-2 text-left ring-1 ring-foreground/15 hover:ring-accent disabled:opacity-50">
                    <span className="text-xs font-semibold uppercase tracking-wide text-accent">{c.title}</span>
                    <span>{q}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>}

        <ol aria-live="polite" className="flex flex-col gap-4">
          {thread.map((m, i) => (
            <li key={i} ref={i === thread.length - 1 ? endRef : undefined} className="scroll-mt-24">
              {m.role === "user" && (
                <p className="no-print ml-auto w-fit max-w-[85%] rounded-2xl rounded-br-sm bg-accent px-4 py-2.5 text-[15px] text-white">{m.text}</p>
              )}
              {m.role === "error" && <p role="alert" className="no-print rounded-xl border border-rose-600/30 bg-rose-600/10 p-4 text-sm text-rose-800">{m.text}</p>}
              {m.role === "clarify" && (
                <div className="no-print max-w-[85%] rounded-2xl rounded-bl-sm border border-accent/40 bg-surface p-4">
                  <p className="font-semibold">{m.c.question}</p>
                  {m.c.options.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {m.c.options.map((o) => (
                        <button key={o.id ?? o.category ?? o.label} type="button" disabled={busy} onClick={() => pick(m, o)}
                          className="min-h-11 rounded-full border border-foreground/20 px-4 text-sm hover:border-accent disabled:opacity-50">{o.label}</button>
                      ))}
                    </div>
                  )}
                </div>
              )}
              {m.role === "report" && (
                <div className="flex flex-col gap-3">
                  <ReportView report={m.report} />
                  {m.report.followups.length > 0 && (
                    <div className="no-print flex flex-wrap gap-2">
                      {m.report.followups.map((f) => (
                        <button key={f} type="button" disabled={busy} onClick={() => askFree(f)}
                          className="min-h-11 rounded-full border border-foreground/20 bg-surface px-4 text-left text-sm hover:border-accent disabled:opacity-50">{f}</button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </li>
          ))}
        </ol>

        {busy && (
          <div className="no-print max-w-[85%] rounded-2xl rounded-bl-sm bg-surface-muted p-4 text-sm" role="status" aria-live="polite">
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

        <form className={`no-print flex gap-2 border-t border-foreground/10 pt-4 ${started ? "sticky bottom-0 mt-auto z-10 -mx-4 bg-background/95 px-4 pb-4 backdrop-blur sm:-mx-6 sm:px-6" : ""}`}
          onSubmit={(e) => { e.preventDefault(); const q = question.trim(); if (q) { askFree(q); setQuestion(""); } }}>
          <label htmlFor="ask" className="sr-only">Your question</label>
          <input id="ask" type="text" value={question} onChange={(e) => setQuestion(e.target.value)} maxLength={500}
            placeholder={thread.length ? "Ask a follow-up, e.g. now just the monsoon months" : `e.g. How was 2024 for ${info.example}?`}
            className="min-h-12 min-w-0 flex-1 rounded-xl border border-foreground/20 bg-surface px-4 text-[15px]" />
          <button type="submit" disabled={busy || !question.trim()} className="min-h-12 rounded-xl bg-accent px-6 font-semibold text-white disabled:opacity-50">
            {busy ? "Working…" : "Ask"}
          </button>
        </form>
        {!hasKey && <p className="no-print text-sm text-foreground/60">Answers need an API key. Use &ldquo;Set API key&rdquo; at the top of the page.</p>}
      </section>

      {/* Starting points: only before the first question */}
      {!started && <section aria-labelledby="start-h" className="no-print flex flex-col gap-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="start-h" className="text-xl font-bold">Or fill in a short form</h2>
          <span className="text-sm text-foreground/60">Choose one; the answer appears in the chat above</span>
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
      </section>}

      {/* How answers work */}
      <section aria-labelledby="how-h" className="no-print rounded-2xl border border-foreground/10 bg-surface p-6">
        <h2 id="how-h" className="mb-4 text-lg font-bold">How answers work</h2>
        <div className="grid gap-6 sm:grid-cols-3">
          {[
            ["Numbers come only from the index", "Our code reads and calculates every figure, and your chosen model only writes the sentences. Each number in the text is checked."],
            ["Every place against its own normal", "Scores show how unusual conditions were for that place, compared with its own 1991–2020 record, not raw temperatures or rainfall."],
            ["Clear about limits", "Baseline 1991–2020 · monthly area averages · standardized anomalies. Context, not attribution."],
          ].map(([t, d]) => (
            <div key={t} className="flex flex-col gap-1"><span className="text-[15px] font-semibold">{t}</span><span className="text-sm text-foreground/70">{d}</span></div>
          ))}
        </div>
      </section>
    </div>
  );
}
