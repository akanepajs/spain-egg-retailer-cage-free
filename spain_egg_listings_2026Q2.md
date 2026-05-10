# Listing-level cage-free check on Spain's top-5 grocery retailers -- 2026-Q2

**Snapshot 2026-05-04. n = 67 chicken shell-egg SKUs across Mercadona, Carrefour, Lidl, Eroski (with subsidiary Caprabo) and DIA. Quarterly rerunnable scraper at `scraper/`.**

A SKU (stock-keeping unit) is a single unique product listing in a retailer's online catalogue, identified by a distinct product name and package configuration (e.g., "Huevos camperos L EROSKI 12u" is one SKU). The analysis counts SKUs, not units sold.

## Method

The scraper records every chicken shell-egg SKU listed on each retailer's online catalogue (Spain-specific sites: mercadona.es, carrefour.es, eroski.es, caprabo.es; DIA via the Soysuper.com aggregator because dia.es blocks automated access; Lidl has no online shell-egg listings). Each SKU is classified by EU production code (0 organic, 1 free-range, 2 barn, 3 caged) using an explicit production-system field where available (Carrefour `Tipo de produccion`; Mercadona `mandatory_mentions`; Eroski / Caprabo product-detail `caracteristicas`), otherwise by keyword in the SKU name (`ecologico`, `campero`, `suelo`, `jaula` and Catalan equivalents). SKUs with no signal are flagged `unknown`.

Two central estimates are reported because each makes a different assumption about unknown-class SKUs:

- **CF (0%)** -- treats every unknown as not-cage-free. Conservative lower bound. Wilson 95% CI included.
- **CF (33%)** -- each unknown SKU is counted as 0.33 cage-free, anchored to Spain's national production cage-free share (approximately 33%, WATTPoultry 2023). Formula: `(cf + unknown * 0.33) / n`. Reflects the premise that unlabelled Spanish egg SKUs are more likely caged than cage-free.

Each estimate is compared against the prior (50% CI from EggTrack 2024, OBA, and retailer disclosures) to flag retailers whose observed listing mix diverges from reported cage-free shares.

## Results

*Table 1. Cage-free share estimates by retailer.*

| Retailer | n | Mix (0/1/2/3/?) | Prior (50% CI) | CF (0%) | CF (33%) |
|---|---:|:---|---:|---:|---:|
| Mercadona | 7 | 0/2/0/4/1 | 65 (62--68) | 29 | 33 |
| Carrefour | 11 | 2/4/5/0/0 | 100 (98--100) | 100 | 100 |
| Lidl | 0 | n/a | 100 (99--100) | -- | -- |
| Eroski | 20 | 2/4/8/1/5 | 43 (32--58) | 70 | 78 |
| Caprabo | 19 | 5/3/9/0/2 | 100 (95--100) | 89 | 93 |
| DIA | 10 | 1/1/4/0/4 | 58 (52--63) | 60 | 73 |

