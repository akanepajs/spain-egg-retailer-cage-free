// Compare scraped listing-level cage-free share against the reported / audited
// figures (EggTrack 2024, OBA, corporate disclosures). Writes a comparison CSV
// and prints a summary table.

import { readFile, writeFile, mkdir } from "node:fs/promises";

// Prior-round (April 2026 task) estimates with 50% confidence intervals.
// "pct" is the central estimate, "lo"/"hi" are the 50% CI bounds. These are
// volume-weighted reported / audited cage-free shares — not directly
// comparable to listing-share, but the baseline against which the listing
// scraper is meant to provide a transparency cross-check.
//
// Source: spain_egg_market_analysis.md (2026-Q2 prior task) — derived from
// EggTrack 2024, OBA April 2025 audit, retailer corporate disclosures, and
// (for Eroski) a 2018 ESM baseline blended with the Caprabo subsidiary share.
const REPORTED = {
  "Mercadona":  { pct: 65,  lo: 62, hi: 68,  source: "Mercadona corporate; EggTrack 2024 = At risk",            commitment: "100% by end-2025 (slipped from end-2022)" },
  "Carrefour":  { pct: 100, lo: 98, hi: 100, source: "OBA May 2025 audit; observatoriodebienestaranimal.org",     commitment: "100% fresh; ingredient eggs ~35%" },
  "Lidl":       { pct: 100, lo: 99, hi: 100, source: "EggTrack 2024 Leader; OBA May 2025 audit",                  commitment: "100% — first chain in Spain to sell only cage-free shell eggs" },
  "Eroski":     { pct: 43,  lo: 32, hi: 58,  source: "Prior estimate: 35% (2018 baseline, ESM) + Caprabo 100% subsidiary blend", commitment: "100% by end-2024 (missed)" },
  "Caprabo":    { pct: 100, lo: 95, hi: 100, source: "Eroski 2022 sustainability report (Caprabo subsidiary 100% cage-free); part of Eroski Group", commitment: "Cage-free transition completed (per parent group disclosure)" },
  "DIA":        { pct: 58,  lo: 52, hi: 63,  source: "DIA corporate (diacorporate.com); EggTrack 2024 = At risk", commitment: "100% by end-2025" },
};

