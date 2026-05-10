"""Render the two report figures from scraper/data/comparison/<quarter>_comparison.json.

Figure 1: stacked horizontal bar of SKU production-code mix by retailer.
Figure 2: box-whisker chart of CF (0%), CF (33%) posteriors vs prior.

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
from scipy.stats import beta as beta_dist
from scipy.optimize import minimize_scalar


# Colorblind-friendly palette (Okabe-Ito-derived). Greens for cage-free tiers
# (organic darkest -> barn lightest), reddish-orange for caged, neutral grey
# for unknown.
COLOR_ORGANIC    = "#117733"   # dark green
COLOR_FREE_RANGE = "#44AA99"   # teal
COLOR_BARN       = "#88CCEE"   # pale blue (still cage-free)
COLOR_CAGED      = "#CC6677"   # muted red
COLOR_UNKNOWN    = "#BBBBBB"   # neutral grey
COLOR_PRIOR      = "#332288"   # navy for prior central + CI
COLOR_BAYES0     = "#DDAA33"   # amber for CF (0%) boxes


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
    order = ["Mercadona", "Carrefour", "Eroski", "Caprabo", "DIA"]
    rows = sorted(rows, key=lambda r: order.index(r["retailer"]) if r["retailer"] in order else 99)

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


def fit_beta_to_prior(central_pct: float, lo_pct: float, hi_pct: float):
    """Fit Beta(a, b) to a prior defined by central + 50% CI.

    Constrains mean = central_pct/100, then optimizes shape parameter `a`
    so that the Beta IQR (Q25-Q75) matches the stated 50% CI (lo-hi).
    Returns (a, b) or None if fitting fails.
    """
    target_mean = central_pct / 100.0
    target_q25 = lo_pct / 100.0
    target_q75 = hi_pct / 100.0

    # Guard: mean at 0 or 1 breaks the Beta parameterization.
    if target_mean <= 0.001 or target_mean >= 0.999:
        return None

    def objective(log_a):
        a = max(0.01, float(2 ** log_a))
        b = a * (1.0 - target_mean) / target_mean
        if b <= 0.01:
            return 1e6
        q25 = beta_dist.ppf(0.25, a, b)
        q75 = beta_dist.ppf(0.75, a, b)
        return (q25 - target_q25) ** 2 + (q75 - target_q75) ** 2

    result = minimize_scalar(objective, bounds=(-3, 12), method="bounded")
    a = max(0.01, float(2 ** result.x))
    b = a * (1.0 - target_mean) / target_mean
    if b <= 0.01:
        return None
    return a, b


def fig2_combined(comparison_rows: list[dict], out: Path, tag: str) -> None:
    """Box-whisker chart: prior, CF (0%), CF (33%).

    Per retailer, three horizontal box-whiskers:
      - Blue box: prior (Beta fitted to central + 50% CI), IQR + 95% CI
      - Amber box: CF (0%) posterior Beta(cf+1, n-cf+1), IQR + 95% CI
      - Green box: CF (33%) posterior for total CF share, IQR + 95% CI
      - Gap annotation (CF (33%) minus prior) on the right margin
    """
    rows = [r for r in comparison_rows
            if (r.get("shell_egg_listings") or 0) > 0
            and r.get("prior_estimate_pct") is not None
            and r["retailer"] != "Eroski Group"]
    order = ["Mercadona", "Carrefour", "Eroski", "Caprabo", "DIA"]
    rows = sorted(rows, key=lambda r: order.index(r["retailer"]) if r["retailer"] in order else 99)

    prior_bxp: list[dict] = []
    bayes0_bxp: list[dict] = []
    bayes33_bxp: list[dict] = []
    prior_fit_failed: list[bool] = []

    for r in rows:
        n = r["shell_egg_listings"]
        cf = r["cage_free_skus"]
        caged = r["caged_skus"]
        unknown = r["unknown_skus"]

        # --- Prior box-whisker (fitted Beta) ---
        prior_pct = r["prior_estimate_pct"]
        prior_lo, prior_hi = (int(s) for s in r["prior_estimate_50ci"].split("-"))
        fit = fit_beta_to_prior(prior_pct, prior_lo, prior_hi)
        if fit is not None:
            a_p, b_p = fit
            prior_bxp.append({
                "med": beta_dist.ppf(0.50, a_p, b_p) * 100,
                "q1": beta_dist.ppf(0.25, a_p, b_p) * 100,
                "q3": beta_dist.ppf(0.75, a_p, b_p) * 100,
                "whislo": max(0, beta_dist.ppf(0.025, a_p, b_p) * 100),
                "whishi": min(100, beta_dist.ppf(0.975, a_p, b_p) * 100),
                "fliers": [], "label": "",
            })
            prior_fit_failed.append(False)
        else:
            # Fallback: degenerate box at central with 50% CI as IQR
            prior_bxp.append({
                "med": prior_pct, "q1": prior_lo, "q3": prior_hi,
                "whislo": max(0, prior_lo - (prior_hi - prior_lo)),
                "whishi": min(100, prior_hi + (prior_hi - prior_lo)),
                "fliers": [], "label": "",
            })
            prior_fit_failed.append(True)

        # --- CF (0%): unknowns treated as caged ---
        a_s, b_s = cf + 1, n - cf + 1
        bayes0_bxp.append({
            "med": beta_dist.ppf(0.50, a_s, b_s) * 100,
            "q1": beta_dist.ppf(0.25, a_s, b_s) * 100,
            "q3": beta_dist.ppf(0.75, a_s, b_s) * 100,
            "whislo": beta_dist.ppf(0.025, a_s, b_s) * 100,
            "whishi": beta_dist.ppf(0.975, a_s, b_s) * 100,
            "fliers": [], "label": "",
        })

        # --- CF (33%): binomial posterior with effective cf = cf + unknown/3 ---
        cf_33 = cf + unknown / 3
        a_33, b_33 = cf_33 + 1, n - cf_33 + 1
        bayes33_bxp.append({
            "med": beta_dist.ppf(0.50, a_33, b_33) * 100,
            "q1": beta_dist.ppf(0.25, a_33, b_33) * 100,
            "q3": beta_dist.ppf(0.75, a_33, b_33) * 100,
            "whislo": beta_dist.ppf(0.025, a_33, b_33) * 100,
            "whishi": beta_dist.ppf(0.975, a_33, b_33) * 100,
            "fliers": [], "label": "",
        })

    n_ret = len(rows)
    fig, ax = plt.subplots(figsize=(10, 5.0), dpi=300)

    # Three rows per retailer: prior (top), Bayes 0% (middle), Bayes 33% (bottom)
    off = 0.28
    bw = 0.15
    prior_pos   = [i - off for i in range(n_ret)]
    bayes0_pos  = [i       for i in range(n_ret)]
    bayes33_pos = [i + off for i in range(n_ret)]

    ax.bxp(prior_bxp, positions=prior_pos, vert=False, widths=bw,
           patch_artist=True,
           boxprops=dict(facecolor=COLOR_PRIOR, alpha=0.35, edgecolor=COLOR_PRIOR, linewidth=1.0),
           medianprops=dict(color="#333333", linewidth=1.3),
           whiskerprops=dict(color=COLOR_PRIOR, linewidth=1.0),
           capprops=dict(color=COLOR_PRIOR, linewidth=1.0),
           flierprops=dict(marker=""))

    ax.bxp(bayes0_bxp, positions=bayes0_pos, vert=False, widths=bw,
           patch_artist=True,
           boxprops=dict(facecolor=COLOR_BAYES0, alpha=0.40, edgecolor=COLOR_BAYES0, linewidth=1.0),
           medianprops=dict(color="#333333", linewidth=1.3),
           whiskerprops=dict(color=COLOR_BAYES0, linewidth=1.0),
           capprops=dict(color=COLOR_BAYES0, linewidth=1.0),
           flierprops=dict(marker=""))

    ax.bxp(bayes33_bxp, positions=bayes33_pos, vert=False, widths=bw,
           patch_artist=True,
           boxprops=dict(facecolor=COLOR_ORGANIC, alpha=0.40, edgecolor=COLOR_ORGANIC, linewidth=1.0),
           medianprops=dict(color="#333333", linewidth=1.3),
           whiskerprops=dict(color=COLOR_ORGANIC, linewidth=1.0),
           capprops=dict(color=COLOR_ORGANIC, linewidth=1.0),
           flierprops=dict(marker=""))

    ax.set_yticks(range(n_ret))
    ax.set_yticklabels([f"{r['retailer']} (n={r['shell_egg_listings']})" for r in rows])
    ax.invert_yaxis()
    ax.set_xlim(0, 105)
    ax.set_xlabel("Cage-free share (%)")
    ax.set_title(f"Listings estimates vs prior  --  {tag}")
    ax.spines["top"].set_visible(False)
    ax.spines["right"].set_visible(False)
    ax.grid(axis="x", alpha=0.25, linestyle=":")
    ax.set_axisbelow(True)

    legend_items = [
        mpatches.Patch(facecolor=COLOR_PRIOR, alpha=0.35, edgecolor=COLOR_PRIOR,
                       label="Prior (fitted Beta, IQR + 95% CI)"),
        mpatches.Patch(facecolor=COLOR_BAYES0, alpha=0.40, edgecolor=COLOR_BAYES0,
                       label="CF (0%) (IQR + 95% CI)"),
        mpatches.Patch(facecolor=COLOR_ORGANIC, alpha=0.40, edgecolor=COLOR_ORGANIC,
                       label="CF (33%) (IQR + 95% CI)"),
    ]
    ax.legend(handles=legend_items, loc="lower center", bbox_to_anchor=(0.45, -0.25),
              ncol=3, frameon=False, fontsize=8)

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
    fig2_combined(comparison_rows, out2, tag)

    print(f"Wrote {out1}")
    print(f"Wrote {out2}")


if __name__ == "__main__":
    main()
