const FRANKFURTER_BASE = process.env.FRANKFURTER_URL || 'https://api.frankfurter.dev/v1';

// Currencies commonly relevant to seafarers: crewing/allotment currencies,
// major flag-state and port-call economies, plus the USD/EUR/GBP core.
const SYMBOLS = [
  'USD', 'EUR', 'GBP', 'JPY', 'CNY', 'SGD', 'HKD', 'AUD', 'CAD', 'CHF',
  'NOK', 'INR', 'PHP', 'IDR', 'KRW', 'AED', 'PLN', 'ZAR', 'NZD', 'SEK',
];

async function fetchJson(url) {
  const res = await fetch(url, { headers: { 'User-Agent': 'marine-knows/1.0' } });
  if (!res.ok) throw new Error(`Frankfurter request failed: ${res.status} ${url}`);
  return res.json();
}

// Latest published rates for `base` against the seafarer currency set.
async function fetchLatest(base) {
  const symbols = SYMBOLS.filter((s) => s !== base).join(',');
  const url = `${FRANKFURTER_BASE}/latest?base=${encodeURIComponent(base)}&symbols=${symbols}`;
  return fetchJson(url);
}

// Historical daily rates for `base` over [from, to] (YYYY-MM-DD), used to
// build the trend-based forecast.
async function fetchHistory(base, from, to) {
  const symbols = SYMBOLS.filter((s) => s !== base).join(',');
  const url = `${FRANKFURTER_BASE}/${from}..${to}?base=${encodeURIComponent(base)}&symbols=${symbols}`;
  return fetchJson(url);
}

module.exports = { fetchLatest, fetchHistory, SYMBOLS };
