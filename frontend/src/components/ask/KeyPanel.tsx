"use client";

import { useEffect, useState } from "react";
import { DEFAULT_MODELS, PROVIDER_LABELS, forgetKey, freeModels, saveChoice, saveKey, testKey, type KeyStore, type ProviderId } from "../../lib/ask/client";

const KEY_HELP = {
  anthropic: { url: "https://console.anthropic.com/settings/keys", hint: "sk-ant-…" },
  gemini: { url: "https://aistudio.google.com/apikey", hint: "AIza…" },
  openrouter: { url: "https://openrouter.ai/keys", hint: "sk-or-…" },
} as const;

export interface KeyState { key: string; store: KeyStore; provider: ProviderId; model: string }

/** The "Set API key" panel, opened from the bar under the header. */
export default function KeyPanel({ state, onChange, onClose, notice }: {
  state: KeyState; onChange: (s: KeyState) => void; onClose: () => void; notice?: string | null;
}) {
  const [draft, setDraft] = useState("");
  const [remember, setRemember] = useState(false);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const [testing, setTesting] = useState(false);
  const [free, setFree] = useState<string[]>([]);
  const prov = state.provider;
  const help = KEY_HELP[prov];

  // Suggestions for OpenRouter: free models that can use tools (fetched once, when OpenRouter is picked).
  useEffect(() => {
    if (prov !== "openrouter" || free.length) return;
    let live = true;
    void freeModels().then((m) => { if (live) setFree(m); });
    return () => { live = false; };
  }, [prov, free.length]);

  const test = async () => {
    const key = draft.trim() || state.key;
    if (!key) { setStatus({ ok: false, text: "Paste a key first." }); return; }
    setTesting(true);
    setStatus(null);
    try {
      await testKey(key, state.provider, state.model);
      if (draft.trim()) {
        saveKey(draft.trim(), remember);
        onChange({ ...state, key: draft.trim(), store: remember ? "device" : "session" });
        setDraft("");
      }
      setStatus({ ok: true, text: "Key works. You can ask questions now." });
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
    <section id="key-panel" aria-labelledby="key-h" className="rounded-2xl border border-foreground/10 bg-surface p-5 shadow-card">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 id="key-h" className="text-base font-bold">Set your API key</h2>
          <p className="mt-1 text-sm text-foreground/70">
            Your key runs the AI that reads your question, picks which of our tools to use and writes the answer. Every number is calculated on our side and checked.
          </p>
        </div>
        <button type="button" onClick={onClose} aria-label="Close the API key panel"
          className="min-h-11 min-w-11 rounded-xl border border-foreground/20 px-3 text-sm font-semibold hover:border-accent">Close</button>
      </div>
      {notice && <p role="alert" className="mt-3 rounded-lg border border-accent/40 bg-accent/5 p-3 text-sm">{notice}</p>}

      <div className="mt-4 grid gap-3 sm:grid-cols-[auto_1fr] sm:items-end">
        <div className="flex flex-col gap-1">
          <label htmlFor="provider" className="text-sm font-medium">Provider</label>
          <select id="provider" value={prov} onChange={(e) => {
            const p = e.target.value as ProviderId;
            saveChoice({ provider: p, model: DEFAULT_MODELS[p] });
            onChange({ ...state, provider: p, model: DEFAULT_MODELS[p] });
          }} className="min-h-11 rounded-xl border border-foreground/20 bg-surface px-3 text-sm">
            {(Object.keys(PROVIDER_LABELS) as ProviderId[]).map((p) => <option key={p} value={p}>{PROVIDER_LABELS[p]}</option>)}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="model" className="text-sm font-medium">Model name</label>
          <input id="model" value={state.model} spellCheck={false} autoComplete="off" maxLength={100}
            list={prov === "openrouter" ? "free-models" : undefined}
            onChange={(e) => { saveChoice({ provider: prov, model: e.target.value }); onChange({ ...state, model: e.target.value }); }}
            placeholder={DEFAULT_MODELS[prov]}
            className="min-h-11 rounded-xl border border-foreground/20 bg-surface px-3 font-mono text-sm" />
          {prov === "openrouter" && <datalist id="free-models">{free.map((m) => <option key={m} value={m} />)}</datalist>}
        </div>
      </div>
      {prov === "openrouter" && (
        <p className="mt-2 text-xs text-foreground/60">
          Suggestions are free models that can use tools; clear the box to see them all. Free models allow 20 questions a minute and 50 a day on your OpenRouter account (1,000 a day once you have bought $10 of credit). Any other model id works too.
        </p>
      )}

      <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
        <div className="flex flex-col gap-1">
          <label htmlFor="llm-key" className="text-sm font-medium">API key</label>
          <input id="llm-key" type="password" autoComplete="off" spellCheck={false} value={draft} onChange={(e) => setDraft(e.target.value)}
            placeholder={state.key ? "Key saved. Paste a new one to replace it" : help.hint}
            className="min-h-11 rounded-xl border border-foreground/20 bg-surface px-3 font-mono text-sm" />
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={test} disabled={testing} className="min-h-11 rounded-xl bg-accent px-5 text-sm font-semibold text-white disabled:opacity-50">
            {testing ? "Testing…" : "Save and test"}
          </button>
          <button type="button" onClick={forget} disabled={!state.key} className="min-h-11 rounded-xl border border-foreground/20 px-4 text-sm font-semibold disabled:opacity-40">Forget key</button>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <label className="flex min-h-11 items-start gap-2 text-sm">
          <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} className="mt-1 h-4 w-4" />
          <span>Remember on this device <span className="text-foreground/60">(leave off on shared computers)</span></span>
        </label>
        <a href={help.url} target="_blank" rel="noopener noreferrer" className="text-sm font-semibold text-accent underline underline-offset-2">
          How to get a {PROVIDER_LABELS[prov]} key
        </a>
      </div>
      {status && <p role="status" className={`mt-2 text-sm ${status.ok ? "text-teal-700" : "text-rose-700"}`}>{status.text}</p>}

      <p className="mt-3 rounded-lg bg-surface-muted p-3 text-xs leading-relaxed text-foreground/70">
        <strong>What happens to your key:</strong> it stays in your browser (this tab only, unless you tick &ldquo;Remember&rdquo;) and is sent over HTTPS with each question to our service, which uses it once to call {PROVIDER_LABELS[prov]}.
        It is never saved, logged or shown back.
      </p>
    </section>
  );
}
