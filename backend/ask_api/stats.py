"""Small deterministic statistics. No model ever computes these; it only reads the results."""

import math


def mean(values) -> float | None:
    v = [x for x in values if x is not None and not math.isnan(x)]
    return sum(v) / len(v) if v else None


def _normal_cdf(z: float) -> float:
    return 0.5 * (1 + math.erf(z / math.sqrt(2)))


def sen_mann_kendall(points: list[tuple[int, float | None]], alpha: float = 0.05) -> dict:
    """Sen's slope + two-sided Mann-Kendall (normal approximation, tie-corrected) on (year, value) pairs."""
    pts = sorted((x, y) for x, y in points if y is not None)
    n = len(pts)
    if n < 8:
        return {"n": n, "slope_per_decade": None, "p": None, "direction": "insufficient data"}
    slopes, s = [], 0
    for i in range(n - 1):
        for j in range(i + 1, n):
            dx, dy = pts[j][0] - pts[i][0], pts[j][1] - pts[i][1]
            if dx:
                slopes.append(dy / dx)
            s += (dy > 0) - (dy < 0)
    slopes.sort()
    m = len(slopes) // 2
    slope = slopes[m] if len(slopes) % 2 else (slopes[m - 1] + slopes[m]) / 2
    counts: dict[float, int] = {}
    for _, y in pts:
        counts[y] = counts.get(y, 0) + 1
    ties = sum(t * (t - 1) * (2 * t + 5) for t in counts.values() if t > 1)
    var = (n * (n - 1) * (2 * n + 5) - ties) / 18
    z = (s - 1) / math.sqrt(var) if s > 0 else (s + 1) / math.sqrt(var) if s < 0 else 0.0
    p = 2 * (1 - _normal_cdf(abs(z)))
    direction = ("increasing" if slope > 0 else "decreasing") if p < alpha else "no significant trend"
    return {"n": n, "slope_per_decade": slope * 10, "p": p, "direction": direction}


def simple_trend(points: list[tuple[int, float | None]], little: float = 0.1) -> dict:
    """Plain straight-line trend for the agent tools (no significance test, by design).

    slope_per_decade: least-squares slope x 10. early/recent: mean of the first and last 10 years.
    direction: "rising" / "falling", or "little change" when |slope| < `little` z-score per decade."""
    pts = sorted((x, y) for x, y in points if y is not None)
    n = len(pts)
    if n < 8:
        return {"n": n, "slope_per_decade": None, "direction": "not enough years (need 8)",
                "early_mean": None, "recent_mean": None, "early_years": None, "recent_years": None}
    mx = sum(x for x, _ in pts) / n
    my = sum(y for _, y in pts) / n
    slope = sum((x - mx) * (y - my) for x, y in pts) / sum((x - mx) ** 2 for x, _ in pts)
    k = min(10, n // 2)
    early, recent = pts[:k], pts[-k:]
    direction = "little change" if abs(slope * 10) < little else "rising" if slope > 0 else "falling"
    return {"n": n, "slope_per_decade": slope * 10, "direction": direction,
            "early_mean": mean(y for _, y in early), "recent_mean": mean(y for _, y in recent),
            "early_years": f"{early[0][0]}–{early[-1][0]}", "recent_years": f"{recent[0][0]}–{recent[-1][0]}"}


def ordinal(n: int) -> str:
    return f"{n}{'th' if 10 <= n % 100 <= 20 else {1: 'st', 2: 'nd', 3: 'rd'}.get(n % 10, 'th')}"


def standing(rank: int, total: int, unit: str = "years") -> str:
    """A rank in plain words, for people new to the index: 1 of 35 -> "Highest of 35 years",
    2 of 35 -> "2nd highest of 35 years", 35 of 35 -> "Lowest of 35 years", 34 of 35 -> "2nd lowest of 35 years"."""
    if rank == 1:
        return f"Highest of {total} {unit}"
    from_bottom = total - rank + 1
    if from_bottom == 1:
        return f"Lowest of {total} {unit}"
    if from_bottom < rank:
        return f"{ordinal(from_bottom)} lowest of {total} {unit}"
    return f"{ordinal(rank)} highest of {total} {unit}"


def rank_highest(value: float, all_values) -> int:
    """1 = highest; ties share the better rank."""
    return sum(1 for v in all_values if v > value) + 1


def rnd(v: float | None, d: int = 2) -> float | None:
    return None if v is None else round(v, d)


def fmt(v: float | None) -> str:
    return "—" if v is None else f"{v:+.2f}"


def severity(v: float | None) -> str:
    if v is None:
        return "No data"
    for top, label in ((-1, "Below normal"), (0, "Near normal"), (1, "Moderate"), (2, "Elevated"), (3.5, "Severe")):
        if v <= top:
            return label
    return "Extreme"
