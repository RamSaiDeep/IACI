/** Browser-side helpers for Ask the Index: key storage and the API call. */

import type { AskRequest, AskResponse } from "./report-types";
import { PROVIDER_LABELS, type ProviderId } from "./providers/types";

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

async function post(body: unknown, key: string): Promise<Response> {
  try {
    return await fetch("/api/ask", {
      method: "POST",
      headers: { "content-type": "application/json", ...(key ? { "x-llm-key": key } : {}) },
      body: JSON.stringify(body),
    });
  } catch {
    throw new ApiError("network", "Could not reach the server. Check your connection and try again.");
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

export async function ask(request: AskRequest, key: string, mock: boolean, onProgress?: (text: string) => void): Promise<AskResponse> {
  const res = await post({ request, mock, stream: true }, key);
  if (!res.ok || !res.body) return parse<AskResponse>(res); // validation errors come back as plain JSON
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

export async function testKey(key: string, provider: string, model: string, mock: boolean): Promise<void> {
  await parse(await post({ action: "test-key", provider, model, mock }, key));
}

/** Share link: the request (never the key) in the URL hash. */
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
