const express = require('express');
const db = require('../db');

const router = express.Router();

const BY_CATEGORY = db.prepare(`
  SELECT title, link, category, source, published_at, summary
  FROM news
  WHERE category = ?
  ORDER BY published_at DESC
  LIMIT ?
`);

const ALL = db.prepare(`
  SELECT title, link, category, source, published_at, summary
  FROM news
  ORDER BY published_at DESC
  LIMIT ?
`);

const LAST_UPDATE = db.prepare('SELECT MAX(fetched_at) AS last_fetched FROM news');

router.get('/', (req, res) => {
  const limit = Math.min(parseInt(req.query.limit, 10) || 40, 100);
  const category = (req.query.category || '').toString().trim();
  const rows = category ? BY_CATEGORY.all(category, limit) : ALL.all(limit);
  const { last_fetched } = LAST_UPDATE.get();
  res.json({ count: rows.length, last_fetched, items: rows });
});

module.exports = router;
