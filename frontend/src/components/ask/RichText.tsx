import { Fragment, type ReactNode } from "react";

/**
 * Shows model-written text with light formatting: **bold**, *italic*, "- " bullet lines and line breaks.
 * Any HTML the model sends is never rendered as HTML: <br> becomes a line break, other tags are dropped.
 */
export default function RichText({ text, className }: { text: string; className?: string }) {
  const clean = text.replace(/<br\s*\/?>/gi, "\n").replace(/<\/?[a-z][^>]*>/gi, "");
  const blocks: ReactNode[] = [];
  let bullets: string[] = [];
  const flush = () => {
    if (bullets.length) {
      blocks.push(<ul key={blocks.length} className="list-disc space-y-1 pl-5">{bullets.map((b, i) => <li key={i}>{inline(b)}</li>)}</ul>);
      bullets = [];
    }
  };
  for (const raw of clean.split("\n")) {
    const line = raw.trim();
    const bullet = line.match(/^(?:[-•]|\*(?!\*))\s+(.*)$/);
    if (bullet) { bullets.push(bullet[1]); continue; }
    flush();
    if (line) blocks.push(<p key={blocks.length}>{inline(line)}</p>);
  }
  flush();
  return <div className={`flex flex-col gap-2 ${className ?? ""}`}>{blocks}</div>;
}

/** **bold** and *italic* inside one line; unmatched asterisks are shown as they are. */
function inline(s: string): ReactNode[] {
  return s.split(/(\*\*[^*]+\*\*|\*[^*\s][^*]*\*)/g).filter(Boolean).map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4) return <strong key={i}>{part.slice(2, -2)}</strong>;
    if (part.startsWith("*") && part.endsWith("*") && part.length > 2) return <em key={i}>{part.slice(1, -1)}</em>;
    return <Fragment key={i}>{part}</Fragment>;
  });
}
