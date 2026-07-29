#!/usr/bin/env node
// Pulls maritime news RSS feeds listed in data/news-sources.json, classifies
// each item into business/tech/accidents/other, and stores new items in
// SQLite. Run periodically via cron; safe to re-run (guid is unique).
const fs = require('fs');
const path = require('path');
const Parser = require('rss-parser');
const db = require('../server/db');
const { classify } = require('../server/lib/newsClassify');

const SOURCES_PATH = path.join(__dirname, '..', 'data', 'news-sources.json');
const parser = new Parser({ timeout: 15000 });

const INSERT = db.prepare(`
  INSERT OR IGNORE INTO news (guid, title, link, category, source, published_at, summary)
  VALUES (@guid, @title, @link, @category, @source, @published_at, @summary)
`);

function stripHtml(html) {
  if (!html) return '';
  return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 400);
}

async function fetchSource(source) {
  let feed;
  try {
    feed = await parser.parseURL(source.feedUrl);
  } catch (err) {
    console.error(`[news] Failed to fetch ${source.name} (${source.feedUrl}): ${err.message}`);
    return 0;
  }

  let inserted = 0;
  for (const item of feed.items || []) {
    const guid = item.guid || item.link || item.id;
    if (!guid) continue;
    const summary = stripHtml(item.contentSnippet || item.content || item.summary);
    const category = classify(item.title, summary, source.defaultCategory);
    const info = INSERT.run({
      guid,
      title: item.title || '(untitled)',
      link: item.link || '',
      category,
      source: source.name,
      published_at: item.isoDate || item.pubDate || new Date().toISOString(),
      summary,
    });
    if (info.changes) inserted += 1;
  }
  console.log(`[news] ${source.name}: ${inserted} new item(s) of ${feed.items?.length ?? 0} fetched.`);
  return inserted;
}

async function main() {
  const sources = JSON.parse(fs.readFileSync(SOURCES_PATH, 'utf8'));
  let total = 0;
  for (const source of sources) {
    total += await fetchSource(source);
  }
  console.log(`[news] Done. ${total} new item(s) inserted.`);
}

main().then(() => process.exit(0));
