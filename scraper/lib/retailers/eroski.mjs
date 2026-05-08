// Eroski scraper. The egg category page is publicly accessible without login,
// and is server-rendered (HTML works). Product names contain the production
// system (suelo / campero / ecológico / bio) explicitly in most cases.
//
// The main /huevos/ landing only displays a sample of items. To enumerate
// everything we crawl each subcategory (camperos y ecológicos, talla M/L/XL,
// codorniz, ovoproductos, etc.) and dedupe by product name.

import * as cheerio from "cheerio";

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";
const ROOT = "https://supermercado.eroski.es/es/supermercado/2059698-frescos/2059760-huevos/";

async function discoverSubcategories() {
  const r = await fetch(ROOT, { headers: { "User-Agent": UA, "Accept-Language": "es-ES,es;q=0.9" } });
  if (!r.ok) throw new Error(`HTTP ${r.status} on root`);
  const html = await r.text();
  const $ = cheerio.load(html);
  const subs = new Set();
  $('a[href*="/2059760-huevos/"]').each((_, a) => {
    const href = ($(a).attr("href") || "").replace(/:443/g, "");
    if (!href || href === ROOT) return;
    if (/\/2059760-huevos\/[^/]+\/?$/.test(href.replace(/\?.*$/, ""))) {
      subs.add(href.split("?")[0]);
    }
  });
  return [...subs];
}

async function fetchSubcategory(url, subcatLabel) {
  const r = await fetch(url, { headers: { "User-Agent": UA, "Accept-Language": "es-ES,es;q=0.9" } });
  if (!r.ok) throw new Error(`HTTP ${r.status} on ${url}`);
  const html = await r.text();
  const $ = cheerio.load(html);
  const out = [];
  const seen = new Set();
  $("h2, h3, h4").each((_, el) => {
    const name = $(el).text().trim();
    if (!/huevo|clara/i.test(name)) return;
    if (/^Selección de/.test(name)) return;
    if (seen.has(name)) return;
    seen.add(name);
    const card = $(el).closest('[class*="product"], li, article, div').first();
    const priceText = card.find('[class*="price"]').first().text().trim() || "";
    // Detail page link uses /productdetail/ pattern.
    const detailHref = card.find('a[href*="/productdetail/"]').first().attr("href") || "";
    const idMatch = detailHref.match(/\/productdetail\/(\d+)-/);
    out.push({
      retailer: "Eroski",
      source: "eroski_html",
      sku_id: idMatch ? `eroski_${idMatch[1]}` : `eroski_name_${name.slice(0,40).replace(/\s+/g, "_")}`,
      product_id: idMatch ? idMatch[1] : "",
      name,
      price_text: priceText,
      detail_url: detailHref ? new URL(detailHref, ROOT).href : "",
      subcategory: subcatLabel,
      tipo_produccion: "",
    });
  });
  return out;
}

async function enrichFromDetail(row) {
  if (!row.detail_url) return;
  try {
    const r = await fetch(row.detail_url, { headers: { "User-Agent": UA, "Accept-Language": "es-ES,es;q=0.9" } });
    if (!r.ok) return;
    const html = await r.text();
    const $ = cheerio.load(html);
    const car = $(".caracteristicas").first().text();
    if (!car) return;
    // Look for housing keywords explicitly in the structured-data section.
    if (/criadas? en jaulas?\b|jaulas? acondicionad/i.test(car)) row.tipo_produccion = "Jaula";
    else if (/gallinas? camperas?|free[\s-]?range/i.test(car)) row.tipo_produccion = "Campero";
    else if (/criadas? en suelo|gallinas? en suelo/i.test(car)) row.tipo_produccion = "Suelo";
    else if (/ecol[oó]gic|biol[oó]gic|orgánic/i.test(car)) row.tipo_produccion = "Ecológicos";
    if (row.tipo_produccion) row.detail_resolved = true;
  } catch {}
}

export async function scrape() {
  const subs = await discoverSubcategories();
  const all = new Map();
  if (subs.length === 0) {
    const rows = await fetchSubcategory(ROOT, "root");
    for (const r of rows) if (!all.has(r.name)) all.set(r.name, r);
  } else {
    for (const url of subs) {
      const label = url.match(/\/(\d+-[a-z0-9-]+)\/?$/i)?.[1] || url;
      try {
        const rows = await fetchSubcategory(url, label);
        for (const row of rows) if (!all.has(row.name)) all.set(row.name, row);
        await new Promise(r => setTimeout(r, 400));
      } catch (e) {
        console.error(`  Eroski subcategory failed: ${label} — ${e.message}`);
      }
    }
  }
  // Fetch detail page for every product to look for an explicit housing field.
  const list = [...all.values()];
  for (const row of list) {
    await enrichFromDetail(row);
    await new Promise(r => setTimeout(r, 300));
  }
  return list;
}

