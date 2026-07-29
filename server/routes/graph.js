const express = require('express');
const fs = require('fs');
const path = require('path');

const router = express.Router();
const GRAPH_PATH = path.join(__dirname, '..', '..', 'data', 'graph.json');

router.get('/', (req, res) => {
  const data = JSON.parse(fs.readFileSync(GRAPH_PATH, 'utf8'));
  res.json(data);
});

module.exports = router;