function csvEscape(v) {
  if (v === null || v === undefined) return "";
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function toCSV(rows, columns) {
  return columns.join(",") + "\n" + rows.map(r => columns.map(c => csvEscape(r[c])).join(",")).join("\n") + "\n";
}

// Wilson score 95% confidence interval for a binomial proportion.
// Handles k=0 and k=n cleanly (no zero-width CI). z=1.96 for 95%.
function wilson95(k, n) {
  if (!n || n <= 0) return [null, null];
  const z = 1.96;
  const p = k / n;
  const denom = 1 + (z * z) / n;
  const centre = (p + (z * z) / (2 * n)) / denom;
  const margin = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / denom;
  return [Math.max(0, centre - margin), Math.min(1, centre + margin)];
}
const pct = x => x === null ? "" : Math.round(x * 100);

// Bayesian-shrunk listings central with parameterised Beta(alpha, beta) prior.
// Smooths the cage-free/caged ratio of *classified* SKUs, then allocates
// unknown SKUs proportionally to the smoothed posterior mean.
//
// Why Bayesian shrinkage: a naive proportional split breaks at the small-n
// edge cases where caged=0 (all unknowns flow to cage-free → 100% central)
// or cage-free=0 (all unknowns flow to caged → 0% central). Adding alpha
// virtual cage-free and beta virtual caged SKUs regularises the estimate.
//
// Two priors used in this analysis:
//   - Beta(1, 1)   — Laplace, uninformative; prior mean 0.5. Base case.
//   - Beta(1, 2)   — informed; prior mean 1/3 anchored to Spain's national
//                    production-side cage-free share (~33%, WATTPoultry 2023).
//                    Reflects "if you knew nothing about an unlabelled
//                    Spanish egg SKU, your prior is that it is more likely
//                    caged than cage-free." Same total weight (3) as
//                    Beta(1,1)+1 so prior strength is comparable.
//
// Edge cases handled:
//   - n=0 → null central
//   - cf+caged=0 (all unknown) → posterior alpha/(alpha+beta), allocated to all
//   - unknown=0 → central = cf / n (no shrinkage needed)
function bayesianCentralBeta(cf, caged, unknown, alpha, beta) {
  const n = cf + caged + unknown;
  if (n === 0) return null;
  const p_cf = (cf + alpha) / (cf + caged + alpha + beta); // posterior mean
  const new_cf = cf + unknown * p_cf;
  return new_cf / n;
}
const bayesianCentral         = (cf, caged, unk) => bayesianCentralBeta(cf, caged, unk, 1, 1);
const bayesianCentralInformed = (cf, caged, unk) => bayesianCentralBeta(cf, caged, unk, 1, 2);

// Retailer-group rollup: which retailers belong to a single corporate group.
const GROUPS = {
  "Eroski Group": ["Eroski", "Caprabo"],
};

function buildGroupRow(summary, groupName, members) {
  const parts = summary.filter(b => members.includes(b.retailer));
  if (parts.length < 2) return null;
  const sum = (k) => parts.reduce((a, b) => a + (b[k] || 0), 0);
  const n = sum("shell_egg_listings");
  const cf = sum("cage_free_listings");
  const unknown = sum("unknown");
  const classified = n - unknown;
  return {
    retailer: groupName,
    total_listings: sum("total_listings"),
    shell_egg_listings: n,
    organic: sum("organic"),
    free_range: sum("free_range"),
    barn: sum("barn"),
    caged: sum("caged"),
    unknown,
    cage_free_listings: cf,
    cage_free_share_strict_pct: n ? Math.round(100 * cf / n) : null,
    cage_free_share_resolved_pct: classified ? Math.round(100 * cf / classified) : null,
    note: `Combined: ${members.join(" + ")}`,
  };
}

async function main() {
  const tag = process.argv[2] || (() => { const d = new Date(); return `${d.getFullYear()}-Q${Math.floor(d.getMonth()/3)+1}`; })();
  let summary = JSON.parse(await readFile(`data/summary/${tag}_summary.json`, "utf8"));

  // Append group rollups (e.g. Eroski + Caprabo → "Eroski Group").
  for (const [group, members] of Object.entries(GROUPS)) {
    const row = buildGroupRow(summary, group, members);
    if (row) summary = [...summary, row];
  }

  const rows = summary.map(b => {
    const ref = REPORTED[b.retailer] || {};
    const n = b.shell_egg_listings || 0;
    const cf = b.cage_free_listings || 0;
    const strict = b.cage_free_share_strict_pct;
    const resolved = b.cage_free_share_resolved_pct;
    const reportedPct = ref.pct ?? null;
    const gap = (resolved !== null && reportedPct !== null) ? resolved - reportedPct : null;

    // Wilson 95% CI on the strict metric (cage-free / total shell-egg SKUs).
    const [strictLo, strictHi] = wilson95(cf, n);
    // Resolved metric: denominator excludes unknowns.
    const classified = n - (b.unknown || 0);
    const [resolvedLo, resolvedHi] = wilson95(cf, classified);

    // "Listings central estimate" — base case is Beta(1,1) Laplace-shrunk:
    // unknowns are allocated using a regularised cage-free probability
    // (cf+1)/(cf+caged+2), which avoids the brittle 0/100 edge cases of
    // naive proportional allocation when caged=0 or cf=0. As a robustness
    // check we also report the unsmoothed proportional central (= resolved).
    const cfCount = b.cage_free_listings || 0;
    const cagedCount = b.caged || 0;
    const unkCount = b.unknown || 0;
    const central_bayes = bayesianCentral(cfCount, cagedCount, unkCount);
    const central_bayes_pct = central_bayes === null ? null : Math.round(central_bayes * 100);
    const central_informed = bayesianCentralInformed(cfCount, cagedCount, unkCount);
    const central_informed_pct = central_informed === null ? null : Math.round(central_informed * 100);
    const central_proportional_pct = resolved; // mathematically identical to resolved

    // Apples-to-apples consistency test: does the listings central estimate
    // fall within the prior 50% CI? (Prior CIs are subjective 50% bands per
    // spain_egg_market_analysis.md methodology — even odds the truth is in
    // that range. The listing central is treated as a point estimate here,
    // not its own band.)
    const inPrior50 = (central_bayes_pct !== null && ref.lo !== undefined)
      ? (central_bayes_pct >= ref.lo && central_bayes_pct <= ref.hi)
      : null;

    const gapBayes = (central_bayes_pct !== null && reportedPct !== null) ? central_bayes_pct - reportedPct : null;

    return {
      retailer: b.retailer,
      shell_egg_listings: n,
      cage_free_skus: (b.organic ?? 0) + (b.free_range ?? 0) + (b.barn ?? 0),
      caged_skus: b.caged ?? 0,
      unknown_skus: b.unknown ?? 0,
      listings_central_pct: central_bayes_pct,            // BASE CASE — Beta(1,1) Laplace-shrunk
      listings_central_informed_pct: central_informed_pct, // SENSITIVITY — Beta(1,2), prior mean 1/3
      listings_central_proportional_pct: central_proportional_pct, // robustness check (= resolved)
      listings_cf_strict_pct: strict,
      listings_cf_strict_95ci: (strictLo !== null) ? `${pct(strictLo)}-${pct(strictHi)}` : "",
      listings_cf_resolved_95ci: (resolvedLo !== null) ? `${pct(resolvedLo)}-${pct(resolvedHi)}` : "",
      prior_estimate_pct: reportedPct,
      prior_estimate_50ci: (ref.lo !== undefined && ref.hi !== undefined) ? `${ref.lo}-${ref.hi}` : "",
      diff_central_minus_prior_pp: gapBayes,
      central_in_prior_50ci: inPrior50,
      prior_in_listings_strict_95ci: (strictLo !== null && reportedPct !== null) ? (reportedPct/100 >= strictLo && reportedPct/100 <= strictHi) : null,
      prior_source: ref.source || "",
      commitment: ref.commitment || "",
      scrape_note: b.note || "",
    };
  });

  await mkdir("data/comparison", { recursive: true });
  const cols = ["retailer", "shell_egg_listings", "cage_free_skus", "caged_skus", "unknown_skus",
    "listings_central_pct", "listings_central_informed_pct", "listings_central_proportional_pct",
    "listings_cf_strict_pct", "listings_cf_strict_95ci", "listings_cf_resolved_95ci",
    "prior_estimate_pct", "prior_estimate_50ci",
    "diff_central_minus_prior_pp", "central_in_prior_50ci", "prior_in_listings_strict_95ci",
    "prior_source", "commitment", "scrape_note"];
  await writeFile(`data/comparison/${tag}_comparison.csv`, toCSV(rows, cols), "utf8");
  await writeFile(`data/comparison/${tag}_comparison.json`, JSON.stringify(rows, null, 2), "utf8");

  console.log(`Comparison ${tag} — listings central [Bayesian Beta(1,1)-shrunk] vs prior 50% CI`);
  console.table(rows.map(r => ({
    retailer: r.retailer,
    n: r.shell_egg_listings,
    "cf/?/cage": `${r.cage_free_skus}/${r.unknown_skus}/${r.caged_skus}`,
    central_bayes: r.listings_central_pct,
    central_prop: r.listings_central_proportional_pct,
    strict: r.listings_cf_strict_pct,
    strict_95ci: r.listings_cf_strict_95ci,
    prior: r.prior_estimate_pct,
    prior_50ci: r.prior_estimate_50ci,
    diff_pp: r.diff_central_minus_prior_pp,
    in_prior_50ci: r.central_in_prior_50ci,
  })));

  const decided = rows.filter(r => r.central_in_prior_50ci !== null);
  const inBand = decided.filter(r => r.central_in_prior_50ci === true);
  console.log(`\nListings central [Bayesian] inside prior 50% CI: ${inBand.length}/${decided.length} retailers`);
  console.log(`  inside: ${inBand.map(r => r.retailer).join(", ") || "(none)"}`);
  const outside = decided.filter(r => r.central_in_prior_50ci === false);
  console.log(`  outside: ${outside.map(r => `${r.retailer} (central ${r.listings_central_pct} vs prior ${r.prior_estimate_pct})`).join(", ") || "(none)"}`);
}

await main();
