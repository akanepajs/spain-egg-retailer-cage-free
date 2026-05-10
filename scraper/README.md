# Spain top-5 retailer egg-listing scraper

Quarterly listing-level snapshot of fresh chicken shell-egg products at Mercadona, Carrefour, Lidl, Eroski (and its Catalan subsidiary Caprabo) and DIA. Each SKU is classified by EU production code (0 organic, 1 free-range, 2 barn, 3 caged, or `unknown` if no signal) and the listings cage-free share is compared against the retailer's reported / audited cage-free figure.

## Layout

```
scraper/
  package.json              # Node ≥ 20; deps: cheerio (and playwright, kept for negative test)
  lib/
    classify.mjs            # EU code classifier (explicit field then keyword)
    retailers/
      carrefour.mjs         # browser-captured snapshot ingest (Cloudflare-blocked direct)
      mercadona.mjs         # public JSON API
      eroski.mjs            # SSR HTML + cheerio + detail-page enrichment
      caprabo.mjs           # SSR HTML + cheerio + detail-page enrichment (Catalan)
      lidl.mjs              # external sources only (no online food in lidl.es)
      dia.mjs               # Soysuper aggregator API (Akamai-blocked direct)
  run_scrape.mjs            # main runner: writes data/raw/ + data/summary/
  compare.mjs               # listings vs reported: writes data/comparison/
  data/
    carrefour_snapshot_<quarter>[_<zone>].json   # browser-captured raw input
    raw/<quarter>_listings.{csv,json}            # one row per SKU, classified
    summary/<quarter>_summary.{csv,json}         # one row per retailer
    comparison/<quarter>_comparison.{csv,json}   # listings vs reported
```

## Run

```
npm install
node run_scrape.mjs 2026-Q2     # writes data/raw/ + data/summary/
node compare.mjs   2026-Q2      # writes data/comparison/

# Figures (from project root, not scraper/)
pip install -r scripts/requirements.txt
python scripts/make_figures.py 2026-Q2   # writes fig1_*.png + fig2_*.png
```

The quarter argument defaults to today's calendar quarter. Output files are keyed on the tag, so reruns of the same quarter overwrite. Programmatic retailers (Mercadona, Eroski, Caprabo, Lidl) re-fetch live each run; Carrefour and DIA read from on-disk browser snapshots that must be refreshed manually each quarter (see "Browser-mediated capture" below).

## Output schema

`data/raw/<quarter>_listings.json` — one row per SKU:

| Field | Meaning |
|---|---|
| `retailer` | Mercadona / Carrefour / Lidl / Eroski / Caprabo / DIA |
| `source` | `mercadona_api`, `eroski_html`, `caprabo_html`, `carrefour_snapshot_<zone>`, `dia_soysuper`, `external_only` |
| `sku_id` | stable identifier — `mercadona_<id>`, `carrefour_<key>`, `eroski_<id>`, `caprabo_<id>`, `dia_soysuper_<id>` |
| `name`, `price_text`, `unit_price` | display text |
| `tipo_produccion` | retailer-supplied production-system field (Carrefour) or housing line from `mandatory_mentions` (Mercadona) |
| `eu_code` | 0 / 1 / 2 / 3, or `null` if unknown |
| `production_label` | `organic` / `free_range` / `barn` / `caged` / `unknown` |
| `classify_source` | `tipo_produccion_field` (high) / `name_keyword` (medium) / `mandatory_mentions` (high) / `unknown` |
| `is_shell_egg` | excludes liquid eggs (claras), egg pastas, baked goods, quail eggs |
| `cage_free` | true if EU code in {0, 1, 2}; `null` if unknown |

`data/summary/<quarter>_summary.json` — one row per retailer with `organic`, `free_range`, `barn`, `caged`, `unknown` counts plus `cage_free_share_strict_pct` (cage-free / total) and `cage_free_share_resolved_pct` (cage-free / classified).

