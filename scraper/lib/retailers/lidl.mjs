// Lidl España scraper. Lidl.es does NOT sell fresh groceries online for delivery
// (only non-food bazaar items). Egg listings are not in the searchable online
// catalogue. For the comparison, we rely on:
//   1. EggTrack 2024: Lidl España rated "Leader" (100% cage-free).
//   2. Animal Welfare Observatory (OBA) "Adiós Código 3" April 2025 audit:
//      Lidl confirmed compliant.
//   3. Press: "Lidl is first store in Spain to sell only free-range eggs"
//      (thinkSPAIN, 2018) — initial commitment date.
//
// If the user wants a quarterly listing-level capture for Lidl, the practical
// route is the in-store "folleto" (weekly flyer) PDF or an in-store visit.

export async function scrape() {
  return [{
    retailer: "Lidl",
    source: "external_only",
    name: null,
    note: "Lidl.es online catalogue does not include fresh shell eggs (in-store only). Cage-free status: 100% per EggTrack 2024 (Leader) and OBA April 2025 audit.",
    reported_cage_free_pct: 100,
    eggtrack_status: "Leader",
  }];
}
