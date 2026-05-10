// Re-apply isShellEgg() to existing raw JSON without re-scraping.
// Use after fixing classify.mjs to propagate classification changes
// through summary and comparison outputs.

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { isShellEgg, isCageFree } from "./lib/classify.mjs";

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
  const tag = process.argv[2] || "2026-Q2";
  const rawPath = `data/raw/${tag}_listings.json`;
  console.log(`Reclassifying ${rawPath} with updated isShellEgg()`);

  const all = JSON.parse(await readFile(rawPath, "utf8"));
  let changed = 0;

  for (const r of all) {
    if (r.error || r.source === "external_only") continue;
    const was = r.is_shell_egg;
    r.is_shell_egg = isShellEgg(r);
    if (was !== r.is_shell_egg) {
      console.log(`  CHANGED: ${r.sku_id} "${r.name}" is_shell_egg: ${was} -> ${r.is_shell_egg}`);
      changed++;
    }
  }
  console.log(`${changed} product(s) reclassified.`);

  await writeFile(rawPath, JSON.stringify(all, null, 2), "utf8");

  const cols = ["retailer", "source", "name", "price_text", "unit_price", "tipo_produccion",
    "eu_code", "production_label", "classify_source", "is_shell_egg", "cage_free", "note", "error"];
  await writeFile(`data/raw/${tag}_listings.csv`, toCSV(all, cols), "utf8");

  // Re-generate summary (same logic as run_scrape.mjs lines 91-127).
  const byRetailer = {};
  for (const r of all) {
    const key = r.retailer || "?";
    if (!byRetailer[key]) byRetailer[key] = {
      retailer: key, total_listings: 0, shell_egg_listings: 0,
      organic: 0, free_range: 0, barn: 0, caged: 0, unknown: 0,
      cage_free_listings: 0,
      cage_free_share_strict_pct: null,
      cage_free_share_resolved_pct: null,
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
  await mkdir("data/summary", { recursive: true });
  await writeFile(`data/summary/${tag}_summary.csv`, toCSV(summaryRows, sumCols), "utf8");
  await writeFile(`data/summary/${tag}_summary.json`, JSON.stringify(summaryRows, null, 2), "utf8");

  console.log("\nUpdated summary:");
  console.table(summaryRows.map(b => ({
    retailer: b.retailer,
    listings: b.shell_egg_listings,
    "0-org": b.organic, "1-free": b.free_range, "2-barn": b.barn, "3-cage": b.caged, "?": b.unknown,
    cf_strict: b.cage_free_share_strict_pct,
    cf_resolved: b.cage_free_share_resolved_pct,
  })));
}

await main();
