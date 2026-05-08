"""Render the two report figures from scraper/data/comparison/<quarter>_comparison.json.

Figure 1: stacked horizontal bar of SKU production-code mix by retailer.
Figure 2: listings cage-free central vs prior 50% CI dumbbell, by retailer.

Run from project root:
    python scripts/make_figures.py 2026-Q2
or simply:
    python scripts/make_figures.py     # defaults to current calendar quarter
"""

from __future__ import annotations

import json
import sys
from datetime import date
from pathlib import Path

import matplotlib.pyplot as plt
import matplotlib.patches as mpatches


# Colorblind-friendly palette (Okabe-Ito-derived). Greens for cage-free tiers
# (organic darkest -> barn lightest), reddish-orange for caged, neutral grey
# for unknown.
COLOR_ORGANIC    = "#117733"   # dark green
COLOR_FREE_RANGE = "#44AA99"   # teal
COLOR_BARN       = "#88CCEE"   # pale blue (still cage-free)
COLOR_CAGED      = "#CC6677"   # muted red
COLOR_UNKNOWN    = "#BBBBBB"   # neutral grey
COLOR_PRIOR_BAND = "#DDDDDD"
COLOR_INSIDE     = "#117733"   # green dot if listings central inside prior 50% CI
COLOR_OUTSIDE    = "#CC6677"   # red dot if outside
COLOR_REPORTED   = "#332288"   # navy for reported / prior central


def quarter_tag_default() -> str:
    d = date.today()
    return f"{d.year}-Q{(d.month - 1) // 3 + 1}"


def load(tag: str, root: Path) -> list[dict]:
    path = root / "scraper" / "data" / "comparison" / f"{tag}_comparison.json"
    return json.loads(path.read_text(encoding="utf-8"))


def fig1_sku_mix(rows: list[dict], out: Path, tag: str) -> None:
    """Stacked horizontal bar — SKU code mix per retailer (excludes Eroski Group rollup)."""
    rows = [r for r in rows if r["retailer"] != "Eroski Group" and (r.get("shell_egg_listings") or 0) > 0]
    rows = sorted(rows, key=lambda r: r["shell_egg_listings"], reverse=True)

    retailers = [r["retailer"] for r in rows]
    n = [r["shell_egg_listings"] for r in rows]

    # Each retailer's SKU mix as percentages of n.
    def pct(r, k):
        return 100.0 * r.get(k, 0) / r["shell_egg_listings"] if r["shell_egg_listings"] else 0.0

    organic    = [pct(r, "organic")    for r in rows]
    free_range = [pct(r, "free_range") for r in rows]
    barn       = [pct(r, "barn")       for r in rows]
    caged      = [pct(r, "caged_skus") for r in rows]
    unknown    = [pct(r, "unknown_skus") for r in rows]

    # Read the SKU code counts back from the source data so the function can use either
    # the comparison-row schema (cage_free_skus split) or the summary-row schema.
    # The comparison rows have organic/free_range/barn rolled up into cage_free_skus,
    # so we need to load the per-row breakdown from the summary file.
    pass  # handled below by reading summary

    # For organic/free_range/barn split we need the per-summary row; the comparison
    # row only has cage_free_skus. Load the summary file alongside.

    return retailers, n, organic, free_range, barn, caged, unknown


