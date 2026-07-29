(function () {
  const app = document.getElementById('app');
  const headerForm = document.getElementById('header-search-form');
  const headerInput = document.getElementById('header-search-input');
  const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let graphRAF = null;

  function stopGraphAnimation() {
    if (graphRAF) { cancelAnimationFrame(graphRAF); graphRAF = null; }
  }

  function el(html) {
    const t = document.createElement('template');
    t.innerHTML = html.trim();
    return t.content.firstElementChild;
  }

  // Appends every top-level node of an HTML snippet to `container` (unlike
  // el(), which only keeps the first root — needed for blocks that render
  // multiple sibling elements, e.g. a heading + subtitle + content div).
  function appendHtml(container, html) {
    const t = document.createElement('template');
    t.innerHTML = html.trim();
    container.appendChild(t.content);
  }

  function escapeHtml(s) {
    return (s || '').toString()
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  async function getJson(url) {
    const res = await fetch(url);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || `Request failed (${res.status})`);
    }
    return res.json();
  }

  function setActiveNav(hashPrefix) {
    document.querySelectorAll('.main-nav a').forEach((a) => {
      a.classList.toggle('active', a.getAttribute('href') === hashPrefix);
    });
  }

  // ---------- Theme switcher ----------

  function initThemeSwitcher() {
    const root = document.documentElement;
    const buttons = document.querySelectorAll('#theme-switcher [data-theme-choice]');
    const current = root.getAttribute('data-theme') || 'deep-sea';

    function apply(theme) {
      root.setAttribute('data-theme', theme);
      localStorage.setItem('mk-theme', theme);
      buttons.forEach((b) => b.classList.toggle('active', b.dataset.themeChoice === theme));
    }

    buttons.forEach((b) => b.addEventListener('click', () => apply(b.dataset.themeChoice)));
    apply(current);
  }

  const HERO_SCENE = `
    <div class="hero-scene" aria-hidden="true">
      <svg class="compass-rose" viewBox="0 0 100 100">
        <circle cx="50" cy="50" r="46" fill="none" stroke="currentColor" stroke-width="1.5"/>
        <circle cx="50" cy="50" r="3" fill="currentColor"/>
        <path d="M50,6 L58,50 L50,42 L42,50 Z" fill="currentColor"/>
        <path d="M50,94 L58,50 L50,58 L42,50 Z" fill="currentColor" opacity="0.5"/>
        <path d="M6,50 L50,58 L42,50 L50,42 Z" fill="currentColor" opacity="0.5"/>
        <path d="M94,50 L50,58 L58,50 L50,42 Z" fill="currentColor" opacity="0.5"/>
      </svg>
      <svg class="gull g1" viewBox="0 0 24 12"><path d="M0,10 Q6,0 12,10 Q18,0 24,10" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>
      <svg class="gull g2" viewBox="0 0 24 12"><path d="M0,10 Q6,0 12,10 Q18,0 24,10" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>
      <svg class="sailing-ship" viewBox="0 0 90 60">
        <path class="sail" d="M45,6 L45,38 L20,38 Z"/>
        <path class="sail" d="M47,10 L47,38 L66,38 Z"/>
        <line x1="45" y1="4" x2="45" y2="40" stroke="currentColor" stroke-width="1.5"/>
        <path class="hull" d="M10,40 L80,40 L68,54 L22,54 Z"/>
      </svg>
    </div>
  `;

  // ---------- Views ----------

  function renderHome() {
    setActiveNav('#/');
    app.innerHTML = '';
    app.appendChild(el(`
      <section class="hero">
        ${HERO_SCENE}
        <h1>Search the maritime rulebook</h1>
        <p>IMO conventions, MARPOL, SOLAS, STCW, ISPS, MLC and more — search publications and jump straight to the relevant section.</p>
        <form class="big-search" id="home-search-form">
          <input type="search" id="home-search-input" placeholder="e.g. &quot;ballast water exchange&quot; or &quot;hours of rest&quot;" autocomplete="off">
          <button type="submit">Search</button>
        </form>
        <div class="quick-links">
          <a href="#/publications">Browse all publications</a>
          <a href="#/explore">Explore the network</a>
          <a href="#/reference">Deck / Engine / Galley reference</a>
          <a href="#/news">Maritime news</a>
          <a href="#/currency">Currency converter</a>
        </div>
      </section>
    `));
    document.getElementById('home-search-form').addEventListener('submit', (e) => {
      e.preventDefault();
      const q = document.getElementById('home-search-input').value.trim();
      if (q) location.hash = `#/search?q=${encodeURIComponent(q)}`;
    });
  }

  async function renderSearch(params) {
    setActiveNav('#/');
    const q = params.get('q') || '';
    headerInput.value = q;
    app.innerHTML = '';
    appendHtml(app, `
      <h2 class="page-title">Search results</h2>
      <p class="page-sub" id="search-sub">Searching for "${escapeHtml(q)}"…</p>
      <div id="search-results"></div>
    `);
    const resultsBox = document.getElementById('search-results');
    if (!q) {
      document.getElementById('search-sub').textContent = 'Enter a search term above.';
      return;
    }
    try {
      const data = await getJson(`/api/search?q=${encodeURIComponent(q)}`);
      document.getElementById('search-sub').textContent =
        `${data.count} result${data.count === 1 ? '' : 's'} for "${q}"`;
      if (!data.count) {
        resultsBox.innerHTML = '<p class="empty">No matches. Try a broader term (e.g. "fire" instead of "firefighting equipment").</p>';
        return;
      }
      resultsBox.innerHTML = '';
      data.results.forEach((r) => {
        const link = `#/article/${r.slug}${r.anchor ? `?section=${r.anchor}` : ''}`;
        resultsBox.appendChild(el(`
          <a class="card result-card" href="${link}" style="display:block;">
            <div class="meta"><span class="badge">${escapeHtml(r.category)}</span> &nbsp;${escapeHtml(r.source_name || '')}</div>
            <h3>${escapeHtml(r.title)}</h3>
            ${r.section_heading ? `<div class="section-tag">§ ${escapeHtml(r.section_heading)}</div>` : ''}
            <div class="snippet">${r.snippet || ''}</div>
          </a>
        `));
      });
    } catch (err) {
      resultsBox.innerHTML = `<p class="error">${escapeHtml(err.message)}</p>`;
    }
  }

  async function renderPublications(params) {
    setActiveNav('#/publications');
    app.innerHTML = '<h2 class="page-title">Publications</h2><p class="page-sub">Browse by convention / code.</p><div id="cat-tabs" class="tabs"></div><div id="pub-list" class="pub-grid"><p class="loading">Loading…</p></div>';
    try {
      const [{ articles }, { categories }] = await Promise.all([
        getJson('/api/articles'),
        getJson('/api/articles/categories'),
      ]);
      const activeCat = params.get('category') || '';
      const tabs = document.getElementById('cat-tabs');
      tabs.innerHTML = '';
      const allBtn = el(`<button class="${activeCat ? '' : 'active'}">All (${articles.length})</button>`);
      allBtn.addEventListener('click', () => { location.hash = '#/publications'; });
      tabs.appendChild(allBtn);
      categories.forEach((c) => {
        const btn = el(`<button class="${activeCat === c.category ? 'active' : ''}">${escapeHtml(c.category)} (${c.count})</button>`);
        btn.addEventListener('click', () => { location.hash = `#/publications?category=${encodeURIComponent(c.category)}`; });
        tabs.appendChild(btn);
      });

      const list = document.getElementById('pub-list');
      const filtered = activeCat ? articles.filter((a) => a.category === activeCat) : articles;
      list.innerHTML = '';
      filtered.forEach((a) => {
        list.appendChild(el(`
          <a class="card" href="#/article/${a.slug}">
            <span class="badge">${escapeHtml(a.category)}</span>
            <h3>${escapeHtml(a.title)}</h3>
            <p>${escapeHtml(a.summary)}</p>
          </a>
        `));
      });
    } catch (err) {
      document.getElementById('pub-list').innerHTML = `<p class="error">${escapeHtml(err.message)}</p>`;
    }
  }

  async function renderArticle(slug, params) {
    setActiveNav('#/publications');
    app.innerHTML = '<p class="loading">Loading article…</p>';
    try {
      const a = await getJson(`/api/articles/${encodeURIComponent(slug)}`);
      const wanted = params.get('section');
      app.innerHTML = '';
      app.appendChild(el(`
        <div class="article-header">
          <span class="badge">${escapeHtml(a.category)}</span>
          <h1>${escapeHtml(a.title)}</h1>
          <div class="article-source">${a.source_name ? `Source: ${escapeHtml(a.source_name)}` : ''}${a.source_url ? ` — <a href="${a.source_url}" target="_blank" rel="noopener">${escapeHtml(a.source_url)}</a>` : ''}</div>
        </div>
      `));
      if (a.sections.length > 1) {
        const toc = el('<nav class="toc card"></nav>');
        a.sections.forEach((s) => {
          const link = el(`<a href="#/article/${slug}?section=${s.anchor}">${escapeHtml(s.heading)}</a>`);
          toc.appendChild(link);
        });
        app.appendChild(toc);
      }
      a.sections.forEach((s) => {
        const isTarget = wanted && s.anchor === wanted;
        const block = el(`
          <section class="section-block${isTarget ? ' highlight' : ''}" id="${s.anchor}">
            <h2>${escapeHtml(s.heading)}</h2>
            ${s.body.split('\n\n').map((p) => `<p>${escapeHtml(p)}</p>`).join('')}
          </section>
        `);
        app.appendChild(block);
      });
      if (wanted) {
        requestAnimationFrame(() => {
          const target = document.getElementById(wanted);
          if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
      }
    } catch (err) {
      app.innerHTML = `<p class="error">${escapeHtml(err.message)}</p>`;
    }
  }

  async function renderReference(params) {
    setActiveNav('#/reference');
    const sections = [
      { key: 'conversions', label: 'Conversions' },
      { key: 'deck', label: 'Deck' },
      { key: 'engine', label: 'Engine' },
      { key: 'galley', label: 'Galley' },
    ];
    const active = params.get('section') || 'conversions';
    app.innerHTML = '';
    appendHtml(app, '<h2 class="page-title">Reference</h2><p class="page-sub">Conversions and everyday reference tables for deck, engine and galley.</p>');
    const tabs = el('<div class="tabs"></div>');
    sections.forEach((s) => {
      const btn = el(`<button class="${active === s.key ? 'active' : ''}">${s.label}</button>`);
      btn.addEventListener('click', () => { location.hash = `#/reference?section=${s.key}`; });
      tabs.appendChild(btn);
    });
    app.appendChild(tabs);
    const content = el('<div id="ref-content"><p class="loading">Loading…</p></div>');
    app.appendChild(content);
    try {
      const data = await getJson(`/api/reference/${active}`);
      content.innerHTML = '';
      data.tables.forEach((t) => {
        const wrap = el(`<div class="ref-table-wrap"><h3>${escapeHtml(t.name)}</h3></div>`);
        const table = document.createElement('table');
        table.className = 'ref-table';
        const thead = `<thead><tr>${t.columns.map((c) => `<th>${escapeHtml(c)}</th>`).join('')}</tr></thead>`;
        const tbody = `<tbody>${t.rows.map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join('')}</tr>`).join('')}</tbody>`;
        table.innerHTML = thead + tbody;
        wrap.appendChild(table);
        content.appendChild(wrap);
      });
    } catch (err) {
      content.innerHTML = `<p class="error">${escapeHtml(err.message)}</p>`;
    }
  }

  async function renderNews(params) {
    setActiveNav('#/news');
    const cats = [
      { key: '', label: 'All' },
      { key: 'business', label: 'Business' },
      { key: 'tech', label: 'Tech' },
      { key: 'accidents', label: 'Accidents' },
      { key: 'other', label: 'Other' },
    ];
    const active = params.get('category') || '';
    app.innerHTML = '';
    appendHtml(app, '<h2 class="page-title">Maritime news</h2><p class="page-sub" id="news-sub">Aggregated from maritime industry RSS feeds.</p>');
    const tabs = el('<div class="tabs"></div>');
    cats.forEach((c) => {
      const btn = el(`<button class="${active === c.key ? 'active' : ''}">${c.label}</button>`);
      btn.addEventListener('click', () => { location.hash = c.key ? `#/news?category=${c.key}` : '#/news'; });
      tabs.appendChild(btn);
    });
    app.appendChild(tabs);
    const grid = el('<div class="news-grid"><p class="loading">Loading…</p></div>');
    app.appendChild(grid);
    try {
      const data = await getJson(`/api/news${active ? `?category=${active}` : ''}`);
      document.getElementById('news-sub').textContent = data.last_fetched
        ? `Aggregated from maritime industry RSS feeds. Last updated: ${new Date(data.last_fetched).toLocaleString()}`
        : 'No news fetched yet — run the update-news job.';
      grid.innerHTML = '';
      if (!data.items.length) {
        grid.innerHTML = '<p class="empty">No articles yet. Run <code>npm run update-news</code> or wait for the scheduled cron job.</p>';
        return;
      }
      data.items.forEach((n) => {
        grid.appendChild(el(`
          <a class="card news-card" href="${n.link}" target="_blank" rel="noopener">
            <div class="cat">${escapeHtml(n.category)} · ${escapeHtml(n.source)}</div>
            <h3>${escapeHtml(n.title)}</h3>
            <p>${escapeHtml(n.summary || '')}</p>
            <div class="src">${n.published_at ? new Date(n.published_at).toLocaleDateString() : ''}</div>
          </a>
        `));
      });
    } catch (err) {
      grid.innerHTML = `<p class="error">${escapeHtml(err.message)}</p>`;
    }
  }

  async function renderCurrency(params) {
    setActiveNav('#/currency');
    const base = (params.get('base') || 'USD').toUpperCase();
    app.innerHTML = '';
    appendHtml(app, `
      <h2 class="page-title">Currency</h2>
      <p class="page-sub">Daily reference exchange rates with a simple 1-week / 1-month trend projection.</p>
      <div class="currency-controls">
        <label for="base-select">Base currency:</label>
        <select id="base-select"></select>
      </div>
      <div id="currency-content"><p class="loading">Loading…</p></div>
    `);
    const options = ['USD', 'EUR', 'GBP', 'JPY', 'CNY', 'SGD', 'HKD', 'AUD', 'CAD', 'CHF', 'NOK', 'INR', 'PHP', 'IDR', 'KRW', 'AED', 'PLN', 'ZAR', 'NZD', 'SEK'];
    const select = document.getElementById('base-select');
    select.innerHTML = options.map((o) => `<option value="${o}" ${o === base ? 'selected' : ''}>${o}</option>`).join('');
    select.addEventListener('change', () => { location.hash = `#/currency?base=${select.value}`; });

    const content = document.getElementById('currency-content');
    try {
      const data = await getJson(`/api/currency?base=${base}`);
      const rows = data.rates.map((r) => {
        const trendClass = r.forecast_1m == null ? 'trend-flat' : (r.forecast_1m > r.rate ? 'trend-up' : (r.forecast_1m < r.rate ? 'trend-down' : 'trend-flat'));
        const arrow = trendClass === 'trend-up' ? '▲' : trendClass === 'trend-down' ? '▼' : '—';
        return `<tr>
          <td><strong>${r.quote}</strong></td>
          <td>${r.rate.toFixed(4)}</td>
          <td>${r.forecast_1w != null ? r.forecast_1w.toFixed(4) : '—'}</td>
          <td class="${trendClass}">${r.forecast_1m != null ? r.forecast_1m.toFixed(4) : '—'} ${arrow}</td>
        </tr>`;
      }).join('');
      content.innerHTML = `
        <p class="page-sub">1 ${base} = … (as of ${escapeHtml(data.as_of || 'n/a')})</p>
        <div class="ref-table-wrap">
          <table class="ref-table">
            <thead><tr><th>Currency</th><th>Current rate</th><th>+1 week (est.)</th><th>+1 month (est.)</th></tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
        <p class="page-sub" style="font-size:0.8rem;">${escapeHtml(data.disclaimer)}</p>
      `;
    } catch (err) {
      content.innerHTML = `<p class="error">${escapeHtml(err.message)}</p>`;
    }
  }

  // ---------- Explore: interactive node network ----------

  // Classic Fruchterman-Reingold force-directed layout, run synchronously
  // (the graph is small — a few dozen nodes — so this finishes in ms).
  function forceLayout(nodes, edges, width, height) {
    const area = width * height;
    const k = Math.sqrt(area / Math.max(nodes.length, 1)) * 1.15;
    const positions = new Map();
    nodes.forEach((n, i) => {
      const angle = (i / nodes.length) * 2 * Math.PI;
      const r = Math.min(width, height) * 0.36;
      positions.set(n.id, { x: width / 2 + r * Math.cos(angle), y: height / 2 + r * Math.sin(angle) });
    });
    let temperature = width / 12;
    for (let iter = 0; iter < 300; iter++) {
      const disp = new Map(nodes.map((n) => [n.id, { x: 0, y: 0 }]));
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const a = nodes[i], b = nodes[j];
          const pa = positions.get(a.id), pb = positions.get(b.id);
          const dx = pa.x - pb.x, dy = pa.y - pb.y;
          const dist = Math.sqrt(dx * dx + dy * dy) || 0.01;
          const force = (k * k) / dist;
          const ux = dx / dist, uy = dy / dist;
          const da = disp.get(a.id), db = disp.get(b.id);
          da.x += ux * force; da.y += uy * force;
          db.x -= ux * force; db.y -= uy * force;
        }
      }
      edges.forEach((e) => {
        const pa = positions.get(e.source), pb = positions.get(e.target);
        if (!pa || !pb) return;
        const dx = pa.x - pb.x, dy = pa.y - pb.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 0.01;
        const force = (dist * dist) / k;
        const ux = dx / dist, uy = dy / dist;
        const da = disp.get(e.source), db = disp.get(e.target);
        da.x -= ux * force; da.y -= uy * force;
        db.x += ux * force; db.y += uy * force;
      });
      nodes.forEach((n) => {
        const d = disp.get(n.id);
        const dist = Math.sqrt(d.x * d.x + d.y * d.y) || 0.01;
        const p = positions.get(n.id);
        p.x += (d.x / dist) * Math.min(dist, temperature);
        p.y += (d.y / dist) * Math.min(dist, temperature);
        p.x = Math.min(width - 50, Math.max(50, p.x));
        p.y = Math.min(height - 50, Math.max(50, p.y));
      });
      temperature *= 0.97;
    }
    return positions;
  }

  function nodeRadius(type) {
    if (type === 'org') return 16;
    if (type === 'convention' || type === 'code') return 11;
    return 8;
  }

  function nodeSubtitle(node, orgLabel) {
    if (node.type === 'org') return 'International organization';
    if (node.type === 'convention' || node.type === 'code') {
      const bits = [];
      if (orgLabel) bits.push(orgLabel);
      if (node.adopted) bits.push(`adopted ${node.adopted}`);
      return bits.join(' · ');
    }
    const h = node.history || '';
    return h.length > 56 ? h.slice(0, 54) + '…' : h;
  }

  async function renderExplore() {
    setActiveNav('#/explore');
    app.innerHTML = `
      <h2 class="page-title">Explore the network</h2>
      <p class="page-sub">Organizations, conventions, codes and the amendments that shaped them — drag nodes, scroll to zoom, click a node for its history. Watch the little ships trace the connections.</p>
      <div class="graph-legend">
        <span><i class="legend-org"></i> Organization</span>
        <span><i class="legend-convention"></i> Convention</span>
        <span><i class="legend-code"></i> Code</span>
        <span><i class="legend-amendment"></i> Amendment / concept</span>
      </div>
      <div class="graph-shell lod-mid" id="graph-shell">
        <div class="graph-controls">
          <button type="button" id="graph-zoom-in" title="Zoom in">+</button>
          <button type="button" id="graph-zoom-out" title="Zoom out">−</button>
          <button type="button" id="graph-zoom-reset" title="Reset view">⟳</button>
        </div>
        <p class="loading"><span class="anchor-spin">⚓</span><br>Charting the network…</p>
      </div>
      <div id="node-panel"></div>
    `;

    const shell = document.getElementById('graph-shell');
    const panel = document.getElementById('node-panel');

    let data;
    try {
      data = await getJson('/api/graph');
    } catch (err) {
      shell.innerHTML = `<p class="error">${escapeHtml(err.message)}</p>`;
      return;
    }

    const { nodes, edges } = data;
    const W = 1000, H = 640;
    const positions = forceLayout(nodes, edges, W, H);
    const nodeById = new Map(nodes.map((n) => [n.id, n]));
    const orgLabelOf = (n) => (n.org && nodeById.has(n.org) ? nodeById.get(n.org).label : null);

    const adjacency = new Map(nodes.map((n) => [n.id, []]));
    edges.forEach((e, i) => {
      if (adjacency.has(e.source)) adjacency.get(e.source).push({ edgeIndex: i, otherId: e.target, relation: e.relation, dir: 'out' });
      if (adjacency.has(e.target)) adjacency.get(e.target).push({ edgeIndex: i, otherId: e.source, relation: e.relation, dir: 'in' });
    });

    const edgePathD = (e) => {
      const pa = positions.get(e.source), pb = positions.get(e.target);
      return `M ${pa.x.toFixed(1)},${pa.y.toFixed(1)} L ${pb.x.toFixed(1)},${pb.y.toFixed(1)}`;
    };

    const edgesSvg = edges.map((e, i) => `<path class="graph-edge" id="mk-edge-${i}" data-source="${e.source}" data-target="${e.target}" d="${edgePathD(e)}"></path>`).join('');
    const nodesSvg = nodes.map((n) => {
      const p = positions.get(n.id);
      const r = nodeRadius(n.type);
      const sub = nodeSubtitle(n, orgLabelOf(n));
      return `
        <g class="graph-node type-${n.type}" data-id="${n.id}" transform="translate(${p.x.toFixed(1)},${p.y.toFixed(1)})">
          <circle r="${r}"></circle>
          <text class="node-title" y="${-(r + 6)}" text-anchor="middle">${escapeHtml(n.label)}</text>
          <text class="node-subtitle" y="${r + 14}" text-anchor="middle">${escapeHtml(sub)}</text>
        </g>`;
    }).join('');

    const shipsSvg = Array.from({ length: Math.min(6, edges.length) }).map((_, i) => `
      <g class="ship-token" id="mk-ship-${i}">
        <path d="M -7,-3 L 7,0 L -7,3 L -4,0 Z" class="ship-hull"></path>
        <path d="M -1,-3 L -1,-9 L 4,-3 Z" class="ship-sail"></path>
      </g>`).join('');

    shell.innerHTML = `
      <div class="graph-controls">
        <button type="button" id="graph-zoom-in" title="Zoom in">+</button>
        <button type="button" id="graph-zoom-out" title="Zoom out">−</button>
        <button type="button" id="graph-zoom-reset" title="Reset view">⟳</button>
      </div>
      <svg viewBox="0 0 ${W} ${H}" id="graph-svg">
        <g id="graph-viewport">
          <g id="graph-edges">${edgesSvg}</g>
          <g id="graph-ships">${shipsSvg}</g>
          <g id="graph-nodes">${nodesSvg}</g>
        </g>
      </svg>
    `;

    const svg = document.getElementById('graph-svg');
    const viewport = document.getElementById('graph-viewport');
    const nodeEls = Array.from(svg.querySelectorAll('.graph-node'));
    const edgeEls = Array.from(svg.querySelectorAll('.graph-edge'));

    // ----- pan & zoom -----
    const view = { scale: 1, x: 0, y: 0 };
    function applyView() {
      viewport.setAttribute('transform', `translate(${view.x},${view.y}) scale(${view.scale})`);
      shell.classList.remove('lod-min', 'lod-mid', 'lod-max');
      shell.classList.add(view.scale < 0.7 ? 'lod-min' : view.scale >= 1.3 ? 'lod-max' : 'lod-mid');
    }
    function zoomBy(factor) {
      view.scale = Math.min(3, Math.max(0.4, view.scale * factor));
      applyView();
    }
    document.getElementById('graph-zoom-in').addEventListener('click', () => zoomBy(1.25));
    document.getElementById('graph-zoom-out').addEventListener('click', () => zoomBy(0.8));
    document.getElementById('graph-zoom-reset').addEventListener('click', () => { view.scale = 1; view.x = 0; view.y = 0; applyView(); });
    svg.addEventListener('wheel', (e) => {
      e.preventDefault();
      zoomBy(e.deltaY < 0 ? 1.1 : 0.9);
    }, { passive: false });

    let panDrag = null;
    svg.addEventListener('mousedown', (e) => {
      if (e.target.closest('.graph-node')) return;
      panDrag = { startX: e.clientX, startY: e.clientY, origX: view.x, origY: view.y };
    });

    // ----- node drag -----
    let nodeDrag = null;
    function svgPoint(clientX, clientY) {
      const rect = svg.getBoundingClientRect();
      return {
        x: ((clientX - rect.left) / rect.width) * W,
        y: ((clientY - rect.top) / rect.height) * H,
      };
    }

    nodeEls.forEach((g) => {
      g.addEventListener('mousedown', (e) => {
        e.stopPropagation();
        const id = g.dataset.id;
        nodeDrag = { id, moved: false };
      });
    });

    window.addEventListener('mousemove', (e) => {
      if (nodeDrag) {
        nodeDrag.moved = true;
        const pt = svgPoint(e.clientX, e.clientY);
        positions.set(nodeDrag.id, pt);
        const g = svg.querySelector(`.graph-node[data-id="${CSS.escape(nodeDrag.id)}"]`);
        if (g) g.setAttribute('transform', `translate(${pt.x.toFixed(1)},${pt.y.toFixed(1)})`);
        adjacency.get(nodeDrag.id).forEach(({ edgeIndex }) => {
          const path = document.getElementById(`mk-edge-${edgeIndex}`);
          if (path) path.setAttribute('d', edgePathD(edges[edgeIndex]));
        });
      } else if (panDrag) {
        view.x = panDrag.origX + (e.clientX - panDrag.startX);
        view.y = panDrag.origY + (e.clientY - panDrag.startY);
        applyView();
      }
    });

    window.addEventListener('mouseup', (e) => {
      if (nodeDrag && !nodeDrag.moved) selectNode(nodeDrag.id);
      nodeDrag = null;
      panDrag = null;
    });

    // ----- selection / highlight -----
    let selectedId = null;
    function clearHighlight() {
      nodeEls.forEach((g) => g.classList.remove('dim', 'lit', 'selected'));
      edgeEls.forEach((p) => p.classList.remove('dim', 'lit'));
    }
    function highlightAround(id) {
      const related = new Set([id, ...adjacency.get(id).map((a) => a.otherId)]);
      nodeEls.forEach((g) => g.classList.toggle('dim', !related.has(g.dataset.id)));
      nodeEls.forEach((g) => g.classList.toggle('selected', g.dataset.id === id));
      const litEdges = new Set(adjacency.get(id).map((a) => a.edgeIndex));
      edgeEls.forEach((p, i) => {
        p.classList.toggle('lit', litEdges.has(i));
        p.classList.toggle('dim', !litEdges.has(i));
      });
    }

    function connectionLabel(entry) {
      const other = nodeById.get(entry.otherId);
      const label = other ? other.label : entry.otherId;
      return entry.dir === 'out' ? `${entry.relation} → ${label}` : `${label} → ${entry.relation} → this`;
    }

    function selectNode(id) {
      const n = nodeById.get(id);
      if (!n) return;
      selectedId = id;
      highlightAround(id);
      const orgLabel = orgLabelOf(n);
      const meta = [];
      const TYPE_LABELS = { org: 'Organization', convention: 'Convention', code: 'Code', amendment: 'Amendment', concept: 'Concept' };
      if (n.type) meta.push(TYPE_LABELS[n.type] || n.type);
      if (orgLabel) meta.push(orgLabel);
      if (n.adopted) meta.push(`adopted ${n.adopted}`);
      if (n.inForce) meta.push(`in force ${n.inForce}`);

      const links = adjacency.get(id).map((entry) => `
        <button type="button" data-jump="${entry.otherId}">${escapeHtml(connectionLabel(entry))}</button>
      `).join('');

      panel.innerHTML = `
        <div class="node-panel">
          <h3>${escapeHtml(n.label)}</h3>
          <div class="node-meta">${escapeHtml(meta.join(' · '))}</div>
          <p class="node-history">${escapeHtml(n.history || '')}</p>
          ${links ? `<div class="node-links">${links}</div>` : ''}
          ${n.articleSlug ? `<p style="margin-top:12px;"><a href="#/article/${n.articleSlug}">Read the full summary →</a></p>` : ''}
          ${n.source ? `<p class="page-sub" style="font-size:0.78rem;margin-top:6px;">Source: <a href="${n.source}" target="_blank" rel="noopener">${escapeHtml(n.source)}</a></p>` : ''}
        </div>
      `;
      panel.querySelectorAll('[data-jump]').forEach((btn) => {
        btn.addEventListener('click', () => selectNode(btn.dataset.jump));
      });
    }

    svg.addEventListener('click', (e) => {
      if (!e.target.closest('.graph-node')) {
        selectedId = null;
        clearHighlight();
        panel.innerHTML = '';
      }
    });

    applyView();

    // ----- wandering ships: continuously sail between connected nodes -----
    if (!reduceMotion && edges.length) {
      const ships = Array.from({ length: Math.min(6, edges.length) }, (_, i) => ({
        el: document.getElementById(`mk-ship-${i}`),
        edgeIndex: Math.floor(Math.random() * edges.length),
        t: Math.random(),
        speed: 0.00025 + Math.random() * 0.00025,
      }));
      let last = performance.now();
      function tick(now) {
        const dt = now - last;
        last = now;
        ships.forEach((ship) => {
          ship.t += ship.speed * dt;
          if (ship.t >= 1) {
            ship.t = 0;
            ship.edgeIndex = Math.floor(Math.random() * edges.length);
          }
          const e = edges[ship.edgeIndex];
          const pa = positions.get(e.source), pb = positions.get(e.target);
          if (!pa || !pb || !ship.el) return;
          const x = pa.x + (pb.x - pa.x) * ship.t;
          const y = pa.y + (pb.y - pa.y) * ship.t;
          const angle = Math.atan2(pb.y - pa.y, pb.x - pa.x) * (180 / Math.PI);
          ship.el.setAttribute('transform', `translate(${x.toFixed(1)},${y.toFixed(1)}) rotate(${angle.toFixed(1)})`);
        });
        graphRAF = requestAnimationFrame(tick);
      }
      graphRAF = requestAnimationFrame(tick);
    }
  }

  // ---------- Router ----------

  function parseHash() {
    const hash = location.hash.replace(/^#/, '') || '/';
    const [path, queryStr] = hash.split('?');
    const params = new URLSearchParams(queryStr || '');
    return { path, params };
  }

  function route() {
    stopGraphAnimation();
    const { path, params } = parseHash();
    const articleMatch = path.match(/^\/article\/([^/]+)$/);

    if (path === '/' || path === '') renderHome();
    else if (path === '/search') renderSearch(params);
    else if (path === '/publications') renderPublications(params);
    else if (articleMatch) renderArticle(decodeURIComponent(articleMatch[1]), params);
    else if (path === '/reference') renderReference(params);
    else if (path === '/news') renderNews(params);
    else if (path === '/currency') renderCurrency(params);
    else if (path === '/explore') renderExplore(params);
    else renderHome();

    window.scrollTo({ top: 0 });
  }

  headerForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const q = headerInput.value.trim();
    if (q) location.hash = `#/search?q=${encodeURIComponent(q)}`;
  });

  initThemeSwitcher();
  window.addEventListener('hashchange', route);
  route();
})();
