// Mercadona scraper. Uses the public JSON API at tienda.mercadona.es.
// Category 77 = "Huevos" (under "Huevos, leche y mantequilla").
// Postcode required via cookie; the API itself is open. We pass an explicit
// warehouse hint via the wh query parameter.

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";
const CATEGORY_ID = 77;
const WAREHOUSE = "mad1"; // Madrid warehouse — surfaces a representative central-Spain assortment

async function fetchJSON(url) {
  const r = await fetch(url, { headers: { "User-Agent": UA, "Accept": "application/json", "Accept-Language": "es-ES,es;q=0.9" } });
  if (!r.ok) throw new Error(`HTTP ${r.status} for ${url}`);
  return r.json();
}

export async function scrape() {
  const cat = await fetchJSON(`https://tienda.mercadona.es/api/categories/${CATEGORY_ID}/?lang=es&wh=${WAREHOUSE}`);
  const stubs = [];
  (cat.categories || []).forEach(c => (c.products || []).forEach(p => stubs.push(p)));

  const out = [];
  for (const stub of stubs) {
    try {
      const detail = await fetchJSON(`https://tienda.mercadona.es/api/products/${stub.id}/?lang=es&wh=${WAREHOUSE}`);
      const d = detail.details || {};
      const pi = detail.price_instructions || {};
      // Mercadona's `mandatory_mentions` is the regulator-required label text
      // and contains the housing system explicitly: "...gallinas criadas en
      // jaulas" (caged), "...gallinas camperas" (free-range), "...gallinas
      // criadas en suelo" (barn), or organic markers. The legal_name often
      // also encodes this. We pass both into classify() via tipo_produccion.
      const mentions = (d.mandatory_mentions || "").toLowerCase();
      const legal = (d.legal_name || "").toLowerCase();
      const combined = `${legal} ${mentions}`;
      let tipo = "";
      if (/\bjaulas?\b/.test(combined)) tipo = "Jaula";
      else if (/\bcamperas?\b|\bfree[\s-]?range\b/.test(combined)) tipo = "Campero";
      else if (/\beco|\bbio|\borg[aá]nic|\becol[oó]gic/.test(combined)) tipo = "Ecológicos";
      else if (/\bsuelo\b|criadas? en suelo/.test(combined)) tipo = "Suelo";

      out.push({
        retailer: "Mercadona",
        source: "mercadona_api",
        sku_id: `mercadona_${detail.id}`,
        product_id: detail.id,
        name: detail.display_name || stub.display_name,
        legal_name: d.legal_name || "",
        brand: detail.brand?.name || (d.brand?.name || ""),
        packaging: detail.packaging || "",
        unit_name: stub.unit_name || "",
        price_eur: pi.unit_price ? Number(pi.unit_price) : null,
        price_per_dozen_eur: pi.reference_price && pi.reference_format === "docena" ? Number(pi.reference_price) : null,
        suppliers: (d.suppliers || []).map(s => s.name),
        origin: detail.origin || "",
        tipo_produccion: tipo,
        mandatory_mentions: (d.mandatory_mentions || "").slice(0, 300),
      });
      await new Promise(r => setTimeout(r, 600));
    } catch (e) {
      out.push({ retailer: "Mercadona", error: e.message, product_id: stub.id, name: stub.display_name });
    }
  }
  return out;
}
