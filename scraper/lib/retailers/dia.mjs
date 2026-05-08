// DIA scraper. dia.es is fully blocked at the Akamai edge (HTTP 403 on
// Node fetch, on Claude-in-Chrome browser sessions, and on Playwright with
// stealth patches). Direct scrape requires a residential proxy or paid
// anti-bot service.
//
// Workaround: Soysuper.com is a Spanish price-comparison aggregator that
// catalogues DIA's own-brand products. Its public JSON API at
// /api/v1/search exposes the egg category with a brand=dia filter that
// returns DIA's own-brand egg SKUs. Used here as a fallback listing source.
// Caveats: (1) only DIA-branded SKUs, not third-party brands DIA stocks;
// (2) Soysuper updates may lag DIA's catalogue; (3) the "brand=dia" filter
// matches the DIA-brand label, not the retailer's full assortment.
//
// If a manual snapshot from a residential session becomes available, drop
// it as data/dia_snapshot_<quarter>.json (same shape as Carrefour's snapshot)
// and the scraper will prefer it over Soysuper.

import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";

const DATA_DIR = "data";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";

async function tryManualSnapshot(quarterTag) {
  const filename = `dia_snapshot_${quarterTag}.json`;
  try {
    const raw = await readFile(join(DATA_DIR, filename), "utf8");
    const snap = JSON.parse(raw);
    return snap.products.map(p => ({
      retailer: "DIA",
      source: "dia_browser_snapshot",
      sku_id: p.id ? `dia_${p.id}` : `dia_name_${(p.name || "").slice(0,40).replace(/\s+/g, "_")}`,
      name: p.name,
      price_text: p.price || "",
      tipo_produccion: p.tipo_produccion || "",
    }));
  } catch {
    return null;
  }
}

async function fetchFromSoysuper() {
  const url = "https://soysuper.com/api/v1/search?q=huevo&category=lacteos-y-huevos%2Fhuevos&brand=dia&limit=200";
  const r = await fetch(url, { headers: { "User-Agent": UA, "Accept": "application/json", "Accept-Language": "es-ES,es;q=0.9" } });
  if (!r.ok) throw new Error(`Soysuper HTTP ${r.status}`);
  const j = await r.json();
  const items = j.products?.items || [];
  return items.map(p => {
    const name = p.name || "";
    const slug = p.slug || "";
    const combined = `${name} ${slug}`.toLowerCase();
    let tipo = "";
    if (/criadas? en (?:el )?suelo/.test(combined)) tipo = "Suelo";
    else if (/\bcamperas?\b|camperos?/.test(combined)) tipo = "Campero";
    else if (/ecol[oó]gic|biol[oó]gic/.test(combined)) tipo = "Ecológicos";
    else if (/\bjaulas?\b/.test(combined)) tipo = "Jaula";
    return {
      retailer: "DIA",
      source: "soysuper_aggregator",
      sku_id: `dia_soysuper_${p.product_id}`,
      product_id: p.product_id,
      name,
      price_text: p.price ? `${p.price} €` : "",
      unit_price: p.unit_price ? `${p.unit_price.price} €/${p.unit_price.measure}` : "",
      tipo_produccion: tipo,
      pack: p.variant || "",
      slug,
    };
  });
}

export async function scrape({ quarterTag = "2026-Q2" } = {}) {
  const manual = await tryManualSnapshot(quarterTag);
  if (manual && manual.length) return manual;

  try {
    const items = await fetchFromSoysuper();
    if (items.length) return items;
  } catch (e) {
    // Fall through to external-only stub.
  }

  return [{
    retailer: "DIA",
    source: "external_only",
    name: null,
    note: "dia.es Akamai-blocked; Soysuper aggregator also unavailable. Cage-free status: 58% per DIA corporate; EggTrack 2024: At risk.",
    reported_cage_free_pct: 58,
    eggtrack_status: "At risk",
  }];
}
