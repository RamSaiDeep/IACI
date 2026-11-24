import { describe, expect, it } from "vitest";
import { runAsk } from "../agent";
import { allowedNumbers, stripAttribution, stripUngrounded, ungroundedNumbers } from "../grounding";
import { MockProvider } from "../providers/mock";
import { AnthropicProvider } from "../providers/anthropic";
import type { LLMProvider, LLMResponse } from "../providers/types";
import type { AskRequest, ReportCard } from "../report-types";

const mock = new MockProvider();
const report = async (r: AskRequest, p: LLMProvider = mock) => {
  const out = await runAsk(r, p);
  expect(out.kind).toBe("report");
  if (p === mock) expect((out as { report: ReportCard }).report.headline).not.toBe("See the figures below.");
  return (out as { report: ReportCard }).report;
};

describe("grounding", () => {
  const allowed = allowedNumbers({ a: 0.84, rank: 3, n: 35 });
  it("accepts numbers present in results, with rounding and sign", () => {
    expect(ungroundedNumbers("Value 0.84 and -0.8, rank 3 of 35 since 1991.", allowed)).toEqual([]);
  });
  it("flags invented numbers", () => {
    expect(ungroundedNumbers("It rose 2.7 points.", allowed)).toEqual(["2.7"]);
  });
  it("strips the offending sentence only", () => {
    const r = stripUngrounded("Good 0.84. Bad 9.9. Fine.", allowed);
    expect(r.text).toBe("Good 0.84. Fine.");
    expect(r.removed).toEqual(["Bad 9.9."]);
  });
  it("removes climate-change attribution", () => {
    expect(stripAttribution("The flood was caused by climate change. It was wet.").text).toBe("It was wet.");
  });
});

describe("feature 3: screening (guided and free)", () => {
  it("guided ranking returns table, chart and trace", async () => {
    const r = await report({ mode: "screen", country: "india", params: { region: "Odisha", component: "rainfall", season: "monsoon", periodYear: 2024 } });
    expect(r.feature).toBe("screen");
    expect(r.sections.map((s) => s.kind)).toEqual(["text", "table", "bars"]);
    expect(r.trace.map((t) => t.name)).toContain("rank_places");
    expect(r.method.baseline).toBe("1991–2020");
    expect(r.followups.length).toBeGreaterThan(0);
  });
  it("free text is routed to screening", async () => {
    const r = await report({ mode: "free", country: "india", question: "Which Odisha districts had the worst rainfall extremes in monsoon 2024?" });
    expect(r.feature).toBe("screen");
    expect(r.subtitle).toMatch(/Odisha/);
  });
  it("fastest worsening", async () => {
    const r = await report({ mode: "free", country: "india", question: "Where is drought getting worse fastest?" });
    expect(r.title).toMatch(/fastest worsening/);
  });
});

describe("feature 1: year in review", () => {
  it("has all six sections' content in order", async () => {
    const r = await report({ mode: "year", country: "india", params: { place: "Guntur", year: 2024 } });
    const titles = r.sections.map((s) => s.title).filter(Boolean);
    expect(titles).toEqual(["Headline", "Scorecard", "Month by month", "Trend context", "Regional context"]);
    expect(r.notes.join(" ")).toMatch(/1991–2020/);
    expect(r.trace.map((t) => t.name)).toEqual(expect.arrayContaining(["get_annual_summary", "trend", "neighbours"]));
  });
  it("free text 'How was 2024 for Guntur district?'", async () => {
    const r = await report({ mode: "free", country: "india", question: "How was 2024 for Guntur district?" });
    expect(r.feature).toBe("year");
    expect(r.title).toMatch(/Guntur/);
  });
  it("flags a partial year", async () => {
    const r = await report({ mode: "year", country: "india", params: { place: "Guntur", year: 2026 } });
    expect(r.notes.join(" ")).toMatch(/not a complete year/);
  });
});

describe("feature 2: comparison", () => {
  it("compares across countries and says what is missing", async () => {
    const r = await report({ mode: "compare", country: "india", params: { place: "Chennai", placeB: "Kathmandu", fromYear: 2000, toYear: 2020 } });
    const table = r.sections.find((s) => s.kind === "table") as { rows: unknown[][] };
    expect(JSON.stringify(table.rows)).toMatch(/Not part of the index here/);
    expect(r.sections.some((s) => s.kind === "lines")).toBe(true);
  });
  it("free text vs", async () => {
    const r = await report({ mode: "free", country: "india", question: "Chennai vs Hyderabad, 2015–2025" });
    expect(r.feature).toBe("compare");
  });
});

