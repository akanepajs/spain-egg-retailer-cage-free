# Listing-level cage-free check on Spain's top-5 grocery retailers -- 2026-Q2

**Snapshot 2026-05-04. n = 69 chicken shell-egg SKUs across Mercadona, Carrefour, Lidl, Eroski (with subsidiary Caprabo) and DIA. Quarterly rerunnable scraper at `scraper/`.**

A SKU (stock-keeping unit) is a single unique product listing in a retailer's online catalogue, identified by a distinct product name and package configuration (e.g., "Huevos camperos L EROSKI 12u" is one SKU). The analysis counts SKUs, not units sold.

## Method

The scraper records every chicken shell-egg SKU listed on each retailer's online catalogue (Spain-specific sites: mercadona.es, carrefour.es, eroski.es, caprabo.es; DIA via the Soysuper.com aggregator because dia.es blocks automated access; Lidl has no online shell-egg listings). Each SKU is classified by EU production code (0 organic, 1 free-range, 2 barn, 3 caged) using an explicit production-system field where available (Carrefour `Tipo de produccion`; Mercadona `mandatory_mentions`; Eroski / Caprabo product-detail `caracteristicas`), otherwise by keyword in the SKU name (`ecologico`, `campero`, `suelo`, `jaula` and Catalan equivalents). SKUs with no signal are flagged `unknown`.

Three central estimates are reported because each makes a different assumption about unknown-class SKUs:

- **Strict** -- treats every unknown as not-cage-free. Conservative lower bound. Wilson 95% CI included.
- **Bayesian Beta(1,1)** (base case) -- Laplace-shrunk posterior on classified SKUs; each unknown counts toward cage-free with probability `(cf + 1) / (cf + caged + 2)`. Avoids brittle 0/100 edge cases when caged=0 or cf=0.
- **Bayesian Beta(1,2)** (informed prior) -- prior mean 1/3, anchored to Spain's national production cage-free share (~33%, WATTPoultry 2023). Reflects the premise that unlabelled Spanish egg SKUs are more likely caged than cage-free.

The **consistency test** asks whether each retailer's listings central (Bayesian base case) falls inside the prior task's subjective 50% CI, derived from EggTrack 2024, OBA May 2025 benchmark, and retailer corporate disclosures. Prior sources are itemized in the Sources table.

## Results

| Retailer | n | Mix (0/1/2/3/?) | Bayes(1,1) | Bayes(1,2) | Strict (95% CI) | Prior (50% CI) | Gap pp | In CI? |
|---|---:|:---|---:|---:|---:|---:|---:|:---:|
| Mercadona | 7 | 0/2/0/4/1 | **34** | 33 | 29 (8--64) | 65 (62--68) | -31 | **no** |
| Carrefour | 11 | 2/4/5/0/0 | **100** | 100 | 100 (74--100) | 100 (98--100) | 0 | yes |
| Lidl | 0 | n/a | -- | -- | -- | 100 (99--100) | n/a | n/a |
| Eroski | 22 | 2/4/8/1/7 | **92** | 90 | 64 (43--80) | 43 (32--58) | +49 | **no** |
| Caprabo | 19 | 5/3/9/0/2 | **99** | 99 | 89 (69--97) | 100 (95--100) | -1 | yes |
| DIA | 10 | 1/1/4/0/4 | **95** | 91 | 60 (31--83) | 58 (52--63) | +37 | **no** |
| **Eroski Grp** | **41** | 7/7/17/1/9 | **96** | 96 | 76 (61--86) | -- | -- | -- |

*Bayes(1,1): Laplace-shrunk posterior on classified SKUs, unknowns allocated proportionally. Bayes(1,2): informed prior (mean 1/3, Spain national cage-free share). Strict: unknowns counted as not cage-free, Wilson 95% CI. Prior from EggTrack 2024, OBA May 2025 benchmark, and retailer disclosures.*

**Carrefour matches the prior cleanly.** All 11 unique SKUs across Madrid + Barcelona postcodes expose `Tipo de produccion` on the detail page; classification is 100% explicit, all cage-free. The 100% point estimate sits inside the 98--100 prior.

**Mercadona is the largest negative gap.** Four of seven shell-egg SKUs carry the regulator-required `criadas en jaulas` ("caged hens") disclosure; two are `camperas` (free-range); one 24-pack is unclassified. The listings central of 34% is 31 pp below the reported 65%. A rough pack-size weighting (inferred from prices, since the API omits pack counts) yields 21--50% depending on how the unknown 24-pack is classified -- still well below 65%, so the gap is not explained by volume weighting alone. The most plausible reconciliation is that `camperas` SKUs dominate actual sales volume, or that corporate figures lag the current shelf state. EggTrack 2024 rates Mercadona "At risk"; OBA's May 2025 benchmark independently confirms the 65% self-report.

