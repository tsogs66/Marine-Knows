#!/usr/bin/env node
// Fetches current + historical exchange rates from the Frankfurter API
// (ECB reference rates, no API key required) and stores them in SQLite.
// Run daily via cron; safe to re-run (INSERT OR IGNORE on unique base/quote/date).
const db = require('../server/db');
const { fetchLatest, fetchHistory, SYMBOLS } = require('../server/lib/currency');

const BASES = ['USD', 'EUR'];
const HISTORY_DAYS = 60;

const INSERT = db.prepare(`
  INSERT OR IGNORE INTO currency_rates (base, quote, rate, rate_date)
  VALUES (@base, @quote, @rate, @rate_date)
`);

const insertMany = db.transaction((rows) => {
  for (const row of rows) INSERT.run(row);
});

function toDateStr(d) {
  return d.toISOString().slice(0, 10);
}

async function backfillIfNeeded(base) {
  const { count } = db
    .prepare('SELECT COUNT(*) AS count FROM currency_rates WHERE base = ?')
    .get(base);
  if (count > SYMBOLS.length) return; // already have more than a single day's worth

  const to = new Date();
  const from = new Date(to.getTime() - HISTORY_DAYS * 24 * 60 * 60 * 1000);
  console.log(`Backfilling ${HISTORY_DAYS}d of history for base ${base}...`);
  const history = await fetchHistory(base, toDateStr(from), toDateStr(to));
  const rows = [];
  for (const [date, rates] of Object.entries(history.rates || {})) {
    for (const [quote, rate] of Object.entries(rates)) {
      rows.push({ base, quote, rate, rate_date: date });
    }
  }
  insertMany(rows);
  console.log(`Inserted ${rows.length} historical rate points for ${base}.`);
}

async function updateLatest(base) {
  const latest = await fetchLatest(base);
  const rows = Object.entries(latest.rates || {}).map(([quote, rate]) => ({
    base,
    quote,
    rate,
    rate_date: latest.date,
  }));
  insertMany(rows);
  console.log(`Updated ${rows.length} rates for base ${base} (${latest.date}).`);
}

async function main() {
  for (const base of BASES) {
    try {
      await backfillIfNeeded(base);
      await updateLatest(base);
    } catch (err) {
      console.error(`Currency update failed for base ${base}:`, err.message);
    }
  }
}

main().then(() => process.exit(0));
