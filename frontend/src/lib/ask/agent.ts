/**
 * The agent loop. The model plans (which feature, which places), our code
 * computes (tools + fixed report templates), the model writes prose into named
 * slots, and the grounding check verifies every number in that prose.
 */

import { getPlace, findPlaces, loadCountry } from "./data";
import { allowedNumbers, stripAttribution, stripUngrounded, ungroundedNumbers } from "./grounding";
import { COUNTRY_INFO, COUNTRY_SLUGS, MONTH_NAMES, type CountrySlug } from "./labels";
import {
  AskError, estimateCostUsd, type ContentBlock, type LLMMessage, type LLMProvider, type LLMTool,
} from "./providers/types";
import type { AskRequest, AskResponse, Feature, GuidedParams, ReportCard, TraceEntry } from "./report-types";
import {
  NARRATIVE_SLOTS, assemble, call, methodFor, planCompare, planEvent, planScreen, planYear,
  type Ctx, type Narrative, type Planned, type ScreenArgs,
} from "./reports";
import { TOOLS, runTool } from "./tools";

const MAX_TURNS = 8;

// ---------------------------------------------------------------------------
// Place resolution -> clarification
// ---------------------------------------------------------------------------

class Clarify extends Error {
  constructor(public question: string, public options: { label: string; name?: string; id?: string }[], public query?: string) {
    super(question);
  }
}

function resolveName(ctx: Ctx, name: string, hint: CountrySlug, resolved?: Record<string, string>): string {
  const pre = resolved?.[name.trim().toLowerCase()];
  if (pre && getPlace(pre)) return pre;
  if (getPlace(name)) return name; // already an id
  // Try the selected country first, then everywhere.
  let r = call(ctx, "resolve_place", { name, country: hint });
  if (r.status === "not_found") r = call(ctx, "resolve_place", { name });
  if (r.status === "exact") return r.matches[0].id;
  if (r.status === "ambiguous") {
    throw new Clarify(
      `"${name}" matches more than one place. Which did you mean?`,
      r.matches.map((m: any) => ({ label: `${m.name} (${m.level}${m.parent ? `, ${m.parent}` : ""}, ${m.country})`, id: m.id })), // eslint-disable-line @typescript-eslint/no-explicit-any
      name,
    );
  }
  if (r.status === "suggestions") {
    throw new Clarify(
      `I couldn't find "${name}". Did you mean one of these?`,
      r.matches.map((m: any) => ({ label: `${m.name} (${m.level}${m.parent ? `, ${m.parent}` : ""}, ${m.country})`, id: m.id })), // eslint-disable-line @typescript-eslint/no-explicit-any
      name,
    );
  }
  throw new Clarify(`I couldn't find a place called "${name}" in ${COUNTRY_INFO[hint].name}, the UK or Nepal. Check the spelling or try a district or state name.`, [], name);
}

// ---------------------------------------------------------------------------
// Turning loose params into a Planned report
// ---------------------------------------------------------------------------

export interface BuildArgs {
  feature: Feature;
  places?: string[];
  place?: string;
  year?: number;
  month?: number;
  from_year?: number;
  to_year?: number;
  country?: string;
  region?: string;
  component?: string;
  period?: Record<string, unknown>;
  rank_by?: string;
  limit?: number;
  news?: boolean;
}

function buildReport(ctx: Ctx, a: BuildArgs, req: AskRequest): { planned: Planned; placeId?: string } {
  const hint = (COUNTRY_SLUGS as string[]).includes(a.country ?? "") ? (a.country as CountrySlug) : req.country;
  const names = a.places?.length ? a.places : a.place ? [a.place] : [];
  switch (a.feature) {
    case "year": {
      if (!names[0] || !a.year) throw new AskError("bad_request", "A place and a year are needed for a year in review.");
      const id = resolveName(ctx, names[0], hint, req.resolved);
      return { planned: planYear(ctx, id, Number(a.year)), placeId: id };
    }
    case "event": {
      if (!names[0] || !a.year || !a.month) throw new AskError("bad_request", "A place, month and year are needed to explain an event.");
      const id = resolveName(ctx, names[0], hint, req.resolved);
      return { planned: planEvent(ctx, id, Number(a.year), Number(a.month)), placeId: id };
    }
    case "compare": {
      if (names.length < 2) throw new AskError("bad_request", "Two places are needed for a comparison.");
      const ids = names.slice(0, 4).map((n) => resolveName(ctx, n, hint, req.resolved));
      if (new Set(ids).size < 2) throw new AskError("bad_request", "The two places are the same. Pick two different places.");
      return { planned: planCompare(ctx, ids, a.from_year, a.to_year) };
    }
    case "screen": {
      const args: ScreenArgs = {
        country: hint, region: a.region, component: a.component ?? "composite",
        period: a.period, rank_by: a.rank_by, limit: a.limit,
      };
      return { planned: planScreen(ctx, args) };
    }
  }
}

