"use client";

import { useEffect, useState } from "react";

const FLAG = "aci-visitor-counted";

// Counts each browser once (localStorage flag) and shows the running total.
// Renders nothing if the counter is unavailable so the footer is never affected.
export default function VisitorCounter() {
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    let counted = false;
    try {
      counted = localStorage.getItem(FLAG) === "1";
    } catch {}

    fetch("/api/visitors", { method: counted ? "GET" : "POST", cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (typeof data?.count !== "number") return;
        setCount(data.count);
        if (!counted) {
          try {
            localStorage.setItem(FLAG, "1");
          } catch {}
        }
      })
      .catch(() => {});
  }, []);

  if (count === null) return null;

  // At least four blocks; more appear as the total grows. Keyed from the right
  // so existing blocks keep their place (and do not re-roll) when a digit is added.
  const digits = String(count).padStart(4, "0").split("");

  return (
    <div className="flex flex-col lg:items-end gap-1.5">
      <span className="whitespace-nowrap text-[10px] font-bold uppercase tracking-widest text-foreground/45">
        Total visitors
      </span>
      <div role="img" aria-label={count.toLocaleString("en-IN")} className="flex gap-1">
        {digits.map((digit, i) => (
          <div key={digits.length - i} aria-hidden="true" className="odometer-digit">
            <div
              className="odometer-strip"
              style={{ "--d": digit, "--delay": `${i * 0.12}s` } as React.CSSProperties}
            >
              {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
                <span key={n}>{n}</span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