describe("feature 4: event explainer", () => {
  it("keeps the context-not-attribution note and a separate news box", async () => {
    const r = await report({ mode: "event", country: "india", params: { place: "Wayanad", month: 7, year: 2024, news: true } });
    expect(r.sections.map((s) => s.kind)).toContain("news");
    expect(r.notes.join(" ")).toMatch(/not attribution/);
    expect(JSON.stringify(r.sections.filter((s) => s.kind !== "news"))).not.toMatch(/climate change/i);
  });
  it("free text with month and year", async () => {
    const r = await report({ mode: "free", country: "india", question: "What drove the high index in Assam in June 2022?" });
    expect(r.feature).toBe("event");
  });
});

describe("ambiguity", () => {
  it("asks which place instead of guessing (duplicate names)", async () => {
    const { loadCountry } = await import("../data");
    const seen = new Map<string, number>();
    for (const p of loadCountry("india").places.values()) if (p.level === "child") seen.set(p.name, (seen.get(p.name) ?? 0) + 1);
    const dup = [...seen.entries()].find(([, n]) => n > 1)![0];
    const out = await runAsk({ mode: "year", country: "india", params: { place: dup, year: 2023 } }, mock);
    expect(out.kind).toBe("clarify");
    if (out.kind === "clarify") expect(out.options.length).toBeGreaterThan(1);
  });
  it("accepts the chosen id afterwards", async () => {
    const out = await runAsk({ mode: "year", country: "india", params: { place: "india/district/ANDHRA PRADESH/GUNTUR", year: 2023 } }, mock);
    expect(out.kind).toBe("report");
  });
  it("unknown place -> clarify", async () => {
    const out = await runAsk({ mode: "year", country: "india", params: { place: "Zzzzqx", year: 2023 } }, mock);
    expect(out.kind).toBe("clarify");
  });
  it("free question with no year asks a short question", async () => {
    const out = await runAsk({ mode: "free", country: "india", question: "Tell me about Guntur" }, mock);
    expect(out.kind).toBe("clarify");
  });
});

describe("grounding in the loop", () => {
  it("strips invented numbers from a misbehaving model", async () => {
    const liar: LLMProvider = {
      id: "liar", model: "liar",
      async testKey() {},
      async complete(): Promise<LLMResponse> {
        return { content: [{ type: "tool_use", id: "x", name: "finish", input: { headline: "Guntur was 7.77 above normal. It was a year.", sections: {}, followups: [] } }], stopReason: "tool_use", usage: { inputTokens: 1, outputTokens: 1 } };
      },
    };
    const r = await report({ mode: "year", country: "india", params: { place: "Guntur", year: 2023 } }, liar);
    expect(r.headline).not.toContain("7.77");
    expect(r.grounding.status).toBe("stripped");
    expect(r.grounding.removed.length).toBe(1);
  });
});

describe("API key hygiene", () => {
  it("never leaks the key in provider errors", async () => {
    const KEY = "sk-ant-SECRET-1234567890";
    const orig = globalThis.fetch;
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ error: { message: `bad key ${KEY}` } }), { status: 401 })) as typeof fetch;
    try {
      await new AnthropicProvider(KEY, "claude-sonnet-5-5").testKey();
      throw new Error("should have thrown");
    } catch (e) {
      const msg = (e as Error).message;
      expect(msg).not.toContain(KEY);
      expect((e as { code: string }).code).toBe("invalid_key");
    } finally {
      globalThis.fetch = orig;
    }
  });
  it("maps credit and rate-limit errors", async () => {
    const orig = globalThis.fetch;
    const mk = (status: number, message: string) => (async () => new Response(JSON.stringify({ error: { message } }), { status })) as typeof fetch;
    try {
      globalThis.fetch = mk(400, "Your credit balance is too low");
      await expect(new AnthropicProvider("k", "claude-sonnet-5-5").testKey()).rejects.toMatchObject({ code: "insufficient_credit" });
      globalThis.fetch = mk(429, "slow down");
      await expect(new AnthropicProvider("k", "claude-sonnet-5-5").testKey()).rejects.toMatchObject({ code: "rate_limited" });
    } finally {
      globalThis.fetch = orig;
    }
  });
});
