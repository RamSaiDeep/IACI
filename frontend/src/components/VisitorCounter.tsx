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

  return (
    <span className="text-[11px] text-foreground/50">
      Visitors: {count.toLocaleString("en-IN")}
    </span>
  );
}