*CF (0%): unknowns counted as not cage-free (= conservative lower bound). CF (33%): each unknown counted as 0.33 cage-free (anchored to Spain's national cage-free production share of approximately 33%). Prior from EggTrack 2024, OBA May 2025 benchmark, and retailer disclosures.*

Of the 5 retailers with listings data, 2 have their CF (0%) inside the prior 50% CI (Carrefour, DIA) and 1 has its CF (33%) inside it (Carrefour). With a well-calibrated 50% CI, 2--3 out of 5 falling inside would be expected; the low count for CF (33%) suggests the prior estimates and listing-level data are measuring somewhat different things (volume-weighted corporate reports vs SKU counts).

*Table 2. Production-code breakdown (chicken shell eggs only).*

| Retailer | n | 0 organic | 1 free-range | 2 barn | 3 caged | unknown |
|---|---:|---:|---:|---:|---:|---:|
| Mercadona | 7 | 0 | 2 | 0 | 4 | 1 |
| Carrefour | 11 | 2 | 4 | 5 | 0 | 0 |
| Eroski | 20 | 2 | 4 | 8 | 1 | 5 |
| Caprabo | 19 | 5 | 3 | 9 | 0 | 2 |
| DIA | 10 | 1 | 1 | 4 | 0 | 4 |

**Carrefour matches the prior cleanly.** All 11 unique SKUs across Madrid + Barcelona postcodes expose `Tipo de produccion` on the detail page; classification is 100% explicit, all cage-free. The 100% point estimate sits inside the 98--100 prior.

**Mercadona shows the largest negative gap.** Four of seven shell-egg SKUs carry the regulator-required `criadas en jaulas` ("caged hens") disclosure; two are `camperas` (free-range); one 24-pack is unclassified. CF (0%) gives 29% (Wilson 95% CI: 8--64%); CF (33%) gives 33%, 32 pp below the prior of 65%. Three non-exclusive explanations could reconcile the gap: (1) corporate figures report sales-volume share, not SKU count, and the two `camperas` lines may carry disproportionate volume; (2) regional warehouse variation -- the scraper queries a single Madrid warehouse (`mad1`), while Mercadona operates 15+ regional hubs with potentially different assortments; (3) reporting lags the current shelf state. OBA's May 2025 benchmark also reports 65% cage-free for Mercadona. Mercadona's public commitment was 100% cage-free by end-2025 (slipped from end-2022); if the 65% figure is accurate, it implies roughly a third of volume still to transition.

**Eroski and DIA: priors appear too pessimistic.** Eroski's 43% blended prior (35% Eroski-standalone + 100% Caprabo) rests on an eight-year-old 2018 FRS baseline, the weakest prior in this analysis. Detail-page enrichment found 14 cage-free, 1 caged, 5 unknown out of 20 shell-egg SKUs; even a 50/50 split on unknowns gives approximately 83%, well outside the 32--58 band. Eroski's EINF 2021 already reported 57% cage-free, and OBA cites Eroski's self-reported approximately 63% (Eroski blog, March 2026), so the 35% FRS anchor understates Eroski's position by 25+ pp even before listings data is considered.

**DIA** CF (0%) (60%, own-brand SKUs via Soysuper) is close to its prior (58%, own + national brands), but the four unqualified own-brand packs (`Huevos M Dia` / `Huevos L Dia`) are heavily category-correlated: if retailer behaviour is "label cage-free SKUs, leave caged ones unqualified," the true share is likely closer to CF (0%) (60%) than CF (33%) (73%). Two caveats: Soysuper covers DIA-brand SKUs only, not third-party brands DIA stocks; and the unknown SKUs are all unqualified "Huevos categoria A clase X" packs, so their housing status will likely resolve together rather than independently.

Combined, Eroski and its Catalan subsidiary Caprabo list 39 shell-egg SKUs (7 organic, 7 free-range, 17 barn, 1 caged, 7 unknown).

**Caprabo** (n=19, Eroski's Catalan subsidiary) has a CF (33%) of 93%, just below the 95--100 prior band; the 2 unknown SKUs pull it slightly under, but CF (0%) (89%) still has a 95% CI (69--97%) overlapping the prior. **Lidl** is not shown here: lidl.es does not list fresh shell eggs online.

![Figure 1](fig1_listings_mix_2026-Q2.png)
*Figure 1. SKU-level production-code mix per retailer (chicken shell eggs only). Mercadona and Eroski are the only retailers with explicitly caged SKUs (4 and 1 respectively); DIA and Eroski carry the highest unknown-classification share. Lidl excluded (no online shell-egg listings).*

![Figure 2](fig2_listings_vs_prior_2026-Q2.png)
*Figure 2. Listings estimates versus prior. Blue boxes = prior (Beta fitted to central + 50% CI); amber boxes = CF (0%) posterior Beta(cf+1, n-cf+1); green boxes = CF (33%) posterior Beta(cf+unknown/3+1, n-cf-unknown/3+1). Each box shows IQR (25th-75th percentile); whiskers = 95% credible interval (2.5th-97.5th).*

## Interpreting the cage-free estimates

The two estimates should not be read in isolation:

1. **CF (0%) understates cage-free share.** Treating every unknown as caged is conservative. Some cage-free SKUs may lack explicit labelling simply because the retailer's catalogue system does not surface the information -- a data-quality gap, not a housing-system signal. For retailers like Eroski, where 5 of 20 SKUs are unknown but 14 are already classified cage-free, treating all unknowns as caged is implausibly conservative. CF (0%) is best suited for external communications where a defensible lower bound is needed.

2. **CF (33%) provides a middle-ground estimate but should be validated.** Each unknown SKU is counted as 0.33 cage-free, anchored to Spain's national cage-free production share (approximately 33%, WATTPoultry 2023). For Mercadona (2 cage-free, 4 caged, 1 unknown), CF (33%) gives 33% -- only 4 pp above CF (0%) because the unknown share is small. For DIA (6 cage-free, 0 caged, 4 unknown), CF (33%) gives 73% versus CF (0%)'s 60% -- a 13 pp difference because unknowns are 40% of the sample and the allocation assumption matters more. Retailers have a marketing incentive to label cage-free products explicitly ("campero," "ecologico," "de suelo"), so unlabelled SKUs are more likely caged than cage-free; neither estimate should be taken at face value when unknown shares exceed 20%.

For retailers with few unknowns (Carrefour: 0; Caprabo: 2), the two estimates converge and this distinction is immaterial. 

## Conclusions

Of the 5 retailers with both listings data and a prior estimate, 1 (Carrefour) has its CF (33%) estimate inside the prior's 50% CI. Four do not: Mercadona (32 pp below prior), Caprabo (7 pp below), Eroski (35 pp above), DIA (15 pp above). However, the CF (0%) Wilson 95% CIs are wide enough to overlap with the prior 50% CI ranges for all four, and for DIA the prior point estimate (58%) falls inside the CF (0%) 95% CI (31--83%). These gaps are therefore directionally informative but not statistically conclusive at conventional confidence levels given the small sample sizes (n = 7--20).

The asymmetry across the gaps is notable: Mercadona's gap is downward (4 of 7 SKUs carry explicit `criadas en jaulas`), while Eroski's and DIA's gaps are upward and rest on small n with high unknown counts. For Eroski and DIA, CF (0%) estimates (70% and 60%) sit much closer to their priors.

**Mercadona shows the largest gap between stated commitment and observed listing behaviour.** With approximately 27% of Spain's EUR 122 billion grocery market ([NielsenIQ 2024](https://www.esmmagazine.com/retail/spanish-grocery-spending-hits-record-e122bn-in-2024-281344); [Kantar Worldpanel](https://www.kantar.com/inspiration/fmcg/spain-top-5-retail-chains-account-for-more-than-half-of-grocery-market-value)), its CF (33%) estimate of 33% sits 32 pp below the self-reported 65%. Even under the most generous allocation of unknowns, Mercadona is the only retailer in this sample where explicitly caged SKUs outnumber cage-free ones. Its original end-2022 cage-free commitment has slipped to end-2025. Mercadona's scale means that its shortfall alone likely accounts for more caged-egg listings than the combined egg catalogues of Eroski and DIA.

**Listing-level data is scarce for most retailers, and listings may not represent what is actually sold.** This analysis counts SKUs, not sales volume. A retailer with 50% cage-free SKUs could still sell 80% caged eggs by volume if caged products are cheap, high-turnover own-brand lines. Corporate figures and EggTrack tracking are typically volume-weighted, so I treat divergence between listings and reported shares as informative but not as evidence of misreporting. On-site shelf audits and purchase-receipt surveys would be more reliable for establishing actual sales volumes.

**On-site shelf audits would ground-truth these listing-level estimates.** [Eglitis & Kanepajs (2026)](https://www.dzivniekubriviba.lv/assets/downloadable-assets/ekonomiska-analize-par-dejejvistu-sprostu-aizlieguma-ietekmi-latvija.pdf) reported results from volunteer-conducted shelf audits across Latvian retailers. A similar volunteer-mobilized approach adapted for Spain's top-5 retailers could close the gap between listing counts and volume shares.

Better data can also come through corporate engagement: cage-free share reporting can be made part of formal agreements during retailer negotiations. But independent on-site investigation remains valuable even with such agreements in place, particularly while standardized reporting practices have not been established across the industry.

## Quarterly watchlist

Stable SKU IDs are written into the schema, so 2026-Q3 will distinguish true SKU additions / removals from label rewording. Specific items to track:

- **Mercadona:** any reduction in the four explicitly caged SKUs (sizes XL/L/L/M, all currently classified `Jaula` in the API).
- **Eroski main:** whether `Huevos L EROSKI 18u`, the single explicitly caged SKU, disappears from the catalogue.
- **DIA:** whether the four unqualified `Huevos M Dia` / `Huevos L Dia` packs become labelled (`de suelo`, `camperos`, etc.). Re-labelling toward cage-free would close the CF (0%) vs CF (33%) gap.
- **Eroski prior update for Q3:** replace the stale 2018 FRS 35% anchor with EINF 2021 (57%) or OBA current (approximately 63%) as the Eroski-main baseline in the blend formula. This reduces the 35 pp gap to a more realistic 15 to 21 pp.
- **Carrefour:** extension to additional postcodes (Andalusia, Valencia, Galicia, Canarias).

## Key sources

| Claim | Source | Tier | Supporting quote |
|---|---|:---:|---|
| Spain national production: 67% caged, 22% barn, 10% free-range, 1% organic (2023 flock) | [WATTPoultry, "Egg sales, consumption break records in Spain"](https://www.wattagnet.com/regions/europe/news/15706648/egg-sales-consumption-break-records-in-spain) | 2 | "Spain houses 67% of its flock in enriched cages." |
| Mercadona 65% cage-free, self-reported | [OBA, Mercadona page](https://observatoriodebienestaranimal.org/actualidad/blog-oba/supermercado-mercadona.html) (citing Mercadona July 2025 reporting) | 2 | Mercadona "repeated that its progress was at 65%, without offering a roadmap." |
| Carrefour 100% fresh, 35% ingredient eggs | [OBA, Carrefour page](https://observatoriodebienestaranimal.org/actualidad/noticias/carrefour.html) | 2 | "Carrefour is only at 35% in its commitment regarding the use of cage-free hen eggs as an ingredient in its private-label products." |
| Eroski 35% cage-free baseline (2018) | [FRS (Food Retail Spain)](https://www.foodretail.es/retailers/eroski-ventas-huevos-gallinas-libres_0_1226877312.html) | 2 | 35% of Eroski's egg sales from cage-free hens (12 Jun 2018). |
| Top-5 retailer market share ~51% of Spanish FMCG | [Kantar Worldpanel, "Spain top 5 retail chains"](https://www.kantar.com/inspiration/fmcg/spain-top-5-retail-chains-account-for-more-than-half-of-grocery-market-value) | 1 | "Together account for more than half of total FMCG spend." |
| Spain grocery spending 2024 = EUR 122 bn | [ESM via NielsenIQ, "Spanish grocery spending hits record EUR 122bn"](https://www.esmmagazine.com/retail/spanish-grocery-spending-hits-record-e122bn-in-2024-281344) | 2 / 1 | NielsenIQ Consumer Trends 2024. |
| EU egg production codes (0 organic, 1 free-range, 2 barn, 3 caged) | [European Commission, Marketing standards for eggs](https://agriculture.ec.europa.eu/farming/animal-products/eggs_en) | 1 | EU regulatory framework. |
| Soysuper (DIA workaround source) | [soysuper.com](https://www.soysuper.com/) | 3 | Aggregator; used because dia.es is Akamai-blocked at the edge. |
| On-site investigation methodology for laying-hen cage-free verification | [Eglitis & Kanepajs, 2026](https://www.dzivniekubriviba.lv/assets/downloadable-assets/ekonomiska-analize-par-dejejvistu-sprostu-aizlieguma-ietekmi-latvija.pdf) | 2 | Field survey of Latvian retailers using volunteer-mobilized shelf audits. |

Tier 1 = primary / regulatory / first-party corporate; Tier 2 = trade press citing primary or independent research; Tier 3 = aggregator or secondary.

## Tools used and AI disclosure

Claude Code (Anthropic) was used for scraper development and drafting and editing of this report.

