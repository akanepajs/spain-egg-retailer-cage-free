"""Render the two report figures from scraper/data/comparison/<quarter>_comparison.json.

Figure 1: stacked horizontal bar of SKU production-code mix by retailer.
Figure 2: box-and-whisker of listings cage-free estimates vs prior 50% CI.

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
COLOR_PRIOR      = "#332288"   # navy for prior central + CI
COLOR_BOX_IN     = "#117733"   # green box if listings central inside prior 50% CI
COLOR_BOX_OUT    = "#CC6677"   # red box if outside
COLOR_MEDIAN     = "#DDAA33"   # amber for median line inside box


def quarter_tag_default() -> str:
    d = date.today()
    return f"{d.year}-Q{(d.month - 1) // 3 + 1}"


def load(tag: str, root: Path) -> list[dict]:
    path = root / "scraper" / "data" / "comparison" / f"{tag}_comparison.json"
    return json.loads(path.read_text(encoding="utf-8"))


def fig1_sku_mix_v2(summary_rows: list[dict], out: Path, tag: str) -> None:
    """Stacked horizontal bar -- SKU code mix per retailer.

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
    ax.set_title(f"Production-code mix by retailer  --  {tag} listings snapshot")
    ax.spines["top"].set_visible(False)
    ax.spines["right"].set_visible(False)
    ax.grid(axis="x", alpha=0.25, linestyle=":")
    ax.set_axisbelow(True)

    ax.legend(loc="lower center", bbox_to_anchor=(0.5, -0.27), ncol=5,
              frameon=False, fontsize=9, handlelength=1.2, handleheight=1.0)

    fig.tight_layout()
    fig.savefig(out, bbox_inches="tight", dpi=300)
    plt.close(fig)


def fig2_box_whisker(comparison_rows: list[dict], out: Path, tag: str) -> None:
    """Box-and-whisker of listings cage-free estimates vs prior 50% CI.

    For each retailer with both listings and a prior:
      - Box spans from strict estimate (q1) to Bayesian(1,1) base case (q3)
      - Median line inside the box = Bayesian(1,2) informed prior
      - Whiskers = Wilson 95% CI bounds
      - Prior shown as a separate blue circle with 50% CI error bars
    """
    rows = [r for r in comparison_rows
            if r.get("listings_central_pct") is not None
            and r.get("prior_estimate_pct") is not None]
    order = ["Mercadona", "Carrefour", "Lidl", "Eroski", "Caprabo", "DIA", "Eroski Group"]
    rows = sorted(rows, key=lambda r: order.index(r["retailer"]) if r["retailer"] in order else 99)

    fig, ax = plt.subplots(figsize=(9, 4.5), dpi=300)
    retailers = [r["retailer"] for r in rows]
    y_positions = list(range(len(retailers)))

    for yi, r in zip(y_positions, rows):
        prior_pct = r["prior_estimate_pct"]
        prior_lo, prior_hi = (int(s) for s in r["prior_estimate_50ci"].split("-"))
        strict = r["listings_cf_strict_pct"]
        central = r["listings_central_pct"]       # Bayes(1,1) -- box upper edge
        informed = r.get("listings_central_informed_pct", central)  # Bayes(1,2) -- median line
        in_band = r["central_in_prior_50ci"]

        strict_ci_str = r.get("listings_cf_strict_95ci", "")
        if strict_ci_str:
            wilson_lo, wilson_hi = (int(s) for s in strict_ci_str.split("-"))
        else:
            wilson_lo, wilson_hi = strict, strict

        # Extend whiskers to cover both Wilson CI and box edges
        whisker_lo = min(wilson_lo, strict)
        whisker_hi = max(wilson_hi, central)

        box_color = COLOR_BOX_IN if in_band else COLOR_BOX_OUT

        # Draw box-and-whisker using matplotlib bxp (pre-computed stats)
        box_stats = [{
            "whislo": whisker_lo,
            "q1": strict,
            "med": informed,
            "q3": central,
            "whishi": whisker_hi,
            "fliers": [],
        }]
        bp = ax.bxp(box_stats, positions=[yi - 0.12], vert=False, widths=0.38,
                     patch_artist=True, showfliers=False,
                     boxprops=dict(facecolor=box_color, alpha=0.35, edgecolor=box_color, linewidth=1.5),
                     medianprops=dict(color=COLOR_MEDIAN, linewidth=2.0),
                     whiskerprops=dict(color="#555555", linewidth=1.0),
                     capprops=dict(color="#555555", linewidth=1.0))

        # Prior: blue circle with 50% CI error bars, slightly below the box
        ax.errorbar(prior_pct, yi + 0.22, xerr=[[prior_pct - prior_lo], [prior_hi - prior_pct]],
                     fmt="o", color=COLOR_PRIOR, markersize=7, capsize=4, capthick=1.2,
                     elinewidth=1.2, zorder=5)

        # Gap annotation
        gap = r["diff_central_minus_prior_pp"]
        if gap is not None:
            sign = "+" if gap > 0 else ""
            ax.text(108, yi, f"{sign}{gap} pp", va="center", ha="left",
                    fontsize=9, color=box_color, fontweight="bold" if abs(gap) >= 10 else "normal")

    ax.set_yticks(y_positions)
    ax.set_yticklabels(retailers)
    ax.invert_yaxis()
    ax.set_xlim(0, 107)
    ax.set_xlabel("Cage-free share (%)")
    ax.set_title(f"Listings cage-free estimates vs prior  --  {tag}")
    ax.spines["top"].set_visible(False)
    ax.spines["right"].set_visible(False)
    ax.grid(axis="x", alpha=0.25, linestyle=":")
    ax.set_axisbelow(True)

    # Legend
    legend_items = [
        mpatches.Patch(facecolor=COLOR_BOX_IN, alpha=0.35, edgecolor=COLOR_BOX_IN,
                       label="Listings range (strict to Bayes base) -- consistent"),
        mpatches.Patch(facecolor=COLOR_BOX_OUT, alpha=0.35, edgecolor=COLOR_BOX_OUT,
                       label="Listings range -- inconsistent with prior"),
        plt.Line2D([0], [0], color=COLOR_MEDIAN, linewidth=2, label="Bayes(1,2) informed estimate"),
        plt.Line2D([0], [0], color="#555555", linewidth=1.0,
                   label="Wilson 95% CI whiskers"),
        plt.Line2D([0], [0], marker="o", color=COLOR_PRIOR, markersize=7, linestyle="None",
                   label="Prior central (50% CI error bars)"),
    ]
    ax.legend(handles=legend_items, loc="lower center", bbox_to_anchor=(0.5, -0.35),
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
    fig2_box_whisker(comparison_rows, out2, tag)

    print(f"Wrote {out1}")
    print(f"Wrote {out2}")


if __name__ == "__main__":
    main()
