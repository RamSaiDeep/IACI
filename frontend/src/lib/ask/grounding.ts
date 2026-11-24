/**
 * Grounding check: every number in the model's prose must appear in a tool
 * result (or be a fixed constant such as the baseline years). Sentences that
 * fail are reported so the agent can regenerate or strip them.
 */

const NUM = /(?<![\w.])[-+−]?\d+(?:\.\d+)?/g;

/** Constants that legitimately appear without being a tool value. */
const ALWAYS = new Set([1, 1991, 2020, 0.05, 5, 12, 10]);

function collect(x: unknown, out: number[]): void {
  if (typeof x === "number" && Number.isFinite(x)) out.push(x);
  else if (typeof x === "string") for (const m of x.match(NUM) ?? []) out.push(Math.abs(parseFloat(m.replace("−", "-"))));
  else if (Array.isArray(x)) x.forEach((v) => collect(v, out));
  else if (x && typeof x === "object") Object.values(x).forEach((v) => collect(v, out));
}

export function allowedNumbers(...sources: unknown[]): number[] {
  const out: number[] = [];
  sources.forEach((s) => collect(s, out));
  return out.map(Math.abs);
}

function decimals(token: string): number {
  const i = token.indexOf(".");
  return i < 0 ? 0 : token.length - i - 1;
}

function grounded(token: string, allowed: number[]): boolean {
  const t = Math.abs(parseFloat(token.replace("−", "-")));
  if (ALWAYS.has(t)) return true;
  const d = decimals(token);
  const f = 10 ** d;
  return allowed.some((a) => a === t || Math.round(a * f) / f === t || Math.abs(Math.round(a * f) / f - t) < 1e-9);
}

export function ungroundedNumbers(text: string, allowed: number[]): string[] {
  return (text.match(NUM) ?? []).filter((tok) => !grounded(tok, allowed));
}

/** Drop sentences containing an ungrounded number. Returns cleaned text + what was dropped. */
export function stripUngrounded(text: string, allowed: number[]): { text: string; removed: string[] } {
  const sentences = text.split(/(?<=[.!?])\s+/);
  const removed: string[] = [];
  const kept = sentences.filter((s) => {
    if (ungroundedNumbers(s, allowed).length) {
      removed.push(s);
      return false;
    }
    return true;
  });
  return { text: kept.join(" ").trim(), removed };
}

const ATTRIBUTION =
  /(caused|driven|triggered|exacerbated|worsened|made worse|attributable|due)\s+(by|to)\s+[^.]*\b(climate change|global warming|anthropogenic)|climate change\s+(caused|made|led|drove|is responsible)|because of (climate change|global warming)/i;

/** The event explainer is context, never attribution. */
export function stripAttribution(text: string): { text: string; removed: string[] } {
  const removed: string[] = [];
  const kept = text.split(/(?<=[.!?])\s+/).filter((s) => {
    if (ATTRIBUTION.test(s)) { removed.push(s); return false; }
    return true;
  });
  return { text: kept.join(" ").trim(), removed };
}