`data/comparison/<quarter>_comparison.json` — one row per retailer plus an `Eroski Group` rollup (Eroski + Caprabo). Key fields:

| Field | Meaning |
|---|---|
| `listings_central_pct` | **base case** — Bayesian Beta(1,1) Laplace-shrunk allocation of unknowns |
| `listings_central_informed_pct` | sensitivity — Bayesian Beta(1,2), prior mean 1/3 (Spain national production cage-free) |
| `listings_central_proportional_pct` | unsmoothed proportional central (= resolved metric) |
| `listings_cf_strict_pct` + `listings_cf_strict_95ci` | strict (unknowns count as not-cage-free), with Wilson 95% CI |
| `prior_estimate_pct` + `prior_estimate_50ci` | reported / blended cage-free figure with 50% subjective CI |
| `central_in_prior_50ci` | does the Bayes(1,1) central fall inside the prior 50% band? (consistency test) |
| `diff_central_minus_prior_pp` | Bayes(1,1) − prior, in percentage points |

## Carrefour and DIA: browser-mediated capture

Both retailers 403 on direct HTTP fetch (Cloudflare and Akamai bot protection respectively); Playwright with stealth patches was tested and also blocked. Each quarter, refresh the snapshot files manually:

**Carrefour** — open `https://www.carrefour.es/supermercado/la-despensa/huevos/cat20021/c` in a real browser (Chrome with the Claude-in-Chrome extension, or any Chrome devtools session). Paste this into devtools console:

```js
window.__cf = Array.from(document.querySelectorAll('li.product-card-list__item')).map(li => {
  const link = li.querySelector('a[href*="/p"]');
  const lines = li.innerText.split('\n').filter(s => s.trim() && !['Añadir','Ver detalle','Ver los productos'].includes(s.trim()));
  return {
    name: lines.find(l => /huevo|clara/i.test(l)) || '',
    price: lines.find(l => /€$/.test(l.trim()) && !l.includes('docena')) || '',
    unit_price: lines.find(l => /€\/(docena|kg|l)/.test(l)) || '',
    href: link?.href || ''
  };
}).filter(p => p.name);
(async () => {
  for (const p of window.__cf) {
    const t = await (await fetch(p.href)).text();
    const m = t.match(/Tipo de producci[oó]n[\s\S]{0,30}?<[^>]+>([^<]+)</);
    p.tipo_produccion = m ? m[1].trim() : '';
    await new Promise(r => setTimeout(r, 500));
  }
  copy(JSON.stringify({retailer: 'Carrefour', captured_at: new Date().toISOString().slice(0,10), products: window.__cf.map(x => ({name: x.name, price: x.price, unit_price: x.unit_price, tipo_produccion: x.tipo_produccion}))}, null, 2));
  console.log('JSON copied to clipboard');
})();
```

Save the clipboard contents to `data/carrefour_snapshot_<quarter>.json`. To add additional postcodes, capture from a second session and save as `data/carrefour_snapshot_<quarter>_<zone>.json`; the loader concatenates all matching files and dedups on `{brand-stub, pack-size, tipo_produccion}`.

**DIA** — dia.es itself rejects automated browsers entirely. The implementation falls back to the public Soysuper aggregator (`https://www.soysuper.com/api/v1/search?brand=dia`), which returns DIA-brand SKUs. Third-party brands stocked at DIA are not captured by this path. The `data/dia_snapshot_<quarter>.json` slot is reserved for an optional manual capture from a residential session; the runner uses the snapshot if present and falls back to Soysuper otherwise.

## Production-system classification

`lib/classify.mjs` looks at, in order:

