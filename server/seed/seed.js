#!/usr/bin/env node
// Loads every data/articles/*.json file into SQLite. Idempotent: re-running
// replaces an article's sections in place (matched by slug) so content can
// be edited and re-seeded without duplicating rows.
const fs = require('fs');
const path = require('path');
const db = require('../db');

const ARTICLES_DIR = path.join(__dirname, '..', '..', 'data', 'articles');

function slugifyAnchor(heading) {
  return heading
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

const UPSERT_ARTICLE = db.prepare(`
  INSERT INTO articles (slug, title, category, summary, source_name, source_url, tags, updated_at)
  VALUES (@slug, @title, @category, @summary, @source_name, @source_url, @tags, CURRENT_TIMESTAMP)
  ON CONFLICT(slug) DO UPDATE SET
    title = excluded.title,
    category = excluded.category,
    summary = excluded.summary,
    source_name = excluded.source_name,
    source_url = excluded.source_url,
    tags = excluded.tags,
    updated_at = CURRENT_TIMESTAMP
`);

const GET_ARTICLE_ID = db.prepare('SELECT id FROM articles WHERE slug = ?');
const DELETE_SECTIONS = db.prepare('DELETE FROM sections WHERE article_id = ?');
const INSERT_SECTION = db.prepare(`
  INSERT INTO sections (article_id, heading, anchor, order_idx, body)
  VALUES (@article_id, @heading, @anchor, @order_idx, @body)
`);

const seedAll = db.transaction((articles) => {
  for (const article of articles) {
    UPSERT_ARTICLE.run({
      slug: article.slug,
      title: article.title,
      category: article.category,
      summary: article.summary,
      source_name: article.source_name || null,
      source_url: article.source_url || null,
      tags: article.tags || '',
    });
    const { id } = GET_ARTICLE_ID.get(article.slug);
    DELETE_SECTIONS.run(id);
    (article.sections || []).forEach((section, idx) => {
      INSERT_SECTION.run({
        article_id: id,
        heading: section.heading,
        anchor: slugifyAnchor(section.heading),
        order_idx: idx,
        body: section.body,
      });
    });
  }
});

function main() {
  const files = fs.readdirSync(ARTICLES_DIR).filter((f) => f.endsWith('.json'));
  let all = [];
  for (const file of files) {
    const content = JSON.parse(fs.readFileSync(path.join(ARTICLES_DIR, file), 'utf8'));
    all = all.concat(Array.isArray(content) ? content : [content]);
  }
  seedAll(all);
  console.log(`Seeded ${all.length} articles from ${files.length} file(s).`);
}

main();