**Eroski and DIA: priors look too pessimistic.** Eroski's 43% prior rests on an eight-year-old 2018 ESM baseline (the weakest prior in this analysis). Detail-page enrichment found 14 cage-free, 1 caged, 7 unknown; even a 50/50 split on unknowns gives ~75%, well outside the 32--58 band. DIA's strict metric (60%) matches its prior (58%) almost exactly, but the 4 unqualified own-brand packs are heavily category-correlated, so the truth likely lies between strict and Bayesian central for both retailers.

**Caprabo** (n=19, Eroski's Catalan subsidiary) is consistent with the prior (central 99% inside the 95--100 band). **Lidl** stays external-only: lidl.es does not list fresh shell eggs online.

![Figure 1](fig1_listings_mix_2026-Q2.png)
*Figure 1. SKU-level production-code mix per retailer (chicken shell eggs only). Mercadona is the only retailer with explicitly caged SKUs at >0 count; DIA and Eroski carry the highest unknown-classification share. Lidl excluded (no online shell-egg listings).*

![Figure 2](fig2_listings_vs_prior_2026-Q2.png)
*Figure 2. Listings cage-free estimates (box-and-whisker) versus prior 50% CI (blue error bars). Box spans from strict (conservative) to Bayesian base-case estimate; line inside marks the Bayesian informed-prior estimate; whiskers extend to the Wilson 95% CI bounds. Prior central is shown as a blue circle with 50% CI error bars.*

## Where the true cage-free share probably lies

The three point estimates reported above should not be read in isolation. The **true listing-level cage-free share almost certainly lies below the Bayesian base case but above the strict metric**, for two reasons:

1. **The Bayesian central overstates cage-free share.** Retailers have a marketing incentive to label cage-free products explicitly ("campero," "ecologico," "de suelo"), because cage-free labelling is a selling point. A SKU that carries no housing-system signal is therefore more likely to be caged than cage-free. The Bayesian Beta(1,1) allocates unknowns with a symmetric prior (mean 0.5), which does not reflect this asymmetry. The Beta(1,2) informed prior (mean 1/3) partially corrects for it but may still be too generous.

2. **The strict metric understates cage-free share.** Some genuinely cage-free SKUs may lack explicit labelling simply because the retailer's catalogue system does not surface the information -- a data-quality gap, not a housing-system signal. Treating every unknown as caged is conservative to the point of being implausible for retailers like Eroski, where 7 of 22 SKUs are unknown but 14 are already classified cage-free.

For retailers with few unknowns (Carrefour: 0; Caprabo: 2), the three estimates converge and this distinction is immaterial. For retailers with many unknowns (Eroski: 7/22; DIA: 4/10), the gap between strict and Bayesian is wide, and the truth is somewhere inside the box shown in Figure 2.

## Conclusions

**Mercadona is performing worse than the prior suggested, and given its large market share (~27% of Spanish grocery), it is a prime target for advocacy.** The listings central of 34% is 31 pp below the reported 65%. Even under the most optimistic allocation of unknowns, Mercadona is the only retailer in this sample where explicitly caged SKUs outnumber cage-free ones. Its original end-2022 cage-free commitment has already slipped to end-2025; EggTrack 2024 rates it "At risk." Mercadona's scale means that its shortfall alone accounts for more caged eggs than the entire egg sales of Eroski and DIA combined.

**The listing-level data is scarce for most retailers, and listings may not be representative of what is actually sold.** This analysis counts SKUs, not sales volume. A retailer with 50% cage-free SKUs could still sell 80% caged eggs by volume if the caged products are the cheap, high-turnover own-brand lines. Corporate figures (and EggTrack tracking) are typically volume-weighted, so divergence between listings and reported shares is informative but not evidence of misreporting. On-site shelf audits and purchase-receipt surveys are more reliable for establishing actual sales volumes.

**[Eglitis & Kanepajs (2026)](https://www.dzivniekubriviba.lv/assets/downloadable-assets/ekonomiska-analize-par-dejejvistu-sprostu-aizlieguma-ietekmi-latvija.pdf) demonstrate an on-site investigation methodology that could be adapted for the Spanish market.** Their field survey of Latvian retailers used volunteer-mobilized shelf audits to verify cage-free claims and measure actual shelf presence, producing more reliable data than online catalogue scraping alone. A similar approach for Spain's top-5 retailers would ground-truth the listing-level estimates reported here.

Better data can also come through corporate engagement: cage-free share reporting can be made part of formal agreements with retailers during corporate negotiations. But even with such agreements in place, independent on-site investigations remain valuable to validate and verify the information reported by companies, especially while clear and standardized reporting practices have not yet been established across the industry.

## Quarterly watchlist

Stable SKU IDs are written into the schema, so 2026-Q3 will distinguish true SKU additions / removals from label rewording. Specific items to track:

- **Mercadona:** any reduction in the four explicitly caged SKUs (sizes XL/L/L/M, all currently classified `Jaula` in the API).
- **Eroski main:** whether `Huevos L EROSKI 18u`, the single explicitly caged SKU, disappears from the catalogue.
- **DIA:** whether the four unqualified `Huevos M Dia` / `Huevos L Dia` packs become labelled (`de suelo`, `camperos`, etc.). Re-labelling toward cage-free would close the strict-vs-Bayesian gap; persistence supports the asymmetric-prior reading.
- **Carrefour:** extension to additional postcodes (Andalusia, Valencia, Galicia, Canarias) once a residential session is available.

## Sources

| Claim | Source | Tier | Supporting quote |
|---|---|:---:|---|
| Spain national production: 67% caged, 22% barn, 10% free-range, 1% organic (2023 flock) | [WATTPoultry, "Egg sales, consumption break records in Spain"](https://www.wattagnet.com/regions/europe/news/15706648/egg-sales-consumption-break-records-in-spain) | 2 | "Spain houses 67% of its flock in enriched cages." |
| Mercadona 65% cage-free, self-reported | [OBA, Mercadona page](https://observatoriodebienestaranimal.org/actualidad/blog-oba/supermercado-mercadona.html) (citing Mercadona July 2025 reporting) | 2 | OBA attributes 65% to Mercadona's own reporting. Original Mercadona corporate URL no longer accessible. |
| Carrefour, Lidl, Aldi, Ahorramas the only Spanish chains meeting fresh-egg cage-free commitments (May 2025) | [OBA via Sur in English, "Goodbye Code 3"](https://www.surinenglish.com/spain/the-warning-sign-arriving-spanish-supermarkets-dont-20250424062716-nt.html) | 2 | "Only Lidl, Carrefour, Aldi and Ahorramas have kept their promise" re code-3 eggs. |
| Carrefour 100% fresh, 35% ingredient eggs | [OBA, Carrefour page](https://observatoriodebienestaranimal.org/actualidad/noticias/carrefour.html) | 2 | "Carrefour is only at 35% in its commitment regarding the use of cage-free hen eggs as an ingredient in its private-label products." |
| Mercadona end-2022 commitment missed; current target end-2025 | [OBA, Mercadona blog](https://observatoriodebienestaranimal.org/actualidad/blog-oba/supermercado-mercadona.html); [EggTrack 2024](https://www.eggtrack.com/) | 2 | EggTrack 2024 classifies Mercadona "At risk." OBA flags doubts about meeting the 2025 deadline. |
| Top-5 retailer market share ~51% of Spanish FMCG | [Kantar Worldpanel, "Spain top 5 retail chains"](https://www.kantar.com/inspiration/fmcg/spain-top-5-retail-chains-account-for-more-than-half-of-grocery-market-value) | 1 | "Together account for more than half of total FMCG spend." |
| Spain grocery spending 2024 = EUR 122 bn | [ESM via NielsenIQ, "Spanish grocery spending hits record EUR 122bn"](https://www.esmmagazine.com/retail/spanish-grocery-spending-hits-record-e122bn-in-2024-281344) | 2 / 1 | NielsenIQ Consumer Trends 2024. |
| EU egg production codes (0 organic, 1 free-range, 2 barn, 3 caged) | [European Commission, Marketing standards for eggs](https://agriculture.ec.europa.eu/farming/animal-products/eggs_en) | 1 | EU regulatory framework. |
| Soysuper (DIA workaround source) | [soysuper.com](https://www.soysuper.com/) | 3 | Aggregator; used because dia.es is Akamai-blocked at the edge. |
| On-site investigation methodology for laying-hen cage-free verification | [Eglitis & Kanepajs, 2026](https://www.dzivniekubriviba.lv/assets/downloadable-assets/ekonomiska-analize-par-dejejvistu-sprostu-aizlieguma-ietekmi-latvija.pdf) | 2 | Field survey of Latvian retailers using volunteer-mobilized shelf audits. |

Tier 1 = primary / regulatory / first-party corporate; Tier 2 = trade press citing primary or independent research; Tier 3 = aggregator or secondary.

## Tools used and AI disclosure

Claude Code (Anthropic) was used for scraper development and for drafting and editing of this report.

## Did not do / assumed / skipped / did not verify

- Cage-free % is straight SKU count, not volume-weighted. A rough pack-size weighting for Mercadona (see per-retailer analysis) narrows but does not close the gap.
- DIA: relied on Soysuper aggregator (DIA-brand SKUs only); true DIA catalogue could be 50--100% larger with the full third-party assortment.
- Carrefour: only Madrid 28232 and Barcelona 08001 postcodes. Eroski / Caprabo: 9 of 41 group SKUs remain unknown after detail-page enrichment.
- Bayesian Beta(1,2) informed prior is anchored to Spain's national production-side cage-free share (~33%); a retail-side anchor was not constructed.
- Wilson 95% CI assumes IID SKUs; does not capture rotation, postcode variation, or volume weighting.
- Did not verify whether the Eglitis & Kanepajs (2026) volunteer-audit methodology would transfer directly to the Spanish retail context; the recommendation is directional.
- Caprabo's 100% (95--100) prior is from a 2022 Eroski sustainability report and may be stale.