1. Explicit production-system field on the SKU (`tipo_produccion` for Carrefour: `Suelo` → 2, `Campero` → 1, `Ecológicos` → 0, `Jaula` → 3) or housing line in Mercadona's `mandatory_mentions`. **High confidence.**
2. Keyword in the SKU name: `eco / ecológico / bio` → 0; `campero / campera / caserío / caserías` → 1; `suelo` → 2; `jaula` → 3. Catalan equivalents (`ous ecològics`, `ous camperos / pageses`, `ous de sòl`) included for Caprabo. **Medium confidence.**
3. No signal → `unknown`. **Flagged in output for downstream sensitivity analysis.**

`isShellEgg()` filters out liquid eggs (claras), pasteurised egg products, egg pastas, baked goods, and quail eggs. The cage-free comparison is restricted to chicken shell eggs.

## Reading the cage-free share metrics

Three central-estimate variants are reported because each makes a different assumption about unknown-class SKUs:

| Metric | Formula | Use |
|---|---|---|
| **Strict** | cage-free / (cage-free + caged + unknown) | Conservative lower bound. Assumes every unknown is caged. Wilson 95% CI included. |
| **Bayes(1,1) — base case** | cf-share = (cf + 1) / (cf + caged + 2); each unknown counts cf-share toward cage-free | Default headline metric. Adds one virtual cage-free + one virtual caged SKU; shrinks toward 0.5 at small classified-n. Avoids the brittle 0/100 edge cases of naive proportional allocation when caged=0 or cf=0. |
| **Bayes(1,2) — informed** | (cf + 1) / (cf + caged + 3); prior mean = 1/3 | Sensitivity. Anchors the unknowns toward Spain's national production cage-free share (~33%, WATTPoultry 2023 flock data). Useful when the modelling prior is "unknowns are more likely caged than cage-free because cage-free SKUs typically get explicit labels for marketing." |
| **Resolved (= proportional)** | cf / (cf + caged) | Robustness check. Allocates unknowns in proportion to the classified mix. Mathematically equivalent to Bayes(α, β) → 0. |

The consistency test against the prior task's 50% CI uses the Bayes(1,1) central as the listings point estimate. The strict metric and its Wilson 95% CI are reported alongside so the reader can choose.

## Caveat — what the listings share does NOT measure

This is a transparency / shelf-presence indicator, not a sales-share measure. A retailer with 50% cage-free SKUs by count could still sell 80% caged eggs by volume if the caged products are the cheap, high-volume own-brand line. The cage-free claims that retailers publish (and that EggTrack tracks) are typically volume-weighted; the listings share is a separate signal. See the deliverable report `../spain_egg_listings_2026Q2.md` for the full caveats list.

## Quarterly watchlist (what to track in the next run)

Stable SKU IDs are written into the schema, so 2026-Q3 will distinguish true SKU additions / removals from label rewording. Specifically:

- **Mercadona**: any reduction in the four explicitly caged SKUs (sizes XL/L/L/M, all classified `Jaula` in the API).
- **Eroski main**: whether `Huevos L EROSKI 18u` (the single explicitly caged SKU) disappears.
- **DIA**: whether the four unqualified `Huevos M Dia` / `Huevos L Dia` packs become labelled. Re-labelling toward cage-free closes the strict-vs-Bayesian gap; persistence supports the asymmetric-prior reading.
- **Carrefour**: extension to additional postcodes (Andalusia, Valencia, Galicia, Canarias) once a residential session is available. Save additional snapshots as `data/carrefour_snapshot_<quarter>_<zone>.json`.

## Limitations

- **No volume weighting.** Cage-free % is straight SKU count, not pack-size × price.
- **Catalogue rotation.** A single-day snapshot can miss SKUs that appear later in the quarter.
- **Postcode coverage.** Only Madrid + Barcelona for Carrefour; default postcode for Mercadona / Eroski / Caprabo.
- **Third-party brands at DIA.** Soysuper aggregator returns DIA-brand SKUs only; third-party brands stocked at DIA are not captured.
- **Wilson 95% CI assumes IID SKUs**, which is approximate (rotation, postcode variation, supplier-multi-source, ingredient-vs-shell distinction not modelled).