def fig1_sku_mix_v2(summary_rows: list[dict], out: Path, tag: str) -> None:
    """Stacked horizontal bar — SKU code mix per retailer.

    Uses the summary file (organic/free_range/barn split). Excludes Lidl
    (no shell-egg listings online) and the Eroski Group rollup.
    """
    rows = [r for r in summary_rows if r["retailer"] != "Eroski Group" and (r.get("shell_egg_listings") or 0) > 0]
    rows = sorted(rows, key=lambda r: r["shell_egg_listings"], reverse=True)

    retailers = [r["retailer"] for r in rows]
    n_list    = [r["shell_egg_listings"] for r in rows]

    def pct(r, k):
        n = r["shell_egg_listings"]
        return 100.0 * r.get(k, 0) / n if n else 0.0

    organic    = [pct(r, "organic")    for r in rows]
    free_range = [pct(r, "free_range") for r in rows]
    barn       = [pct(r, "barn")       for r in rows]
    caged      = [pct(r, "caged")      for r in rows]
    unknown    = [pct(r, "unknown")    for r in rows]

    fig, ax = plt.subplots(figsize=(9, 4.0), dpi=300)

    y = list(range(len(retailers)))
    left = [0.0] * len(retailers)

    def stack(values, color, label):
        nonlocal left
        ax.barh(y, values, left=left, color=color, label=label, edgecolor="white", linewidth=0.5)
        # draw the data label only when the segment is large enough to read
        for yi, xi, base in zip(y, values, left):
            if xi >= 6:
                ax.text(base + xi / 2, yi, f"{int(round(xi))}", ha="center", va="center",
                        fontsize=8, color="white" if color in (COLOR_ORGANIC, COLOR_FREE_RANGE, COLOR_CAGED) else "black")
        left = [a + b for a, b in zip(left, values)]

    stack(organic,    COLOR_ORGANIC,    "0 organic")
    stack(free_range, COLOR_FREE_RANGE, "1 free-range")
    stack(barn,       COLOR_BARN,       "2 barn")
    stack(caged,      COLOR_CAGED,      "3 caged")
    stack(unknown,    COLOR_UNKNOWN,    "unknown")

    ax.set_yticks(y)
    ax.set_yticklabels([f"{r}  (n={n})" for r, n in zip(retailers, n_list)])
    ax.invert_yaxis()
    ax.set_xlim(0, 100)
    ax.set_xlabel("Share of chicken shell-egg SKUs (%)")
    ax.set_title(f"Production-code mix by retailer  —  {tag} listings snapshot")
    ax.spines["top"].set_visible(False)
    ax.spines["right"].set_visible(False)
    ax.grid(axis="x", alpha=0.25, linestyle=":")
    ax.set_axisbelow(True)

    ax.legend(loc="lower center", bbox_to_anchor=(0.5, -0.27), ncol=5,
              frameon=False, fontsize=9, handlelength=1.2, handleheight=1.0)

    fig.tight_layout()
    fig.savefig(out, bbox_inches="tight", dpi=300)
    plt.close(fig)


