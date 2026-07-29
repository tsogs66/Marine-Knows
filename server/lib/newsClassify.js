// Keyword-based classification into the four categories the site shows:
// business, tech, accidents, other. Checked in priority order so a story
// about e.g. a fire on an autonomous ship lands under "accidents" first.
const RULES = [
  {
    category: 'accidents',
    keywords: [
      'collision', 'grounding', 'ground on', 'sinking', 'sank', 'sunk', 'fire on board',
      'fire onboard', 'explosion', 'oil spill', 'spill', 'rescue', 'distress', 'capsiz',
      'casualty', 'incident', 'allision', 'mayday', 'abandon ship', 'lifeboat', 'injured',
      'fatality', 'fatalities', 'died', 'death', 'wreck', 'salvage', 'man overboard',
      'piracy', 'hijack', 'stowaway', 'search and rescue',
    ],
  },
  {
    category: 'tech',
    keywords: [
      'autonomous', 'digital', 'artificial intelligence', ' ai ', 'battery', 'hydrogen',
      'ammonia', 'methanol', 'decarboni', 'emission', 'retrofit', 'software', 'sensor',
      'satellite', 'automation', 'green fuel', 'lng-fuel', 'electric vessel', 'drone',
      'cyber', 'data platform', 'smart shipping', 'zero-emission', 'wind-assist',
    ],
  },
  {
    category: 'business',
    keywords: [
      'freight rate', 'charter', 'merger', 'acquisition', 'ipo', 'earnings', 'contract',
      'order book', 'newbuild order', 'shipyard order', 'financing', 'shares', 'stock',
      'market', 'tariff', 'trade war', 'freight market', 'container rates', 'box rates',
      'bunker price', 'profit', 'revenue', 'investment', 'shipping line',
    ],
  },
];

function classify(title, summary, fallback) {
  const text = `${title || ''} ${summary || ''}`.toLowerCase();
  for (const rule of RULES) {
    if (rule.keywords.some((kw) => text.includes(kw))) return rule.category;
  }
  return fallback || 'other';
}

module.exports = { classify };
