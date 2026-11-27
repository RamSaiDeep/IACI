import type { CountrySlug } from "./labels";

/** The answer types: the six fixed categories, plus "answer" for a typed question the agent answered. */
export type Category = "snapshot" | "compare" | "rank" | "trend" | "event" | "help" | "answer";

export type Cell = string | number | null;

export type ReportSection =
  | { kind: "text"; title: string; body: string }
  | {
      kind: "table"; title: string; columns: string[]; rows: Cell[][];
      /** Column indexes holding z-scores, coloured with the site's scale. */
      valueCols?: number[]; note?: string; highlightRow?: number | null;
    }
  | {
      kind: "lines"; title: string; xLabel: string; yLabel: string;
      series: { name: string; points: { x: number; y: number | null }[] }[];
      marker?: number; note?: string;
    }
  | { kind: "bars"; title: string; unit: string; rows: { label: string; sub?: string | null; value: number; highlight?: boolean }[]; note?: string }
  | { kind: "news"; title: string; body: string };

export interface TraceEntry {
  name: string;
  args: Record<string, unknown>;
  ok: boolean;
  summary: string;
}

export type Slots = Record<string, unknown>;

export interface WriterUsage { provider: string; model: string; calls: number; inputTokens: number; outputTokens: number; costUsd: number | null }
export interface RouterUsage { calls: number; tokens: number; costUsd: number; models: string[] }

export interface ReportCard {
  feature: Category;
  title: string;
  subtitle: string;
  country: CountrySlug;
  /** Enough to re-run the report (copy link). Never holds a key. */
  request: AskRequest;
  headline: string;
  sections: ReportSection[];
  followups: string[];
  notes: string[];
  method: { baseline: string; version: string; source: string; index: string };
  trace: TraceEntry[];
  grounding: { status: "verified" | "repaired" | "stripped"; removed: string[] };
  usage: WriterUsage;
  /** The site's question router; null when the visitor's model did all the AI work (agent). */
  router: RouterUsage | null;
  createdAt: string;
}

export interface AskRequest {
  country: CountrySlug;
  question?: string | null;
  /** Set by guided forms and clarification choices: skips the router. */
  category?: Category | null;
  slots?: Slots | null;
  /** Names the user disambiguated: typed name (lower case) -> place id. */
  resolved?: Record<string, string>;
  /** The last answer, plus up to 3 recent exchanges (question + headline) so follow-ups keep context. */
  previous?: { question?: string | null; category: Category; slots?: Slots | null; summary: string;
    history?: { question: string; summary: string }[] };
  provider?: string;
  model?: string;
}

export interface ClarifyResponse {
  kind: "clarify";
  question: string;
  /** id = pick a place; category = pick an answer type; question = ask this example instead. */
  options: { label: string; id?: string; category?: Category; question?: string }[];
  query?: string | null;
  category?: Category | null;
  slots?: Slots | null;
  trace: TraceEntry[];
}

export type AskResponse = { kind: "report"; report: ReportCard } | ClarifyResponse;
