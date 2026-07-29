const path = require('path');
const express = require('express');
const db = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use('/api/search', require('./routes/search'));
app.use('/api/articles', require('./routes/articles'));
app.use('/api/reference', require('./routes/reference'));
app.use('/api/news', require('./routes/news'));
app.use('/api/currency', require('./routes/currency'));
app.use('/api/graph', require('./routes/graph'));

app.get('/healthz', (req, res) => {
  const row = db.prepare('SELECT COUNT(*) AS n FROM articles').get();
  res.json({ ok: true, articles: row.n });
});

app.use(express.static(path.join(__dirname, '..', 'public')));

app.use((req, res) => {
  res.status(404).sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Marine-Knows listening on port ${PORT}`);
});