/** Convert the guided-form fields into BuildArgs. */
export function guidedToBuildArgs(req: AskRequest): BuildArgs {
  const p: GuidedParams = req.params ?? {};
  const feature = req.mode as Feature;
  const period: Record<string, unknown> = {};
  if (p.season) period.season = p.season;
  if (p.periodYear) period.year = p.periodYear;
  if (p.lastYears) period.last_years = p.lastYears;
  if (p.fromYear) period.from_year = p.fromYear;
  if (p.toYear) period.to_year = p.toYear;
  return {
    feature,
    country: req.country,
    place: p.place,
    places: feature === "compare" ? [p.place ?? "", p.placeB ?? ""].filter(Boolean) : undefined,
    year: p.year, month: p.month, from_year: p.fromYear, to_year: p.toYear,
    region: p.region, component: p.component, period, rank_by: p.rankBy, news: p.news,
  };
}

// ---------------------------------------------------------------------------
// Prompts and control tools
// ---------------------------------------------------------------------------

const SYSTEM = `You are "Ask the Index", the assistant for the Actuaries Climate Index (ACI) of the Sri Sathya Sai Institute of Actuaries. The index gives monthly standardized anomalies (z-scores) of climate extremes on a 1991–2020 baseline for India, the UK and Nepal.

Rules:
- NEVER produce, estimate, round differently or compute any number yourself. Every number you write must appear exactly in a tool result. Do not do arithmetic, percentages or unit conversions.
- Use plain-language hazard names (Extreme heat, Extreme cold, Heavy rainfall, Strong wind, Drought, Sea level), never bare codes like T90S.
- Rank 1 means highest. Say "anomaly" for values. Mention that single months are noisy when relevant.
- Never claim an event was caused by climate change. The index gives context, not attribution.
- If a place or period is unclear or ambiguous, ask a short clarifying question with ask_clarification instead of guessing.
- Be brief: 1-2 sentences per slot. No headings, no markdown.`;

const FEATURE_GUIDE = `Pick the report type: "year" (one place, one year), "compare" (two places over a period), "screen" (ranking places by a hazard for a region and period, e.g. worst or fastest-worsening), "event" (one place, one month and year). Call build_report with place NAMES as the user wrote them (the server resolves them), then write the prose with finish.`;

function narrativeSchema(feature: Feature) {
  const slots = NARRATIVE_SLOTS[feature];
  return {
    type: "object",
    properties: {
      headline: { type: "string", description: feature === "screen" ? "Direct answer, 1-2 sentences" : feature === "compare" ? "Headline verdict, 1-2 sentences" : feature === "event" ? "Event summary, 1-2 sentences" : "Headline: what defined the year, 1-2 sentences" },
      sections: {
        type: "object",
        properties: Object.fromEntries(slots.map((s) => [s.key, { type: "string", description: s.hint }])),
      },
      followups: { type: "array", items: { type: "string" }, description: "2-3 short follow-up questions the user could ask next" },
    },
    required: ["headline", "followups"],
  };
}

const CONTROL_TOOLS: LLMTool[] = [
  {
    name: "build_report",
    description: "Run the fixed report template for a feature. The server resolves place names and computes all tables. Returns the results you must narrate.",
    input_schema: {
      type: "object",
      properties: {
        feature: { type: "string", enum: ["year", "compare", "screen", "event"] },
        places: { type: "array", items: { type: "string" }, description: "Place names as written by the user (1 for year/event, 2-4 for compare)" },
        year: { type: "integer" }, month: { type: "integer", description: "1-12, event only" },
        from_year: { type: "integer" }, to_year: { type: "integer" },
        country: { type: "string", enum: COUNTRY_SLUGS },
        region: { type: "string", description: "screen: state/nation/province, or omit for the whole country" },
        component: { type: "string", description: "screen: composite, heat, cold, rainfall, wind, drought or sea level" },
        period: { type: "object", description: "screen: {year?, season?: monsoon|summer|post_monsoon|winter, from_year?, to_year?, last_years?}" },
        rank_by: { type: "string", enum: ["most_extreme", "fastest_worsening"] },
        limit: { type: "integer" },
      },
      required: ["feature"],
    },
  },
  {
    name: "ask_clarification",
    description: "Ask the user one short question when the place, period or intent is unclear. Ends the turn.",
    input_schema: { type: "object", properties: { question: { type: "string" } }, required: ["question"] },
  },
];

function finishTool(feature: Feature): LLMTool {
  return {
    name: "finish",
    description: "Submit the prose for the report. Numbers must come from the tool results.",
    input_schema: narrativeSchema(feature),
  };
}

// ---------------------------------------------------------------------------
// Main entry
// ---------------------------------------------------------------------------

