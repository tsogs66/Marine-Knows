const express = require('express');
const fs = require('fs');
const path = require('path');

const router = express.Router();
const REF_DIR = path.join(__dirname, '..', '..', 'data', 'reference');

const ALLOWED = new Set(['conversions', 'deck', 'engine', 'galley']);

router.get('/', (req, res) => {
  const files = fs.readdirSync(REF_DIR).filter((f) => f.endsWith('.json'));
  res.json({ sections: files.map((f) => f.replace(/\.json$/, '')) });
});

router.get('/:section', (req, res) => {
  const section = req.params.section;
  if (!ALLOWED.has(section)) return res.status(404).json({ error: 'Unknown reference section' });
  const file = path.join(REF_DIR, `${section}.json`);
  if (!fs.existsSync(file)) return res.status(404).json({ error: 'Not found' });
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  res.json(data);
});

module.exports = router;
