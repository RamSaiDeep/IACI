"use client";

import { useState } from "react";
import { colorForValue, formatValue } from "../../lib/indicators";
import { shareUrl } from "../../lib/ask/client";
import type { Cell, ReportCard, ReportSection } from "../../lib/ask/report-types";

const SERIES_COLORS = ["#f26a21", "#103b7b", "#0d9488", "#b45309"];
const EYEBROW: Record<string, string> = { snapshot: "Snapshot", compare: "Comparison", rank: "Ranking", trend: "Trend", event: "Event explainer", help: "About the index" };

function CellView({ v, isValue }: { v: Cell; isValue: boolean }) {
  if (v == null) return <span className="text-foreground/40">—</span>;
  if (isValue && typeof v === "number") {
    return (
      <span className="inline-block min-w-14 rounded-md px-2 py-0.5 text-center font-mono text-xs font-semibold text-foreground" style={{ background: colorForValue(v) }}>
        {formatValue(v)}
      </span>
    );
  }
  return <>{v}</>;
}

function Table({ s }: { s: Extract<ReportSection, { kind: "table" }> }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-foreground/10">
      <table className="w-full min-w-[28rem] text-left text-sm">
        <thead className="bg-surface-muted text-xs uppercase tracking-wide text-foreground/60">
          <tr>{s.columns.map((c) => <th key={c} scope="col" className="px-3 py-2 font-semibold">{c}</th>)}</tr>
        </thead>
        <tbody>
          {s.rows.map((r, i) => (
            <tr key={i} className={`border-t border-foreground/10 ${s.highlightRow === i ? "bg-accent/5 font-semibold" : ""}`}>
              {r.map((c, j) => (
                <td key={j} className="px-3 py-2 align-middle">
                  <CellView v={c} isValue={!!s.valueCols?.includes(j)} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function LineChart({ s }: { s: Extract<ReportSection, { kind: "lines" }> }) {
  const W = 640, H = 240, L = 44, R = 12, T = 12, B = 32;
  const pts = s.series.flatMap((x) => x.points).filter((p) => p.y != null) as { x: number; y: number }[];
  if (!pts.length) return <p className="text-sm text-foreground/60">Not enough data to draw this chart.</p>;
  const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
  const x0 = Math.min(...xs), x1 = Math.max(...xs);
  const pad = 0.15;
  const y0 = Math.min(...ys, 0) - pad, y1 = Math.max(...ys, 0) + pad;
  const X = (x: number) => L + ((x - x0) / Math.max(x1 - x0, 1)) * (W - L - R);
  const Y = (y: number) => T + (1 - (y - y0) / (y1 - y0)) * (H - T - B);
  const yTicks = [y0, (y0 + y1) / 2, y1].map((v) => Math.round(v * 10) / 10);
  const xTicks = [x0, Math.round((x0 + x1) / 2), x1];
  return (
    <figure>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${s.title}: ${s.series.map((x) => x.name).join(", ")}`} className="w-full">
        <line x1={L} x2={W - R} y1={Y(0)} y2={Y(0)} stroke="currentColor" strokeOpacity="0.25" strokeDasharray="4 3" />
        {yTicks.map((t) => (
          <text key={t} x={L - 6} y={Y(t) + 4} textAnchor="end" fontSize="10" fill="currentColor" fillOpacity="0.6">{t}</text>
        ))}
        {xTicks.map((t) => (
          <text key={t} x={X(t)} y={H - 10} textAnchor="middle" fontSize="10" fill="currentColor" fillOpacity="0.6">{t}</text>
        ))}
        {s.marker != null && s.marker >= x0 && s.marker <= x1 && (
          <line x1={X(s.marker)} x2={X(s.marker)} y1={T} y2={H - B} stroke="#f26a21" strokeWidth="1.5" strokeDasharray="3 3" />
        )}
        {s.series.map((ser, i) => {
          let d = "";
          let pen = false;
          for (const p of ser.points) {
            if (p.y == null) { pen = false; continue; }
            d += `${pen ? "L" : "M"}${X(p.x).toFixed(1)},${Y(p.y).toFixed(1)} `;
            pen = true;
          }
          return <path key={ser.name} d={d} fill="none" stroke={SERIES_COLORS[i % 4]} strokeWidth="2" />;
        })}
      </svg>
      <figcaption className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-foreground/70">
        {s.series.map((ser, i) => (
          <span key={ser.name} className="inline-flex items-center gap-1.5">
            <span className="h-0.5 w-4" style={{ background: SERIES_COLORS[i % 4] }} />{ser.name}
          </span>
        ))}
        <span>{s.yLabel}</span>
      </figcaption>
    </figure>
  );
}

function Bars({ s }: { s: Extract<ReportSection, { kind: "bars" }> }) {
  const max = Math.max(...s.rows.map((r) => Math.abs(r.value)), 0.01);
  return (
    <ul className="flex flex-col gap-1.5" aria-label={s.title}>
      {s.rows.map((r) => (
        <li key={r.label + (r.sub ?? "")} className="grid grid-cols-[minmax(6rem,10rem)_1fr_3.5rem] items-center gap-2 text-sm">
          <span className="truncate" title={r.sub ? `${r.label}, ${r.sub}` : r.label}>{r.label}</span>
          <span className="relative h-4 rounded bg-surface-muted">
            <span
              className={`absolute inset-y-0 left-0 rounded ${r.highlight ? "bg-accent" : "bg-navy-mid/60"}`}
              style={{ width: `${(Math.abs(r.value) / max) * 100}%` }}
            />
          </span>
          <span className="text-right font-mono text-xs">{formatValue(r.value)}</span>
        </li>
      ))}
      <li className="text-xs text-foreground/60">Unit: {s.unit}</li>
    </ul>
  );
}

function Section({ s }: { s: ReportSection }) {
  if (s.kind === "news") {
    return (
      <aside className="rounded-xl border-2 border-dashed border-foreground/25 bg-surface-muted p-4" aria-label="Reported context">
        <h3 className="text-xs font-bold uppercase tracking-wider text-foreground/60">{s.title}</h3>
        <p className="mt-1 text-sm text-foreground/80">{s.body}</p>
      </aside>
    );
  }
  return (
    <section className="flex flex-col gap-2">
      {s.title && <h3 className="text-sm font-bold uppercase tracking-wide text-foreground/70">{s.title}</h3>}
      {s.kind === "text" && <p className="text-[15px] leading-relaxed">{s.body}</p>}
      {s.kind === "table" && <Table s={s} />}
      {s.kind === "lines" && <LineChart s={s} />}
      {s.kind === "bars" && <Bars s={s} />}
      {"note" in s && s.note && <p className="text-xs text-foreground/60">{s.note}</p>}
    </section>
  );
}

export default function ReportView({
  report,
}: { report: ReportCard }) {
  const [copied, setCopied] = useState(false);
  const u = report.usage;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl(report.request));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* clipboard blocked */ }
  };

  return (
    <article className="report-card flex flex-col gap-6 rounded-2xl border border-foreground/10 bg-surface p-5 shadow-card sm:p-8" aria-label={report.title}>
      <header className="flex flex-col gap-1">
        <span className="eyebrow">{EYEBROW[report.feature] ?? "Answer"}</span>
        <h2 className="text-2xl font-bold tracking-tight">{report.title}</h2>
        <p className="text-sm text-foreground/60">{report.subtitle}</p>
      </header>

      {report.sections.map((s, i) => <Section key={i} s={s} />)}

      <section className="rounded-xl bg-surface-muted p-4 text-xs leading-relaxed text-foreground/75">
        <h3 className="mb-1 text-xs font-bold uppercase tracking-wide">Notes</h3>
        <p><strong>Baseline:</strong> {report.method.baseline}. <strong>Index:</strong> {report.method.index}, {report.method.version}. <strong>Data:</strong> {report.method.source}.</p>
        <ul className="mt-1 list-disc pl-4">{report.notes.map((n) => <li key={n}>{n}</li>)}</ul>
      </section>

      <details className="rounded-xl border border-foreground/10 p-4 text-sm">
        <summary className="cursor-pointer font-semibold">How this was worked out</summary>
        <p className="mt-2 text-xs text-foreground/70">
          Every number comes from these calculations on the published index values. The AI only chose what to look up and wrote the sentences; each number in its text was checked against these results
          ({report.grounding.status === "verified" ? "all verified" : report.grounding.status === "repaired" ? "rewritten once to fix unverified numbers" : "some unverifiable sentences were removed"}).
        </p>
        <ol className="mt-3 flex flex-col gap-2">
          {report.trace.map((t, i) => (
            <li key={i} className="rounded-lg bg-surface-muted p-2.5 text-xs">
              <code className="font-mono font-bold">{t.name}</code>
              <code className="mt-1 block break-words font-mono text-[11px] text-foreground/70">{JSON.stringify(t.args)}</code>
              <span className={t.ok ? "text-foreground/80" : "text-rose-700"}>{t.summary}</span>
            </li>
          ))}
        </ol>
        <p className="mt-3 text-xs text-foreground/60">
          {u.provider === "none" ? "Fixed text: no writing model used. " : `Writing (${u.model}, your key): ${u.calls} call${u.calls === 1 ? "" : "s"}, about ${u.inputTokens.toLocaleString()} tokens in and ${u.outputTokens.toLocaleString()} out. `}
          {report.router && `Routing (${report.router.models.join(" + ")}, site key): ${report.router.calls} call${report.router.calls === 1 ? "" : "s"}, ${report.router.tokens.toLocaleString()} tokens, $${report.router.costUsd.toFixed(5)}.`}
        </p>
      </details>

      <div className="flex flex-wrap gap-2 print:hidden">
        <button type="button" onClick={copy} className="min-h-11 rounded-xl border border-foreground/20 px-4 text-sm font-semibold hover:border-accent">
          {copied ? "Link copied" : "Copy link"}
        </button>
        <button type="button" onClick={() => window.print()} className="min-h-11 rounded-xl border border-foreground/20 px-4 text-sm font-semibold hover:border-accent">
          Download as PDF
        </button>
        <span className="self-center text-xs text-foreground/50">The link holds the question, not your key. For PDF, choose &ldquo;Save as PDF&rdquo; in the print dialog.</span>
      </div>
    </article>
  );
}
