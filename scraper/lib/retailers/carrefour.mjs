// Carrefour parser. Direct HTTP fetch returns 403 (Cloudflare bot protection).
// Workflow: capture the listing + per-product detail data via a real browser
// session (e.g. Claude in Chrome) and save as data/carrefour_snapshot_<quarter>.json.
// Multi-postcode: additional snapshots can be saved as
// data/carrefour_snapshot_<quarter>_<zone>.json (e.g. _bcn, _val) and are
// auto-discovered, deduped by product name across zones.

import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";

const DATA_DIR = "data";

export async function scrape({ quarterTag = "2026-Q2" } = {}) {
  const files = await readdir(DATA_DIR).catch(() => []);
  const matching = files.filter(f =>
    f.startsWith("carrefour_snapshot_") && f.endsWith(".json") &&
    (f.includes(quarterTag) || f === `carrefour_snapshot_${quarterTag}.json`)
  ).sort();
  if (matching.length === 0) {
    // Fall back to any carrefour snapshot, latest first.
    const fallback = files.filter(f => f.startsWith("carrefour_snapshot_") && f.endsWith(".json")).sort().pop();
    if (!fallback) {
      throw new Error(`No Carrefour snapshot found. Capture via browser and save as carrefour_snapshot_${quarterTag}.json.`);
    }
    matching.push(fallback);
  }

  // Deduplicate across postcodes. Two normalisations to avoid double-counts:
  //   1. Lowercase the product name ("Huevos Frescos" vs "Huevos frescos").
  //   2. Strip the leading size qualifier ("Huevos L de suelo Carrefour El
  //      Mercado 12 ud." vs "Huevos Frescos Carrefour El Mercado 12 ud." both
  //      collapse to the same own-brand 12u SKU under a regional relabel).
  // The dedup key is { brand-stub + pack-size + tipo_produccion } so labels
  // can vary while genuinely-different SKUs (different size, different brand,
  // different production system) stay distinct.
  const merged = new Map();
  const dedupKey = (p) => {
    const lower = (p.name || "").toLowerCase();
    const pack = (lower.match(/(\d+)\s*(ud|u|uds|unidades|docena|doc)\b/) || ["", ""])[0].replace(/\s+/g, "");
    // Brand stub: take the first non-stopword that looks like a brand (uppercase token in original)
    const brandMatch = (p.name || "").match(/(carrefour|c[ií]rculo de calidad|pazo de vilane|granjas villarreal|dagu|roig|naturelle|bio)/i);
    const brand = (brandMatch ? brandMatch[1] : "").toLowerCase();
    const tipo = (p.tipo_produccion || "").toLowerCase();
    return `${brand}|${pack}|${tipo}`;
  };
  for (const fname of matching) {
    const snap = JSON.parse(await readFile(join(DATA_DIR, fname), "utf8"));
    const postcode = snap.delivery_postcode || fname.replace(/^carrefour_snapshot_|\.json$/g, "");
    for (const p of snap.products) {
      const key = dedupKey(p);
      if (!merged.has(key)) {
        merged.set(key, {
          retailer: "Carrefour",
          source: "carrefour_browser_snapshot",
          sku_id: key,
          name: p.name,
          alt_names: [],
          price_text: p.price,
          unit_price: p.unit_price,
          tipo_produccion: p.tipo_produccion,
          otras_menciones: p.otras_menciones || "",
          postcodes: [postcode],
        });
      } else {
        const existing = merged.get(key);
        if (existing.name !== p.name && !existing.alt_names.includes(p.name)) {
          existing.alt_names.push(p.name);
        }
        if (!existing.postcodes.includes(postcode)) existing.postcodes.push(postcode);
      }
    }
  }
  return [...merged.values()];
}
