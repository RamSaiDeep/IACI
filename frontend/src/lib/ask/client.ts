/** Browser-side helpers for Ask the Index: key storage and the API call. */

import type { AskRequest, AskResponse } from "./report-types";

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

export function loadModel(): string | null {
  try { return window.localStorage.getItem(MODEL_NAME); } catch { return null; }
}
export function saveModel(m: string): void {
  try { window.localStorage.setItem(MODEL_NAME, m); } catch { /* ignore */ }
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

export async function ask(request: AskRequest, key: string, mock: boolean): Promise<AskResponse> {
  return parse<AskResponse>(await post({ request, mock }, key));
}

export async function testKey(key: string, model: string, mock: boolean): Promise<void> {
  await parse(await post({ action: "test-key", model, mock }, key));
}

/** Share link: the request (never the key) in the URL hash. */
export function shareUrl(request: AskRequest): string {
  const clean = { ...request, model: undefined };
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