interface Usage { calls: number; inputTokens: number; outputTokens: number }

function addUsage(u: Usage, r: { usage: { inputTokens: number; outputTokens: number } }) {
  u.calls++; u.inputTokens += r.usage.inputTokens; u.outputTokens += r.usage.outputTokens;
}

function usageCard(provider: LLMProvider, u: Usage): ReportCard["usage"] {
  return { provider: provider.id, model: provider.model, ...u, costUsd: provider.id === "mock" ? 0 : estimateCostUsd(provider.model, u.inputTokens, u.outputTokens) };
}

function parseNarrative(block: ContentBlock | undefined, textFallback: string): Narrative {
  const input = (block && block.type === "tool_use" ? (block as { input: Record<string, unknown> }).input : {}) as Record<string, unknown>;
  const headline = typeof input.headline === "string" ? input.headline : textFallback;
  const sections: Record<string, string> = {};
  if (input.sections && typeof input.sections === "object")
    for (const [k, v] of Object.entries(input.sections as Record<string, unknown>)) if (typeof v === "string") sections[k] = v;
  const followups = Array.isArray(input.followups) ? input.followups.filter((x): x is string => typeof x === "string").slice(0, 4) : [];
  return { headline: headline.trim(), sections, followups };
}

export async function runAsk(req: AskRequest, provider: LLMProvider, onProgress?: (text: string) => void): Promise<AskResponse> {
  const emit = (t: string) => onProgress?.(t);
  const ctx: Ctx = { trace: [], results: [], emit };
  const usage: Usage = { calls: 0, inputTokens: 0, outputTokens: 0 };
  const fail = (): TraceEntry[] => ctx.trace;

  try {
    let planned: Planned | null = null;
    let placeId: string | undefined;
    let news = !!req.params?.news;
    const messages: LLMMessage[] = [];

    if (req.mode !== "free") {
      // Guided: our code plans; the model only writes prose.
      emit(`Looking up the index values for your ${req.mode} request`);
      const built = buildReport(ctx, guidedToBuildArgs(req), req);
      planned = built.planned; placeId = built.placeId;
      messages.push({ role: "user", content: userPrompt(req, planned) });
    } else {
      // Free text: the model plans via tool calls.
      messages.push({ role: "user", content: freePrompt(req) });
      let finalText = "";
      for (let turn = 0; turn < MAX_TURNS && !planned; turn++) {
        emit(turn === 0 ? `Asking ${provider.model} to understand your question` : `${provider.model} is deciding what to look up next`);
        const res = await provider.complete({ system: SYSTEM + "\n\n" + FEATURE_GUIDE, messages, tools: [...dataTools(), ...CONTROL_TOOLS], maxTokens: 1500 });
        addUsage(usage, res);
        messages.push({ role: "assistant", content: res.content });
        const uses = res.content.filter((b): b is Extract<ContentBlock, { type: "tool_use" }> => b.type === "tool_use");
        if (!uses.length) {
          finalText = res.content.filter((b) => b.type === "text").map((b) => (b as { text: string }).text).join(" ").trim();
          throw new Clarify(finalText || "Could you tell me which place and period you mean?", []);
        }
        const results: ContentBlock[] = [];
        for (const u of uses) {
          if (u.name === "ask_clarification") throw new Clarify(String(u.input.question ?? "Could you clarify your question?"), []);
          if (u.name === "build_report") {
            emit(`Building the ${String((u.input as { feature?: string }).feature ?? "")} report from the data`);
            const built = buildReport(ctx, u.input as unknown as BuildArgs, req);
            planned = built.planned; placeId = built.placeId; news = !!(u.input as { news?: boolean }).news;
            results.push({ type: "tool_result", tool_use_id: u.id, content: JSON.stringify(planned.forModel) });
          } else {
            const out = call(ctx, u.name, u.input);
            results.push({ type: "tool_result", tool_use_id: u.id, content: JSON.stringify(out).slice(0, 6000), is_error: !!out.error });
          }
        }
        messages.push({ role: "user", content: results });
      }
      if (!planned) throw new AskError("model_error", "The assistant could not work out which report to build. Try rephrasing, or use one of the starting points.");
    }

    // ---- narrative --------------------------------------------------------
    const allowed = allowedNumbers(ctx.results, planned.forModel, req.params, [new Date().getFullYear()]);
    emit(`${provider.model} is writing the answer from the calculated figures`);
    let narrative = await getNarrative(provider, messages, planned, usage, req.mode === "free");
    let status: ReportCard["grounding"]["status"] = "verified";
    const removed: string[] = [];

    const texts = () => [narrative.headline, ...Object.values(narrative.sections)];
    emit("Checking every number in the text against the data");
    let bad = texts().flatMap((t) => ungroundedNumbers(t, allowed));
    if (bad.length) {
      // One regeneration with feedback, then strip what is still ungrounded.
      emit(`Some numbers in the text did not match the data (${[...new Set(bad)].join(", ")}); asking for a rewrite`);
      narrative = await getNarrative(provider, messages, planned, usage, req.mode === "free",
        `These numbers do not appear in the tool results: ${[...new Set(bad)].join(", ")}. Rewrite the prose using only numbers from the results (or none).`);
      bad = texts().flatMap((t) => ungroundedNumbers(t, allowed));
      status = "repaired";
      if (bad.length) {
        status = "stripped";
        const clean = (t: string) => { const r = stripUngrounded(t, allowed); removed.push(...r.removed); return r.text; };
        narrative.headline = clean(narrative.headline);
        for (const k of Object.keys(narrative.sections)) narrative.sections[k] = clean(narrative.sections[k]);
      }
    }
    // Context, never attribution.
    const noAttr = (t: string) => { const r = stripAttribution(t); removed.push(...r.removed); return r.text; };
    narrative.headline = noAttr(narrative.headline);
    for (const k of Object.keys(narrative.sections)) narrative.sections[k] = noAttr(narrative.sections[k]);
    narrative.followups = narrative.followups.filter((f) => !ungroundedNumbers(f, allowed).length);
    if (!narrative.headline) narrative.headline = "See the figures below.";

    emit("Assembling the report");
    const { sections, notes } = assemble(planned, narrative, { placeId, news });
    const report: ReportCard = {
      feature: planned.feature, title: planned.title, subtitle: planned.subtitle, country: planned.country,
      request: { ...req, model: undefined, provider: undefined },
      headline: narrative.headline, sections, followups: narrative.followups, notes,
      method: methodFor(planned.country), trace: ctx.trace,
      grounding: { status, removed }, usage: usageCard(provider, usage), createdAt: new Date().toISOString(),
    };
    return { kind: "report", report };
  } catch (e) {
    if (e instanceof Clarify) {
      return { kind: "clarify", question: e.question, options: e.options, query: e.query, usage: usageCard(provider, usage), trace: fail() };
    }
    throw e;
  }
}

