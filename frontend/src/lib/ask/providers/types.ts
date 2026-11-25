/** Provider-neutral shapes. Anthropic's wire format is the model for them. */

export type ContentBlock =
  | { type: "text"; text: string }
  | { type: "tool_use"; id: string; name: string; input: Record<string, unknown> }
  | { type: "tool_result"; tool_use_id: string; content: string; is_error?: boolean }
  // Provider-specific blocks (e.g. thinking) must be passed back unchanged.
  | { type: string; [k: string]: unknown };

export interface LLMMessage {
  role: "user" | "assistant";
  content: string | ContentBlock[];
}

export interface LLMTool {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

export interface LLMRequest {
  system: string;
  messages: LLMMessage[];
  tools: LLMTool[];
  maxTokens: number;
}

export interface LLMResponse {
  content: ContentBlock[];
  stopReason: string;
  usage: { inputTokens: number; outputTokens: number };
}

export interface LLMProvider {
  readonly id: string;
  readonly model: string;
  complete(req: LLMRequest): Promise<LLMResponse>;
  /** Cheap call proving the key works. Throws AskError on failure. */
  testKey(): Promise<void>;
}

export type AskErrorCode =
  | "missing_key" | "invalid_key" | "insufficient_credit" | "rate_limited"
  | "model_error" | "bad_request" | "overloaded" | "internal";

/** An error whose message is safe to show to the user (never contains the key). */
export class AskError extends Error {
  constructor(public code: AskErrorCode, message: string, public status = 400) {
    super(message);
  }
}

export type ProviderId = "anthropic" | "gemini" | "openrouter";

export const PROVIDER_LABELS: Record<ProviderId, string> = {
  anthropic: "Anthropic",
  gemini: "Google Gemini",
  openrouter: "OpenRouter",
};

/**
 * Price hints only (used for the cost estimate when the typed model matches). Approximate USD per million tokens (input, output). Anthropic list prices checked Nov 2026;
 * Gemini / OpenRouter figures are approximate, so verify before relying on them. The model id decides the provider.
 */
export const MODELS: { id: string; provider: ProviderId; label: string; inPerM: number; outPerM: number }[] = [
  { id: "claude-sonnet-5-5", provider: "anthropic", label: "Anthropic: Claude Sonnet 5.5 (default)", inPerM: 2, outPerM: 10 },
  { id: "claude-haiku-5-5", provider: "anthropic", label: "Anthropic: Claude Haiku 5.5 (cheapest)", inPerM: 0.1, outPerM: 0.5 },
  { id: "claude-opus-5-5", provider: "anthropic", label: "Anthropic: Claude Opus 5.5", inPerM: 4, outPerM: 20 },
  { id: "claude-fable-5-2", provider: "anthropic", label: "Anthropic: Claude Fable 5.2 (most capable)", inPerM: 8, outPerM: 40 },
  { id: "gemini-2.5-flash", provider: "gemini", label: "Google Gemini 2.5 Flash (free tier available)", inPerM: 0.3, outPerM: 2.5 },
  { id: "gemini-2.5-flash-lite", provider: "gemini", label: "Google Gemini 2.5 Flash-Lite (cheapest)", inPerM: 0.1, outPerM: 0.4 },
  { id: "gemini-2.5-pro", provider: "gemini", label: "Google Gemini 2.5 Pro", inPerM: 1.25, outPerM: 10 },
  { id: "google/gemini-2.5-flash", provider: "openrouter", label: "OpenRouter: Gemini 2.5 Flash", inPerM: 0.3, outPerM: 2.5 },
  { id: "openai/gpt-4o-mini", provider: "openrouter", label: "OpenRouter: GPT-4o mini", inPerM: 0.15, outPerM: 0.6 },
  { id: "meta-llama/llama-3.3-70b-instruct:free", provider: "openrouter", label: "OpenRouter: Llama 3.3 70B (free)", inPerM: 0, outPerM: 0 },
];
/** Suggested model names (placeholders only; users may type any model their key can use). */
export const DEFAULT_MODELS: Record<ProviderId, string> = {
  anthropic: "claude-sonnet-5-5",
  gemini: "gemini-2.5-flash",
  openrouter: "google/gemini-2.5-flash",
};

export function estimateCostUsd(model: string, inputTokens: number, outputTokens: number): number | null {
  const m = MODELS.find((x) => x.id === model);
  return m ? (inputTokens * m.inPerM + outputTokens * m.outPerM) / 1_000_000 : null;
}
