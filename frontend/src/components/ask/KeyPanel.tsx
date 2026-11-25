"use client";

import { useState } from "react";
import { forgetKey, saveKey, saveModel, testKey, type KeyStore } from "../../lib/ask/client";
import { MODELS, PROVIDER_LABELS } from "../../lib/ask/providers/types";

const KEY_HELP = {
  anthropic: { url: "https://console.anthropic.com/settings/keys", hint: "sk-ant-…" },
  gemini: { url: "https://aistudio.google.com/apikey", hint: "AIza…" },
  openrouter: { url: "https://openrouter.ai/keys", hint: "sk-or-…" },
} as const;

export interface KeyState { key: string; store: KeyStore; demo: boolean; model: string }

const ALLOW_DEMO = process.env.NODE_ENV !== "production" || process.env.NEXT_PUBLIC_ASK_ALLOW_MOCK === "1";

export default function KeyPanel({ state, onChange }: { state: KeyState; onChange: (s: KeyState) => void }) {
  const [draft, setDraft] = useState("");
  const [remember, setRemember] = useState(false);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const [testing, setTesting] = useState(false);

  const connected = !!state.key || state.demo;
  const prov = MODELS.find((m) => m.id === state.model)?.provider ?? "anthropic";
  const help = KEY_HELP[prov];

  const test = async () => {
    const key = draft.trim() || state.key;
    if (!key && !state.demo) { setStatus({ ok: false, text: "Paste a key first." }); return; }
    setTesting(true);
    setStatus(null);
    try {
      await testKey(key, state.model, state.demo);
      if (draft.trim()) {
        saveKey(draft.trim(), remember);
        onChange({ ...state, key: draft.trim(), store: remember ? "device" : "session" });
        setDraft("");
      }
      setStatus({ ok: true, text: "Key works." });
    } catch (e) {
      setStatus({ ok: false, text: e instanceof Error ? e.message : "The key could not be tested." });
    } finally {
      setTesting(false);
    }
  };

  const forget = () => {
    forgetKey();
    setDraft("");
    setStatus(null);
    onChange({ ...state, key: "", store: null });
  };

  return (
    <section aria-labelledby="key-h" className="rounded-2xl border border-foreground/10 bg-surface p-5 shadow-card">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="key-h" className="text-base font-bold">Connect your API key</h2>
        <span className={`text-xs font-semibold ${connected ? "text-teal-700" : "text-foreground/50"}`} role="status">
          {state.demo ? "Demo mode: no AI model used" : state.key ? `Key connected (${state.store === "device" ? "remembered on this device" : "this tab only"})` : "No key yet"}
        </span>
      </div>
      <p className="mt-1 text-sm text-foreground/70">
        Answers are written by an AI model using <strong>your own</strong> {PROVIDER_LABELS[prov]} key (Anthropic, Google Gemini or OpenRouter: pick a model below), so we never pay for or hold your usage.
        Without a key you can still explore the starting points and forms below.
      </p>

      <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
        <div className="flex flex-col gap-1">
          <label htmlFor="llm-key" className="text-sm font-medium">API key</label>
          <input id="llm-key" type="password" autoComplete="off" spellCheck={false} value={draft} onChange={(e) => setDraft(e.target.value)}
            placeholder={state.key ? "Key saved. Paste a new one to replace it" : help.hint}
            className="min-h-11 rounded-xl border border-foreground/20 bg-surface px-3 font-mono text-sm" />
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={test} disabled={testing} className="min-h-11 rounded-xl bg-accent px-5 text-sm font-semibold text-white disabled:opacity-50">
            {testing ? "Testing…" : "Test key"}
          </button>
          <button type="button" onClick={forget} disabled={!state.key} className="min-h-11 rounded-xl border border-foreground/20 px-4 text-sm font-semibold disabled:opacity-40">Forget key</button>
        </div>
      </div>

      <div className="mt-3 flex flex-col gap-2">
        <label className="flex min-h-11 items-start gap-2 text-sm">
          <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} className="mt-1 h-4 w-4" />
          <span>Remember on this device <span className="text-foreground/60">(stored in this browser; anyone using this browser profile could use it. Leave off on shared computers.)</span></span>
        </label>
        <div className="flex flex-wrap items-center gap-3">
          <label htmlFor="model" className="text-sm font-medium">Model</label>
          <select id="model" value={state.model} onChange={(e) => { saveModel(e.target.value); onChange({ ...state, model: e.target.value }); }}
            className="min-h-11 rounded-xl border border-foreground/20 bg-surface px-3 text-sm">
            {MODELS.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
          </select>
          <a href={help.url} target="_blank" rel="noopener noreferrer" className="text-sm font-semibold text-accent underline underline-offset-2">
            How to get a key
          </a>
          {ALLOW_DEMO && (
            <label className="flex min-h-11 items-center gap-2 text-sm">
              <input type="checkbox" checked={state.demo} onChange={(e) => onChange({ ...state, demo: e.target.checked })} className="h-4 w-4" />
              Demo mode (scripted, no key)
            </label>
          )}
        </div>
        {status && <p role="status" className={`text-sm ${status.ok ? "text-teal-700" : "text-rose-700"}`}>{status.text}</p>}
      </div>

      <p className="mt-3 rounded-lg bg-surface-muted p-3 text-xs leading-relaxed text-foreground/70">
        <strong>What happens to your key:</strong> it stays in your browser (this tab only, unless you tick &ldquo;Remember&rdquo;) and is sent over HTTPS with each question to our server, which uses it once to call the AI provider.
        It is never saved, logged or shown back. Forget it any time.
      </p>
    </section>
  );
}
