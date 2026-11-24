/**
 * A scripted stand-in for an LLM so the whole flow (agent loop, tool calls,
 * grounding, report cards) runs without a key. It parses the question with
 * simple rules, emits tool calls like a model would, and writes prose from the
 * tool results using only the numbers they contain. It is NOT a language model:
 * unusual phrasings fall back to a clarifying question.
 */

import { findPlaces } from "../data";
import { COUNTRY_SLUGS, MONTH_NAMES, type CountrySlug } from "../labels";
import type { ContentBlock, LLMProvider, LLMRequest, LLMResponse } from "./types";

type Obj = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const STOP = new Set(["Which", "What", "How", "Where", "Is", "Are", "Top", "Worst", "Compare", "Show", "Did", "Does", "Do", "The", "In", "Tell", "Explain", "Give", "Was", "Were", "Why", "When", "List", "Rank", "Find"]);

function candidatePlaces(q: string, country: CountrySlug): string[] {
  const tokens = q.replace(/[?,.]/g, " ").split(/\s+/).filter(Boolean);
  const groups: string[][] = [];
  let cur: string[] = [];
  for (const t of tokens) {
    const isCap = /^[A-Z]/.test(t) && !STOP.has(t) && !MONTH_NAMES.includes(t);
    if (isCap) cur.push(t);
    else { if (cur.length) groups.push(cur); cur = []; }
  }
  if (cur.length) groups.push(cur);
  const out: string[] = [];
  for (const g of groups) {
    // longest to shortest sub-phrase that matches a place
    let found = false;
    for (let len = g.length; len >= 1 && !found; len--) {
      for (let s = 0; s + len <= g.length && !found; s++) {
        const phrase = g.slice(s, s + len).join(" ");
        const m = findPlaces(phrase, [country, ...COUNTRY_SLUGS.filter((c) => c !== country)]).filter((x) => x.place.level !== "country");
        if (m.length) { out.push(phrase); found = true; }
      }
    }
  }
  return out;
}

const COMPONENT_WORDS: [RegExp, string][] = [
  [/rain|monsoon rain|flood|precip/i, "rainfall"],
  [/drought|dry/i, "drought"],
  [/heat|hot|warm/i, "heat"],
  [/cold|cool|frost/i, "cold"],
  [/wind|storm|cyclone/i, "wind"],
  [/sea[- ]level|coastal/i, "sea level"],
];

function parseQuestion(q: string, country: CountrySlug): { tool: string; input: Obj } {
  const lower = q.toLowerCase();
  const years = [...q.matchAll(/\b(19[89]\d|20[0-4]\d)\b/g)].map((m) => Number(m[1]));
  const month = MONTH_NAMES.findIndex((m) => lower.includes(m.toLowerCase())) + 1;
  const places = candidatePlaces(q, country);
  const season = /monsoon/.test(lower) ? "monsoon" : /summer/.test(lower) ? "summer" : /winter/.test(lower) ? "winter" : undefined;
  const comp = COMPONENT_WORDS.find(([re]) => re.test(lower))?.[1];
  const wantsRank = /(worst|top\s*\d*|which|where|most|fastest|highest|getting worse|worsening|rank)/.test(lower);

  if (places.length >= 2 && /(vs\.?|versus|compare|than| or |between| and )/.test(lower)) {
    const range = q.match(/(\d{4})\s*[–-]\s*(\d{4})/);
    return { tool: "build_report", input: { feature: "compare", places: places.slice(0, 2), from_year: range ? Number(range[1]) : years[0], to_year: range ? Number(range[2]) : years[1] } };
  }
  if (places.length >= 1 && month && years[0]) {
    return { tool: "build_report", input: { feature: "event", places: [places[0]], year: years[0], month } };
  }
  if (wantsRank && !(places.length >= 1 && years[0] && !comp && !/district/.test(lower) && /how was|how did/.test(lower))) {
    const region = places[0];
    return {
      tool: "build_report",
      input: {
        feature: "screen", country, region, component: comp ?? "composite",
        period: season ? { season, year: years[0] ?? 2024 } : years[0] ? { year: years[0] } : {},
        rank_by: /(fastest|getting worse|worsening)/.test(lower) ? "fastest_worsening" : "most_extreme", limit: 10,
      },
    };
  }
  if (places.length >= 1 && years[0]) return { tool: "build_report", input: { feature: "year", places: [places[0]], year: years[0] } };
  if (places.length >= 1) return { tool: "ask_clarification", input: { question: `Which year (or period) would you like to know about for ${places[0]}?` } };
  return { tool: "ask_clarification", input: { question: "Which place and period do you mean? For example: \"How was 2024 for Guntur?\"" } };
}

