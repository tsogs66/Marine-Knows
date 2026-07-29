const express = require('express');
const db = require('../db');

const router = express.Router();

const LIST = db.prepare('SELECT slug, title, category, summary, source_name FROM articles ORDER BY category, title');
const CATEGORIES = db.prepare(`
  SELECT category, COUNT(*) AS count FROM articles GROUP BY category ORDER BY category
`);
const GET_BY_SLUG = db.prepare('SELECT * FROM articles WHERE slug = ?');
const GET_SECTIONS = db.prepare('SELECT heading, anchor, order_idx, body FROM sections WHERE article_id = ? ORDER BY order_idx');

router.get('/', (req, res) => {
  const category = (req.query.category || '').toString().trim();
  let rows = LIST.all();
  if (category) {
    rows = rows.filter((r) => r.category.toLowerCase() === category.toLowerCase());
  }
  res.json({ count: rows.length, articles: rows });
});

router.get('/categories', (req, res) => {
  res.json({ categories: CATEGORIES.all() });
});

router.get('/:slug', (req, res) => {
  const article = GET_BY_SLUG.get(req.params.slug);
  if (!article) return res.status(404).json({ error: 'Not found' });
  const sections = GET_SECTIONS.all(article.id);
  res.json({ ...article, sections });
});

module.exports = router;
