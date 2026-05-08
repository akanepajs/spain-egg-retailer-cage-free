// Quarterly scrape runner. Calls each retailer scraper, classifies each
// product by EU production code, writes one CSV of raw listings and one CSV
// of per-retailer summary. Quarter tag is derived from today's date or
// passed as an argument.

import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { classify, isShellEgg, codeLabel, isCageFree } from "./lib/classify.mjs";
import { scrape as scrapeCarrefour } from "./lib/retailers/carrefour.mjs";
import { scrape as scrapeMercadona } from "./lib/retailers/mercadona.mjs";
import { scrape as scrapeEroski }    from "./lib/retailers/eroski.mjs";
import { scrape as scrapeCaprabo }   from "./lib/retailers/caprabo.mjs";
import { scrape as scrapeLidl }      from "./lib/retailers/lidl.mjs";
import { scrape as scrapeDia }       from "./lib/retailers/dia.mjs";

function quarterTag(d = new Date()) {
  const y = d.getFullYear();
  const q = Math.floor(d.getMonth() / 3) + 1;
  return `${y}-Q${q}`;
}

function csvEscape(v) {
  if (v === null || v === undefined) return "";
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function toCSV(rows, columns) {
  const head = columns.join(",");
  const body = rows.map(r => columns.map(c => csvEscape(r[c])).join(",")).join("\n");
  return head + "\n" + body + "\n";
}

async function main() {
  const tag = process.argv[2] || quarterTag();
  console.log(`Running scrape for ${tag}`);

  const runners = [
    ["Carrefour", () => scrapeCarrefour({ quarterTag: tag })],
    ["Mercadona", () => scrapeMercadona()],
    ["Lidl",      () => scrapeLidl()],
    ["Eroski",    () => scrapeEroski()],
    ["Caprabo",   () => scrapeCaprabo()],
    ["DIA",       () => scrapeDia({ quarterTag: tag })],
  ];

  const all = [];
  for (const [label, fn] of runners) {
    try {
      const rows = await fn();
      console.log(`  ${label}: ${rows.length} rows`);
      all.push(...rows);
    } catch (e) {
      console.log(`  ${label}: FAILED — ${e.message}`);
      all.push({ retailer: label, error: e.message });
    }
  }

  // Classify each row.
  for (const r of all) {
    if (r.error || r.source === "external_only") {
      r.eu_code = null;
      r.production_label = "n/a";
      r.is_shell_egg = null;
      r.cage_free = null;
      r.classify_source = "n/a";
      continue;
    }
    const c = classify(r);
    r.eu_code = c.code;
    r.classify_source = c.source;
    r.production_label = codeLabel(c.code);
    r.is_shell_egg = isShellEgg(r);
    r.cage_free = c.code === null ? null : isCageFree(c.code);
  }

  await mkdir("data/raw", { recursive: true });
  await mkdir("data/summary", { recursive: true });

  const cols = ["retailer", "source", "name", "price_text", "unit_price", "tipo_produccion",
    "eu_code", "production_label", "classify_source", "is_shell_egg", "cage_free", "note", "error"];
  await writeFile(`data/raw/${tag}_listings.csv`, toCSV(all, cols), "utf8");
  await writeFile(`data/raw/${tag}_listings.json`, JSON.stringify(all, null, 2), "utf8");

  // Summary by retailer, restricted to chicken shell eggs (excludes liquid/quail).
  // Three top-line categories: cage-free (codes 0/1/2), caged (3), unknown.
  // Two share metrics: strict (cage-free / total shell-egg listings, treats
  // unknowns conservatively) and resolved (cage-free / classified listings,
  // ignores unknowns).
  const byRetailer = {};
  for (const r of all) {
    const key = r.retailer || "?";
    if (!byRetailer[key]) byRetailer[key] = {
      retailer: key, total_listings: 0, shell_egg_listings: 0,
      organic: 0, free_range: 0, barn: 0, caged: 0, unknown: 0,
      cage_free_listings: 0,
      cage_free_share_strict_pct: null,    // cage-free / all shell eggs (unknowns count as not-cage-free)
      cage_free_share_resolved_pct: null,  // cage-free / classified shell eggs (unknowns excluded from denominator)
      note: ""
    };
    const b = byRetailer[key];
    if (r.error || r.source === "external_only") {
      b.note = r.note || r.error || "";
      continue;
    }
    b.total_listings++;
    if (!r.is_shell_egg) continue;
    b.shell_egg_listings++;
    if (r.eu_code === 0) b.organic++;
    else if (r.eu_code === 1) b.free_range++;
    else if (r.eu_code === 2) b.barn++;
    else if (r.eu_code === 3) b.caged++;
    else b.unknown++;
    if (r.cage_free) b.cage_free_listings++;
  }
  for (const b of Object.values(byRetailer)) {
    if (b.shell_egg_listings) {
      b.cage_free_share_strict_pct = Math.round(100 * b.cage_free_listings / b.shell_egg_listings);
      const classified = b.shell_egg_listings - b.unknown;
      b.cage_free_share_resolved_pct = classified > 0 ? Math.round(100 * b.cage_free_listings / classified) : null;
    }
  }
  const summaryRows = Object.values(byRetailer);
  const sumCols = ["retailer", "total_listings", "shell_egg_listings", "organic", "free_range", "barn", "caged", "unknown", "cage_free_listings", "cage_free_share_strict_pct", "cage_free_share_resolved_pct", "note"];
  await writeFile(`data/summary/${tag}_summary.csv`, toCSV(summaryRows, sumCols), "utf8");
  await writeFile(`data/summary/${tag}_summary.json`, JSON.stringify(summaryRows, null, 2), "utf8");

  console.log("\nSummary by retailer (chicken shell eggs only):");
  console.table(summaryRows.map(b => ({
    retailer: b.retailer,
    listings: b.shell_egg_listings,
    "0-org": b.organic, "1-free": b.free_range, "2-barn": b.barn, "3-cage": b.caged, "?": b.unknown,
    cf_strict: b.cage_free_share_strict_pct,
    cf_resolved: b.cage_free_share_resolved_pct,
  })));
}

await main();
