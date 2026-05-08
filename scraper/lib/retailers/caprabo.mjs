// Caprabo scraper. Caprabo is the Catalonia-region banner of Eroski Group
// (~12.5% of Eroski's stores by count). It runs on a sibling instance of the
// same e-commerce platform as supermercado.eroski.es, with the same category
// IDs but Catalan-language slugs ("ous" = eggs, "sòl"/"terra" = barn, etc.).
// Treated as a separate listing source; rolled up under "Eroski Group" in
// the comparison.

import * as cheerio from "cheerio";

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";
const ROOT = "https://www.capraboacasa.com/ca/supermercat/2059698-productes-frescos/2059760-ous/";

async function discoverSubcategories() {
  const r = await fetch(ROOT, { headers: { "User-Agent": UA, "Accept-Language": "ca-ES,ca;q=0.9" } });
  if (!r.ok) throw new Error(`HTTP ${r.status} on root`);
  const html = await r.text();
  const $ = cheerio.load(html);
  const subs = new Set();
  $('a[href*="/2059760-ous/"]').each((_, a) => {
    const href = ($(a).attr("href") || "").replace(/:443/g, "");
    if (!href || href === ROOT) return;
    if (/\/2059760-ous\/[^/]+\/?$/.test(href.replace(/\?.*$/, ""))) {
      subs.add(href.split("?")[0]);
    }
  });
  return [...subs];
}

async function fetchSubcategory(url, subcatLabel) {
  const r = await fetch(url, { headers: { "User-Agent": UA, "Accept-Language": "ca-ES,ca;q=0.9" } });
  if (!r.ok) return [];
  const html = await r.text();
  const $ = cheerio.load(html);
  const out = [];
  const seen = new Set();
  $("h2, h3, h4").each((_, el) => {
    const name = $(el).text().trim();
    if (!/\bou|huevo|clara/i.test(name)) return;
    if (/^Selecci[oó]/.test(name) || /^Veure/.test(name)) return;
    if (seen.has(name)) return;
    seen.add(name);
    const card = $(el).closest('[class*="product"], li, article, div').first();
    const priceText = card.find('[class*="price"]').first().text().trim() || "";
    const detailHref = card.find('a[href*="/productdetail/"]').first().attr("href") || "";
    const idMatch = detailHref.match(/\/productdetail\/(\d+)-/);
    out.push({
      retailer: "Caprabo",
      retailer_group: "Eroski Group",
      source: "caprabo_html",
      sku_id: idMatch ? `caprabo_${idMatch[1]}` : `caprabo_name_${name.slice(0,40).replace(/\s+/g, "_")}`,
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
    const r = await fetch(row.detail_url, { headers: { "User-Agent": UA, "Accept-Language": "ca-ES,ca;q=0.9" } });
    if (!r.ok) return;
    const html = await r.text();
    const $ = cheerio.load(html);
    const car = $(".caracteristicas").first().text();
    if (!car) return;
    if (/criades? en gàbies?|criadas? en jaulas?|jaulas? acondicionad/i.test(car)) row.tipo_produccion = "Jaula";
    else if (/gallines? camperes?|gallinas? camperas?|camperol|free[\s-]?range/i.test(car)) row.tipo_produccion = "Campero";
    else if (/criades? en s[oò]l|criadas? en suelo|en s[oò]l|en terra/i.test(car)) row.tipo_produccion = "Suelo";
    else if (/ecol[oó]gic|biol[oó]gic|orgànic|orgánic/i.test(car)) row.tipo_produccion = "Ecológicos";
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
        console.error(`  Caprabo subcategory failed: ${label} — ${e.message}`);
      }
    }
  }
  const list = [...all.values()];
  for (const row of list) {
    await enrichFromDetail(row);
    await new Promise(r => setTimeout(r, 300));
  }
  return list;
}
