const express = require('express');
const db = require('../db');
const { linearForecast } = require('../lib/forecast');
const { SYMBOLS } = require('../lib/currency');

const router = express.Router();

const HISTORY = db.prepare(`
  SELECT quote, rate, rate_date
  FROM currency_rates
  WHERE base = ?
  ORDER BY rate_date ASC
`);

router.get('/', (req, res) => {
  const base = (req.query.base || 'USD').toString().toUpperCase();
  if (!SYMBOLS.includes(base)) {
    return res.status(400).json({ error: `Unsupported base currency. Use one of: ${SYMBOLS.join(', ')}` });
  }

  const rows = HISTORY.all(base);
  if (!rows.length) {
    return res.status(503).json({
      error: 'No exchange rate data yet. Run `npm run update-currency` or wait for the scheduled cron job.',
    });
  }

  const byQuote = new Map();
  for (const row of rows) {
    if (!byQuote.has(row.quote)) byQuote.set(row.quote, []);
    byQuote.get(row.quote).push(row);
  }

  const dateIndex = new Map();
  let idx = 0;
  for (const row of rows) {
    if (!dateIndex.has(row.rate_date)) dateIndex.set(row.rate_date, idx++);
  }

  const results = [];
  let asOf = null;

  for (const [quote, series] of byQuote.entries()) {
    series.sort((a, b) => (a.rate_date < b.rate_date ? -1 : 1));
    const latest = series[series.length - 1];
    if (!asOf || latest.rate_date > asOf) asOf = latest.rate_date;

    const points = series.map((r) => [dateIndex.get(r.rate_date), r.rate]);
    const forecast1w = linearForecast(points, 7);
    const forecast1m = linearForecast(points, 30);

    results.push({
      quote,
      rate: latest.rate,
      as_of: latest.rate_date,
      history_points: series.length,
      forecast_1w: forecast1w !== null ? Number(forecast1w.toFixed(6)) : null,
      forecast_1m: forecast1m !== null ? Number(forecast1m.toFixed(6)) : null,
    });
  }

  results.sort((a, b) => a.quote.localeCompare(b.quote));

  res.json({
    base,
    as_of: asOf,
    disclaimer:
      'Forecasts are a simple linear trend projected from recent daily rates (ECB reference rates via Frankfurter). ' +
      'They are indicative only and are not financial advice.',
    rates: results,
  });
});

module.exports = router;
