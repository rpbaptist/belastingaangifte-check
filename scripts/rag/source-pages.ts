export interface SourcePage {
  url: string;
  title: string;
  topic: string;
}

// Curated set matching what the analyzer/rule-checks already cover. Hand-verified against
// the live site while this list was built; re-verify against the live site and the two
// sitemaps (https://www.belastingdienst.nl/wps/wcm/connect/bldsysteem/seo-dv/sitemap-dv.xml,
// .../seo-bieb/sitemap-bieb.xml) before re-running the scraper, since Belastingdienst
// restructures these paths periodically.
export const SOURCE_PAGES: SourcePage[] = [
  // Box 3 / heffingsvrij vermogen
  {
    url: "https://www.belastingdienst.nl/wps/wcm/connect/nl/box-3/box-3",
    title: "Box 3",
    topic: "box3",
  },
  {
    url: "https://www.belastingdienst.nl/wps/wcm/connect/nl/box-3/content/heffingsvrij-vermogen",
    title: "Heffingsvrij vermogen",
    topic: "box3",
  },
  {
    url: "https://www.belastingdienst.nl/wps/wcm/connect/nl/box-3/content/berekening-box-3-inkomen-2025",
    title: "Berekening box 3 inkomen",
    topic: "box3",
  },
  {
    url: "https://www.belastingdienst.nl/wps/wcm/connect/bldcontentnl/belastingdienst/prive/inkomstenbelasting/heffingskortingen_boxen_tarieven/boxen_en_tarieven/box_3/box_3",
    title: "Boxen en tarieven box 3",
    topic: "box3",
  },

  // Hypotheekrenteaftrek
  {
    url: "https://www.belastingdienst.nl/wps/wcm/connect/bldcontentnl/belastingdienst/prive/inkomstenbelasting/aftrekposten/hypotheekrenteaftrek/",
    title: "Hypotheekrenteaftrek",
    topic: "hypotheek",
  },
  {
    url: "https://www.belastingdienst.nl/wps/wcm/connect/nl/koopwoning/content/hypotheekrente-aftrekken",
    title: "Mag ik mijn hypotheekrente altijd aftrekken?",
    topic: "hypotheek",
  },
  {
    url: "https://www.belastingdienst.nl/wps/wcm/connect/nl/koopwoning/content/hypotheekrenteaftrek-bij-oversluiten-hypotheek",
    title: "Hypotheekrenteaftrek bij oversluiten hypotheek",
    topic: "hypotheek",
  },
  {
    url: "https://www.belastingdienst.nl/wps/wcm/connect/bldcontentnl/belastingdienst/prive/woning/eigenwoningforfait/geen_of_een_kleine_eigenwoningschuld/geen_of_een_kleine_eigenwoningschuld",
    title: "Geen of een kleine eigenwoningschuld (Wet Hillen)",
    topic: "hypotheek",
  },
  {
    url: "https://www.belastingdienst.nl/wps/wcm/connect/bldcontentnl/belastingdienst/prive/woning/uw_hypotheek_of_lening/uw_hypotheek_of_lening",
    title: "Uw hypotheek of lening",
    topic: "hypotheek",
  },

  // Dividendbelasting
  {
    url: "https://www.belastingdienst.nl/wps/wcm/connect/bldcontentnl/belastingdienst/zakelijk/winst/dividendbelasting/als_u_dividend_ontvangt/als_u_dividend_ontvangt",
    title: "Als u dividend ontvangt",
    topic: "dividend",
  },
  {
    url: "https://www.belastingdienst.nl/wps/wcm/connect/bldcontentnl/belastingdienst/zakelijk/internationaal/vermogen/teruggaaf_of_vrijstelling_van_buitenlandse_bronbelasting/",
    title: "Teruggaaf of vrijstelling van buitenlandse bronbelasting",
    topic: "dividend",
  },

  // Algemene aftrekposten
  {
    url: "https://www.belastingdienst.nl/wps/wcm/connect/bldcontentnl/belastingdienst/prive/inkomstenbelasting/aftrekposten/aftrekposten",
    title: "Aftrekposten",
    topic: "aftrekposten",
  },
  {
    url: "https://www.belastingdienst.nl/wps/wcm/connect/nl/aftrek-en-kortingen/aftrek-en-kortingen",
    title: "Aftrek en kortingen",
    topic: "aftrekposten",
  },
  {
    url: "https://www.belastingdienst.nl/wps/wcm/connect/bldcontentnl/belastingdienst/prive/inkomstenbelasting/aftrekposten/persoonsgebonden-aftrek/",
    title: "Persoonsgebonden aftrek",
    topic: "aftrekposten",
  },
  {
    url: "https://www.belastingdienst.nl/wps/wcm/connect/nl/belastingaangifte/content/aangiftechecklist",
    title: "Aangiftechecklist",
    topic: "aftrekposten",
  },
];

// Defensive guard: none of the curated URLs above should ever fall under these prefixes.
// Checked against robots.txt at planning time — kept here so a future edit to the list
// can't silently violate it.
export const DISALLOWED_PATH_PREFIXES = [
  "/config/",
  "/data/",
  "/monitor/",
  "/wps/wcm/connect/bldontwerp/",
  "/wps/wcm/connect/bldcontentnl/niet_in_enig_menu/",
];

export function isDisallowed(url: string): boolean {
  const path = new URL(url).pathname;
  return DISALLOWED_PATH_PREFIXES.some((prefix) => path.startsWith(prefix));
}