async function getNarrative(
  provider: LLMProvider, messages: LLMMessage[], planned: Planned, usage: Usage, free: boolean, feedback?: string
): Promise<Narrative> {
  const msgs: LLMMessage[] = [...messages];
  const tail: ContentBlock[] = [{ type: "text", text: feedback ?? `Now call finish with the prose for the "${planned.feature}" report. Slots: ${NARRATIVE_SLOTS[planned.feature].map((s) => s.key).join(", ") || "(headline only)"}.` }];
  const last = msgs[msgs.length - 1];
  if (last.role === "user") {
    msgs[msgs.length - 1] = { role: "user", content: [...(typeof last.content === "string" ? [{ type: "text", text: last.content } as ContentBlock] : last.content), ...tail] };
  } else {
    msgs.push({ role: "user", content: tail });
  }
  const res = await provider.complete({ system: SYSTEM, messages: msgs, tools: free ? [...dataTools(), ...CONTROL_TOOLS, finishTool(planned.feature)] : [finishTool(planned.feature)], maxTokens: 1200 });
  addUsage(usage, res);
  const block = res.content.find((b) => b.type === "tool_use" && (b as { name: string }).name === "finish");
  const text = res.content.filter((b) => b.type === "text").map((b) => (b as { text: string }).text).join(" ");
  return parseNarrative(block, text);
}

function dataTools(): LLMTool[] {
  return TOOLS.map((t) => ({ name: t.name, description: t.description, input_schema: t.input_schema }));
}

function userPrompt(req: AskRequest, p: Planned): string {
  return [
    `Report type: ${p.feature}. Country selected: ${COUNTRY_INFO[req.country].name}.`,
    req.question ? `User question: ${req.question}` : "",
    req.previous ? `This follows an earlier ${req.previous.feature} report: ${req.previous.summary}` : "",
    `Tool results (the only source of numbers):`,
    JSON.stringify(p.forModel),
  ].filter(Boolean).join("\n");
}

function freePrompt(req: AskRequest): string {
  const years = (() => { const d = loadCountry(req.country); return `${Math.floor(d.first / 100)}-${Math.floor(d.last / 100)}`; })();
  return [
    `Selected country: ${COUNTRY_INFO[req.country].name} (data years ${years}). Months are 1-12 (${MONTH_NAMES.map((m, i) => `${i + 1}=${m}`).join(", ")}).`,
    req.previous ? `Previous report (${req.previous.feature}): ${req.previous.summary}. The question below may be a follow-up to it.` : "",
    `Question: ${req.question ?? ""}`,
  ].filter(Boolean).join("\n");
}

export { findPlaces, runTool };