// --- prose from tool results -------------------------------------------------

const v = (n: unknown) => String(n);
const sentence = (s: string) => s;

function level(x: number): string {
  return x <= -1 ? "well below normal" : x <= 0 ? "near or slightly below normal" : x <= 1 ? "moderately above normal" : x <= 2 ? "clearly elevated" : "severe";
}

function narrate(feature: string, d: Obj): Obj {
  switch (feature) {
    case "year": {
      const t = d.trend ?? {};
      const top = (d.standout_months ?? []) as Obj[];
      const reg = (d.regional ?? []) as Obj[];
      return {
        headline: `${d.place.name} in ${d.year} was ${level(d.overall.value)} overall (anomaly ${v(d.overall.value)}), ranking ${v(d.overall.rank)} of ${v(d.overall.n_years)} years since 1991.${d.partial_year ? " The year is incomplete in the data." : ""}`,
        sections: {
          month_by_month: top.length ? `The most unusual months were ${top.map((m) => `${m.month_name} (${v(m.composite)}${m.driver ? `, mainly ${m.driver.component.toLowerCase()}` : ""})`).join(", ")}.` : "",
          trend_context: t.direction ? `Over the full record the trend is ${t.direction} (${v(t.slope_per_decade)} per decade, Mann-Kendall p = ${v(t.mann_kendall_p)}), so ${d.overall.rank <= 3 ? "this year stands out within it" : "this year sits within the long-run pattern"}.` : "",
          regional_context: reg.length ? `For comparison: ${reg.slice(0, 4).map((r) => `${r.place} ${v(r.overall.value)} (rank ${v(r.overall.rank)})`).join("; ")}.` : "",
        },
        followups: [`Which month of ${d.year} was most extreme in ${d.place.name}?`, `Compare ${d.place.name} with a neighbouring district`, `Is drought getting worse in ${d.place.name}?`],
      };
    }
    case "compare": {
      const [a, b] = d.places as Obj[];
      const diff = a.values.COMPOSITE - b.values.COMPOSITE;
      const higher = diff >= 0 ? a : b, lower = diff >= 0 ? b : a;
      const c = d.convergence;
      return {
        headline: `Over ${d.period}, ${higher.name} had the higher overall anomaly (${v(higher.values.COMPOSITE)}) versus ${lower.name} (${v(lower.values.COMPOSITE)}).`,
        sections: {
          change_over_time: c ? `Their 5-year rolling means look ${c.pattern}: the gap was ${v(c.start_gap)} in ${v(c.start_year)} and ${v(c.end_gap)} in ${v(c.end_year)}.` : "Single months are noisy, so the 5-year rolling means are the better guide.",
          why_differ: `${a.name} is ${a.coastal ? "coastal" : "inland"} and ${b.name} is ${b.coastal ? "coastal" : "inland"}${Object.keys(d.not_measured ?? {}).length ? "; some hazards are not measured for both places" : ""}.`,
        },
        followups: [`Compare ${a.name} and ${b.name} for the last 10 years`, `Add another place to the comparison`],
      };
    }
    case "screen": {
      const rows = (d.rows ?? []) as Obj[];
      const top = rows.slice(0, 3);
      return {
        headline: rows.length ? `${top.map((r) => `${r.name} (${v(r.value)})`).join(", ")} lead the ranking out of ${v(d.n_ranked)} places over ${d.params.period.label}.` : "No places matched.",
        sections: {},
        followups: ["Now just the monsoon months", "Show the fastest-worsening places instead", "Which state do these belong to?"],
      };
    }
    case "event": {
      return {
        headline: `${d.month} ${d.year} in ${d.place.name} read ${v(d.overall.value)} on the overall index, ranking ${v(d.overall.rank)} of ${v(d.overall.n_years)} for that month${d.is_record_high ? ", the highest on record" : ""}. The index gives context, not a cause.`,
        sections: {
          how_extreme: `Its overall anomaly of ${v(d.overall.value)} is ${level(d.overall.value)} against that place's own history.`,
          component_breakdown: d.main_driver ? `The largest contributor was ${String(d.main_driver).toLowerCase()}.` : "",
        },
        followups: [`How did the following month compare in ${d.place.name}?`, `Which other places were extreme in ${d.month} ${d.year}?`],
      };
    }
  }
  return { headline: "See the figures below.", sections: {}, followups: [] };
}

