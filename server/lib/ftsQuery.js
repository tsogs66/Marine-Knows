// Build a safe FTS5 MATCH expression from raw user input.
// Tokenizes on whitespace, strips characters that have special meaning in
// FTS5 query syntax, and appends a prefix wildcard to each token so partial
// words ("marp" -> "marpol") still match. Tokens are ANDed together (FTS5's
// default when tokens are space-separated), and quoted phrases are passed
// through as exact-phrase prefix matches.
function buildMatchQuery(raw) {
  if (!raw || typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const phraseMatches = trimmed.match(/"([^"]+)"/g) || [];
  let remainder = trimmed.replace(/"([^"]+)"/g, ' ');

  const clean = (s) => s.replace(/[^\p{L}\p{N}\s-]/gu, ' ').trim();

  const parts = [];

  for (const phrase of phraseMatches) {
    const inner = clean(phrase.slice(1, -1));
    if (inner) parts.push(`"${inner}"`);
  }

  const words = clean(remainder).split(/\s+/).filter(Boolean);
  for (const w of words) {
    if (w.length < 2) continue;
    parts.push(`${w}*`);
  }

  if (!parts.length) return null;
  return parts.join(' ');
}

module.exports = { buildMatchQuery };
