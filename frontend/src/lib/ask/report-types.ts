import type { CountrySlug } from "./labels";

export type Feature = "year" | "compare" | "screen" | "event";

export type Cell = string | number | null;

export type ReportSection =
  | { kind: "text"; title: string; body: string }
  | {
      kind: "table"; title: string; columns: string[]; rows: Cell[][];
      /** Column indexes holding z-scores, coloured with the site's scale. */
      valueCols?: number[]; note?: string; highlightRow?: number;
    }
  | {
      kind: "lines"; title: string; xLabel: string; yLabel: string;
      series: { name: string; points: { x: number; y: number | null }[] }[];
      /** Optional vertical marker (e.g. the year in review). */
      marker?: number; note?: string;
    }
  | { kind: "bars"; title: string; unit: string; rows: { label: string; sub?: string; value: number; highlight?: boolean }[]; note?: string }
  | { kind: "news"; title: string; body: string };

export interface TraceEntry {
  name: string;
  args: Record<string, unknown>;
  ok: boolean;
  /** One-line summary of the result for the "How this was worked out" panel. */
  summary: string;
}

export interface ReportCard {
  feature: Feature;
  title: string;
  subtitle: string;
  country: CountrySlug;
  /** Everything needed to re-run the report (copy link). */
  request: AskRequest;
  headline: string;
  sections: ReportSection[];
  followups: string[];
  notes: string[];
  method: { baseline: string; version: string; source: string; index: string };
  trace: TraceEntry[];
  grounding: { status: "verified" | "repaired" | "stripped" | "mock"; removed: string[] };
  usage: { provider: string; model: string; calls: number; inputTokens: number; outputTokens: number; costUsd: number | null };
  createdAt: string;
}

export interface GuidedParams {
  place?: string;
  placeB?: string;
  year?: number;
  month?: number;
  fromYear?: number;
  toYear?: number;
  region?: string;
  component?: string;
  season?: string;
  periodYear?: number;
  lastYears?: number;
  rankBy?: "most_extreme" | "fastest_worsening";
  news?: boolean;
}

export interface AskRequest {
  mode: "free" | Feature;
  country: import("./labels").CountrySlug;
  question?: string;
  params?: GuidedParams;
  /** Names the user disambiguated: query name (lower case) -> place id. */
  resolved?: Record<string, string>;
  /** The report this follow-up refers to. */
  previous?: { question?: string; feature: Feature; summary: string };
  model?: string;
  provider?: string;
}

export interface ClarifyResponse {
  kind: "clarify";
  question: string;
  options: { label: string; name?: string; id?: string }[];
  /** The ambiguous query text, so the client can pass `resolved`. */
  query?: string;
  usage: ReportCard["usage"];
  trace: TraceEntry[];
}

export type AskResponse = { kind: "report"; report: ReportCard } | ClarifyResponse;
