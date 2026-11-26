/** Browser-side helpers for Ask the Index: key storage and calls to the Python backend. */

import type { AskRequest, AskResponse } from "./report-types";

/** The FastAPI service (backend/ask_api): local in `next dev`, the Render service in deployed builds. NEXT_PUBLIC_ASK_API_URL overrides both. */
export const ASK_API_URL = (process.env.NEXT_PUBLIC_ASK_API_URL
  ?? (process.env.NODE_ENV === "production" ? "https://iaci-ask-api.onrender.com" : "http://localhost:8000")).replace(/\/$/, "");

export type ProviderId = "anthropic" | "gemini" | "openrouter";
export const PROVIDER_LABELS: Record<ProviderId, string> = { anthropic: "Anthropic", gemini: "Google Gemini", openrouter: "OpenRouter" };
/** Suggested model names only; users may type any model their key can use. */
export const DEFAULT_MODELS: Record<ProviderId, string> = {
  anthropic: "claude-sonnet-5-5",
  gemini: "gemini-2.5-flash",
  openrouter: "google/gemma-4-31b-it:free",
};

const KEY_NAME = "aci-ask-llm-key";
const MODEL_NAME = "aci-ask-model";

export type KeyStore = "session" | "device" | null;

/** The key lives in sessionStorage by default (gone when the tab closes). */
export function loadKey(): { key: string; store: KeyStore } {
  try {
    const d = window.localStorage.getItem(KEY_NAME);
    if (d) return { key: d, store: "device" };
    const s = window.sessionStorage.getItem(KEY_NAME);
    if (s) return { key: s, store: "session" };
  } catch { /* storage blocked */ }
  return { key: "", store: null };
}

export function saveKey(key: string, remember: boolean): void {
  try {
    window.sessionStorage.removeItem(KEY_NAME);
    window.localStorage.removeItem(KEY_NAME);
    (remember ? window.localStorage : window.sessionStorage).setItem(KEY_NAME, key);
  } catch { /* storage blocked: the key then lives in memory only */ }
}

export function forgetKey(): void {
  try {
    window.sessionStorage.removeItem(KEY_NAME);
    window.localStorage.removeItem(KEY_NAME);
  } catch { /* ignore */ }
}

export interface Choice { provider: ProviderId; model: string }
export function loadChoice(): Choice | null {
  try {
    const c = JSON.parse(window.localStorage.getItem(MODEL_NAME) ?? "null") as Choice | null;
    return c && c.provider in PROVIDER_LABELS && typeof c.model === "string" ? c : null;
  } catch { return null; }
}
export function saveChoice(c: Choice): void {
  try { window.localStorage.setItem(MODEL_NAME, JSON.stringify(c)); } catch { /* ignore */ }
}

export class ApiError extends Error {
  constructor(public code: string, message: string) { super(message); }
}

async function post(path: string, body: unknown, key: string): Promise<Response> {
  try {
    return await fetch(`${ASK_API_URL}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", ...(key ? { "x-llm-key": key } : {}) },
      body: JSON.stringify(body),
    });
  } catch {
    throw new ApiError("network", "Could not reach the ClimateIQ Agent service. Check your connection and try again.");
  }
}

async function parse<T>(res: Response): Promise<T> {
  let json: unknown = null;
  try { json = await res.json(); } catch { /* non-JSON */ }
  if (!res.ok) {
    const e = (json as { error?: { code?: string; message?: string } } | null)?.error;
    throw new ApiError(e?.code ?? "internal", e?.message ?? "Something went wrong. Please try again.");
  }
  return json as T;
}

/** Streams progress lines to onProgress, then resolves with the answer. */
export async function ask(request: AskRequest, key: string, onProgress?: (text: string) => void): Promise<AskResponse> {
  const res = await post("/ask", request, key);
  if (!res.ok || !res.body) return parse<AskResponse>(res);
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  let result: AskResponse | null = null;
  const handle = (line: string) => {
    if (!line.trim()) return;
    const m = JSON.parse(line) as { progress?: string; result?: AskResponse; error?: { code?: string; message?: string } };
    if (m.progress) onProgress?.(m.progress);
    if (m.result) result = m.result;
    if (m.error) throw new ApiError(m.error.code ?? "internal", m.error.message ?? "Something went wrong. Please try again.");
  };
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const lines = buf.split("\n");
    buf = lines.pop() ?? "";
    lines.forEach(handle);
  }
  handle(buf);
  if (!result) throw new ApiError("internal", "The answer was cut off. Please try again.");
  return result;
}

export async function testKey(key: string, provider: string, model: string): Promise<void> {
  await parse(await post("/test-key", { provider, model }, key));
}

/** Free OpenRouter models that can use tools (default first). [] if the service can't be reached. */
export async function freeModels(): Promise<string[]> {
  try {
    const res = await fetch(`${ASK_API_URL}/models/free`);
    return res.ok ? ((await res.json()) as { models?: string[] }).models ?? [] : [];
  } catch {
    return [];
  }
}

/** Share link: the request (never the key or model) in the URL hash. */
export function shareUrl(request: AskRequest): string {
  const clean = { ...request, model: undefined, provider: undefined };
  const b64 = btoa(unescape(encodeURIComponent(JSON.stringify(clean))));
  return `${window.location.origin}/ask#r=${b64}`;
}

export function readSharedRequest(): AskRequest | null {
  try {
    const m = window.location.hash.match(/#r=(.+)$/);
    if (!m) return null;
    return JSON.parse(decodeURIComponent(escape(atob(m[1])))) as AskRequest;
  } catch {
    return null;
  }
}
