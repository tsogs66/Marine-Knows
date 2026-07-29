const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

const DATA_DIR = path.join(__dirname, '..', 'data');
const DB_PATH = process.env.MARINE_KNOWS_DB || path.join(DATA_DIR, 'marine-knows.db');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS articles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  category TEXT NOT NULL,
  summary TEXT NOT NULL,
  source_name TEXT,
  source_url TEXT,
  tags TEXT,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS sections (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  article_id INTEGER NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
  heading TEXT NOT NULL,
  anchor TEXT NOT NULL,
  order_idx INTEGER NOT NULL,
  body TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sections_article ON sections(article_id);

CREATE VIRTUAL TABLE IF NOT EXISTS sections_fts USING fts5(
  heading,
  body,
  content='sections',
  content_rowid='id'
);

CREATE TRIGGER IF NOT EXISTS sections_ai AFTER INSERT ON sections BEGIN
  INSERT INTO sections_fts(rowid, heading, body) VALUES (new.id, new.heading, new.body);
END;
CREATE TRIGGER IF NOT EXISTS sections_ad AFTER DELETE ON sections BEGIN
  INSERT INTO sections_fts(sections_fts, rowid, heading, body) VALUES('delete', old.id, old.heading, old.body);
END;
CREATE TRIGGER IF NOT EXISTS sections_au AFTER UPDATE ON sections BEGIN
  INSERT INTO sections_fts(sections_fts, rowid, heading, body) VALUES('delete', old.id, old.heading, old.body);
  INSERT INTO sections_fts(rowid, heading, body) VALUES (new.id, new.heading, new.body);
END;

CREATE VIRTUAL TABLE IF NOT EXISTS articles_fts USING fts5(
  title,
  summary,
  tags,
  content='articles',
  content_rowid='id'
);

CREATE TRIGGER IF NOT EXISTS articles_ai AFTER INSERT ON articles BEGIN
  INSERT INTO articles_fts(rowid, title, summary, tags) VALUES (new.id, new.title, new.summary, new.tags);
END;
CREATE TRIGGER IF NOT EXISTS articles_ad AFTER DELETE ON articles BEGIN
  INSERT INTO articles_fts(articles_fts, rowid, title, summary, tags) VALUES('delete', old.id, old.title, old.summary, old.tags);
END;
CREATE TRIGGER IF NOT EXISTS articles_au AFTER UPDATE ON articles BEGIN
  INSERT INTO articles_fts(articles_fts, rowid, title, summary, tags) VALUES('delete', old.id, old.title, old.summary, old.tags);
  INSERT INTO articles_fts(rowid, title, summary, tags) VALUES (new.id, new.title, new.summary, new.tags);
END;

CREATE TABLE IF NOT EXISTS news (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guid TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  link TEXT NOT NULL,
  category TEXT NOT NULL,
  source TEXT NOT NULL,
  published_at TEXT,
  summary TEXT,
  fetched_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_news_category ON news(category);
CREATE INDEX IF NOT EXISTS idx_news_published ON news(published_at);

CREATE TABLE IF NOT EXISTS currency_rates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  base TEXT NOT NULL,
  quote TEXT NOT NULL,
  rate REAL NOT NULL,
  rate_date TEXT NOT NULL,
  UNIQUE(base, quote, rate_date)
);

CREATE INDEX IF NOT EXISTS idx_currency_lookup ON currency_rates(base, quote, rate_date);
`);

module.exports = db;