def fig2_central_vs_prior(comparison_rows: list[dict], out: Path, tag: str) -> None:
    """Listings central (Bayesian-shrunk) vs prior 50% CI for each retailer.

    For each retailer with both listings and a prior:
      - draw the prior 50% CI as a horizontal grey band, with the prior central as a navy circle
      - draw the listings strict-95% CI as a black whisker
      - mark the listings Bayes(1,1) central (base case) as a coloured square (green if inside the prior 50% CI, red if outside)
      - mark the listings Bayes(1,2) informed-prior central as a black diamond
      - annotate the gap (central minus prior) in pp
    """
    rows = [r for r in comparison_rows if r.get("listings_central_pct") is not None and r.get("prior_estimate_pct") is not None]
    # Sort by retailer egg-volume rank for visual narrative (largest at top).
    order = ["Mercadona", "Carrefour", "Lidl", "Eroski", "Caprabo", "DIA", "Eroski Group"]
    rows = sorted(rows, key=lambda r: order.index(r["retailer"]) if r["retailer"] in order else 99)

    fig, ax = plt.subplots(figsize=(9, 4.5), dpi=300)
    retailers = [r["retailer"] for r in rows]
    y = list(range(len(retailers)))

    for yi, r in zip(y, rows):
        prior_lo, prior_hi = (int(s) for s in r["prior_estimate_50ci"].split("-"))
        prior_pct = r["prior_estimate_pct"]
        central = r["listings_central_pct"]
        informed = r.get("listings_central_informed_pct", central)
        strict_pct = r["listings_cf_strict_pct"]
        strict_ci_str = r.get("listings_cf_strict_95ci", "")
        if strict_ci_str:
            strict_lo, strict_hi = (int(s) for s in strict_ci_str.split("-"))
        else:
            strict_lo, strict_hi = strict_pct, strict_pct

        in_band = r["central_in_prior_50ci"]
        central_color = COLOR_INSIDE if in_band else COLOR_OUTSIDE

        # Prior 50% CI as a horizontal band
        ax.add_patch(mpatches.Rectangle((prior_lo, yi - 0.30), prior_hi - prior_lo, 0.60,
                                        facecolor=COLOR_PRIOR_BAND, edgecolor="none", zorder=1))
        # Prior central
        ax.scatter([prior_pct], [yi], marker="o", s=70, color=COLOR_REPORTED, zorder=4, label="_nolegend_")

        # Strict 95% CI as a whisker line
        ax.plot([strict_lo, strict_hi], [yi - 0.05, yi - 0.05], color="#444444", linewidth=1.2, zorder=2)
        # Strict point estimate (small triangle)
        ax.scatter([strict_pct], [yi - 0.05], marker="v", s=35, color="#444444", zorder=3)

        # Bayes(1,1) base case
        ax.scatter([central], [yi + 0.18], marker="s", s=80, color=central_color, edgecolor="white", linewidth=1.0, zorder=4)
        # Bayes(1,2) informed-prior alternative — only annotate if it differs visibly,
        # offset slightly upward so it doesn't sit on top of the Bayes(1,1) square
        if abs(informed - central) >= 1:
            ax.scatter([informed], [yi + 0.32], marker="D", s=45, color="black", zorder=4)

        # Gap annotation in a right-hand column at fixed x, aligned across rows
        gap = r["diff_central_minus_prior_pp"]
        if gap is not None:
            sign = "+" if gap > 0 else ("" if gap == 0 else "")
            ax.text(106, yi, f"{sign}{gap} pp", va="center", ha="left",
                    fontsize=9, color=central_color, fontweight="bold" if abs(gap) >= 10 else "normal")

    ax.set_yticks(y)
    ax.set_yticklabels(retailers)
    ax.invert_yaxis()
    ax.set_xlim(0, 105)
    ax.set_xlabel("Cage-free share (%)")
    ax.set_title(f"Listings cage-free central vs prior 50% CI  —  {tag}")
    ax.spines["top"].set_visible(False)
    ax.spines["right"].set_visible(False)
    ax.grid(axis="x", alpha=0.25, linestyle=":")
    ax.set_axisbelow(True)

    # Legend — explain marker semantics rather than colours per retailer.
    legend_items = [
        mpatches.Patch(facecolor=COLOR_PRIOR_BAND, label="Prior 50% CI (subjective band)"),
        plt.Line2D([0], [0], marker="o", color=COLOR_REPORTED, markersize=8, linestyle="None", label="Prior central (reported / blended)"),
        plt.Line2D([0], [0], marker="s", color=COLOR_INSIDE, markersize=8, linestyle="None", label="Listings Bayes(1,1) — inside 50% CI"),
        plt.Line2D([0], [0], marker="s", color=COLOR_OUTSIDE, markersize=8, linestyle="None", label="Listings Bayes(1,1) — outside 50% CI"),
        plt.Line2D([0], [0], marker="D", color="black", markersize=6, linestyle="None", label="Listings Bayes(1,2) informed prior"),
        plt.Line2D([0], [0], marker="v", color="#444444", markersize=6, linestyle="None", label="Listings strict (Wilson 95% CI shown)"),
    ]
    ax.legend(handles=legend_items, loc="lower center", bbox_to_anchor=(0.5, -0.32),
              ncol=2, frameon=False, fontsize=8)

    fig.tight_layout()
    fig.savefig(out, bbox_inches="tight", dpi=300)
    plt.close(fig)


def main() -> None:
    tag = sys.argv[1] if len(sys.argv) > 1 else quarter_tag_default()
    root = Path(__file__).resolve().parent.parent
    summary_path = root / "scraper" / "data" / "summary" / f"{tag}_summary.json"
    summary_rows = json.loads(summary_path.read_text(encoding="utf-8"))
    comparison_rows = load(tag, root)

    out_dir = root
    out1 = out_dir / f"fig1_listings_mix_{tag}.png"
    out2 = out_dir / f"fig2_listings_vs_prior_{tag}.png"

    fig1_sku_mix_v2(summary_rows, out1, tag)
    fig2_central_vs_prior(comparison_rows, out2, tag)

    print(f"Wrote {out1}")
    print(f"Wrote {out2}")


if __name__ == "__main__":
    main()