function featureOf(d: Obj, hint?: string): string {
  if (hint) return hint;
  if (d.standout_months) return "year";
  if (d.main_driver !== undefined) return "event";
  if (d.trends) return "compare";
  return "screen";
}

function findResults(req: LLMRequest): { feature: string; data: Obj } | null {
  const last = req.messages[req.messages.length - 1];
  const blocks: ContentBlock[] = typeof last.content === "string" ? [{ type: "text", text: last.content }] : last.content;
  for (const b of blocks) {
    if (b.type === "tool_result") {
      try { const data = JSON.parse((b as { content: string }).content); return { feature: featureOf(data), data }; } catch { /* next */ }
    }
  }
  // Guided mode: results are embedded in the first user message.
  const first = req.messages[0];
  const text = typeof first.content === "string" ? first.content : first.content.map((b) => (b.type === "text" ? (b as { text: string }).text : "")).join("\n");
  const m = text.match(/Report type: (\w+)\.[\s\S]*?\n(\{[\s\S]*\})/);
  if (m) { try { return { feature: featureOf({}, m[1]), data: JSON.parse(m[2]) }; } catch { /* ignore */ } }
  return null;
}

export class MockProvider implements LLMProvider {
  readonly id = "mock";
  readonly model = "mock-scripted";

  async complete(req: LLMRequest): Promise<LLMResponse> {
    const tokens = Math.ceil(JSON.stringify(req).length / 4);
    const hasResults = req.messages.some((m) => typeof m.content !== "string" && m.content.some((b) => b.type === "tool_result"));
    const guided = JSON.stringify(req.messages[0].content).includes("Report type:");
    const wantsPlan = req.tools.some((t) => t.name === "build_report") && !hasResults && !guided;
    let content: ContentBlock[];

    if (wantsPlan) {
      // Planning turn in free mode.
      const firstUser = req.messages[0].content;
      const text = typeof firstUser === "string" ? firstUser : "";
      const country = (text.match(/Selected country: (India|United Kingdom|Nepal)/)?.[1] === "United Kingdom" ? "uk" : text.includes("Selected country: Nepal") ? "nepal" : "india") as CountrySlug;
      const q = text.split("Question:")[1]?.trim() ?? "";
      const plan = parseQuestion(q, country);
      content = [{ type: "tool_use", id: "mock_plan", name: plan.tool, input: plan.input }];
    } else {
      const found = findResults(req);
      const n = found ? narrate(found.feature, found.data) : { headline: "See the figures below.", sections: {}, followups: [] };
      content = [{ type: "tool_use", id: "mock_finish", name: "finish", input: n }];
    }
    void sentence;
    return { content, stopReason: "tool_use", usage: { inputTokens: tokens, outputTokens: 200 } };
  }

  async testKey(): Promise<void> { /* the mock needs no key */ }
}
