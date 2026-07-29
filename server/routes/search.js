const express = require('express');
const db = require('../db');
const { buildMatchQuery } = require('../lib/ftsQuery');

const router = express.Router();

const SECTION_SEARCH = db.prepare(`
  SELECT
    s.id AS section_id,
    s.article_id,
    s.heading,
    s.anchor,
    s.order_idx,
    snippet(sections_fts, 1, '<mark>', '</mark>', ' … ', 28) AS snippet,
    bm25(sections_fts, 2.0, 1.0) AS rank
  FROM sections_fts
  JOIN sections s ON s.id = sections_fts.rowid
  WHERE sections_fts MATCH ?
  ORDER BY rank
  LIMIT 60
`);

const ARTICLE_SEARCH = db.prepare(`
  SELECT
    a.id AS article_id,
    bm25(articles_fts, 3.0, 1.0, 1.5) AS rank
  FROM articles_fts
  JOIN articles a ON a.id = articles_fts.rowid
  WHERE articles_fts MATCH ?
  ORDER BY rank
  LIMIT 60
`);

const GET_ARTICLE = db.prepare('SELECT * FROM articles WHERE id = ?');
const FIRST_SECTION = db.prepare('SELECT * FROM sections WHERE article_id = ? ORDER BY order_idx LIMIT 1');

router.get('/', (req, res) => {
  const q = (req.query.q || '').toString();
  const category = (req.query.category || '').toString().trim();
  const match = buildMatchQuery(q);

  if (!match) {
    return res.json({ query: q, count: 0, results: [] });
  }

  let sectionRows = [];
  let articleRows = [];
  try {
    sectionRows = SECTION_SEARCH.all(match);
  } catch (e) {
    // Malformed FTS query (edge-case input) - degrade gracefully.
    sectionRows = [];
  }
  try {
    articleRows = ARTICLE_SEARCH.all(match);
  } catch (e) {
    articleRows = [];
  }

  const byArticle = new Map();

  for (const row of sectionRows) {
    const existing = byArticle.get(row.article_id);
    if (!existing || row.rank < existing.rank) {
      byArticle.set(row.article_id, {
        article_id: row.article_id,
        rank: row.rank,
        heading: row.heading,
        anchor: row.anchor,
        snippet: row.snippet,
      });
    }
  }

  for (const row of articleRows) {
    if (!byArticle.has(row.article_id)) {
      const first = FIRST_SECTION.get(row.article_id);
      byArticle.set(row.article_id, {
        article_id: row.article_id,
        rank: row.rank + 5, // article-title-only matches rank slightly lower
        heading: first ? first.heading : null,
        anchor: first ? first.anchor : null,
        snippet: null,
      });
    }
  }

  let results = Array.from(byArticle.values());

  results = results
    .map((r) => {
      const article = GET_ARTICLE.get(r.article_id);
      if (!article) return null;
      return { ...r, article };
    })
    .filter(Boolean);

  if (category) {
    results = results.filter((r) => r.article.category.toLowerCase() === category.toLowerCase());
  }

  results.sort((a, b) => a.rank - b.rank);
  results = results.slice(0, 30);

  const payload = results.map((r) => ({
    slug: r.article.slug,
    title: r.article.title,
    category: r.article.category,
    source_name: r.article.source_name,
    source_url: r.article.source_url,
    section_heading: r.heading,
    anchor: r.anchor,
    snippet: r.snippet || r.article.summary,
  }));

  res.json({ query: q, count: payload.length, results: payload });
});

module.exports = router;
