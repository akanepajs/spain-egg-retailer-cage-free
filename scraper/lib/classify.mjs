// EU egg-marking codes:
//   0 = organic, 1 = free-range, 2 = barn (cage-free indoor), 3 = caged
// The retailer-facing Spanish vocabulary maps to these codes.
// We classify in two passes: first by an explicit "tipo de producción" field
// if the source provides one, then by keyword in the product name.

const NAME_PATTERNS = [
  // Order matters: more specific patterns first.
  // Catalan vocab is included for Caprabo (Eroski Group's Catalonia banner).
  { code: 0, regex: /\b(eco|ecol[oó]gic|ecològic|biol[oó]gic|orgánic|viubio)/i, label: "organic" },
  { code: 0, regex: /\bbio\b/i, label: "organic" },
  { code: 1, regex: /\b(camper[oa]s?|camperol|caser[ií]o|free[\s-]?range)\b/i, label: "free-range" },
  { code: 2, regex: /\b(suelo|en suelo|criadas? en suelo|barn|gallinas en suelo|s[oò]l|terra)\b/i, label: "barn" },
  { code: 3, regex: /\b(jaula|jaulas acondicionadas|caged)\b/i, label: "caged" },
];

const FIELD_MAP = {
  // Carrefour "Tipo de producción" field
  "ecológicos": 0, "ecológico": 0, "ecologicos": 0, "ecologico": 0, "bio": 0, "biológico": 0,
  "campero": 1, "camperos": 1, "campera": 1, "camperas": 1,
  "suelo": 2, "barn": 2, "sòl": 2, "terra": 2,
  "jaula": 3, "jaulas": 3, "caged": 3,
};

const CODE_LABEL = { 0: "organic", 1: "free-range", 2: "barn", 3: "caged" };

export function classify(product) {
  // product: { name, tipo_produccion?, ... }
  const rawTipo = (product.tipo_produccion || "").trim().toLowerCase();
  if (rawTipo && FIELD_MAP[rawTipo] !== undefined) {
    return { code: FIELD_MAP[rawTipo], source: "tipo_produccion_field", confidence: "high" };
  }
  const name = product.name || "";
  for (const p of NAME_PATTERNS) {
    if (p.regex.test(name)) {
      return { code: p.code, source: "name_keyword", confidence: "medium" };
    }
  }
  return { code: null, source: "unknown", confidence: "low" };
}

export function isShellEgg(product) {
  // Exclude products outside the cage-free shell-egg debate:
  //   - liquid egg / egg whites (claras): processed product, not shell eggs
  //   - quail (codorniz / codorniu): different species, separate market
  //   - cooked eggs (huevos cocidos / ous cuits): housing-system disclosure
  //     not standard on cooked-and-peeled hard-boiled packs even though they
  //     come from laying hens; treated as out of scope for the listing audit.
  const n = (product.name || "").toLowerCase();
  if (/\bclara[s]? de huevo|claras? d'?ou|liquid egg/.test(n)) return false;
  if (/codorniz|codorniu|quail/.test(n)) return false;
  if (/\bcocidos?\b|\bcocido\b|\bcuits?\b|\bcuit\b|hard[\s-]?boiled/.test(n)) return false;
  return true;
}

export function codeLabel(code) { return code === null ? "unknown" : CODE_LABEL[code]; }
export function isCageFree(code) { return code === 0 || code === 1 || code === 2; }
