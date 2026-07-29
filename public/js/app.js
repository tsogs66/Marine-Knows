(function () {
  const app = document.getElementById('app');
  const headerForm = document.getElementById('header-search-form');
  const headerInput = document.getElementById('header-search-input');

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

  // ---------- Views ----------

  function renderHome() {
    setActiveNav('#/');
    app.innerHTML = '';
    app.appendChild(el(`
      <section class="hero">
        <h1>Search the maritime rulebook</h1>
        <p>IMO conventions, MARPOL, SOLAS, STCW, ISPS, MLC and more — search publications and jump straight to the relevant section.</p>
        <form class="big-search" id="home-search-form">
          <input type="search" id="home-search-input" placeholder="e.g. &quot;ballast water exchange&quot; or &quot;hours of rest&quot;" autocomplete="off">
          <button type="submit">Search</button>
        </form>
        <div class="quick-links">
          <a href="#/publications">Browse all publications</a>
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

  // ---------- Router ----------

  function parseHash() {
    const hash = location.hash.replace(/^#/, '') || '/';
    const [path, queryStr] = hash.split('?');
    const params = new URLSearchParams(queryStr || '');
    return { path, params };
  }

  function route() {
    const { path, params } = parseHash();
    const articleMatch = path.match(/^\/article\/([^/]+)$/);

    if (path === '/' || path === '') renderHome();
    else if (path === '/search') renderSearch(params);
    else if (path === '/publications') renderPublications(params);
    else if (articleMatch) renderArticle(decodeURIComponent(articleMatch[1]), params);
    else if (path === '/reference') renderReference(params);
    else if (path === '/news') renderNews(params);
    else if (path === '/currency') renderCurrency(params);
    else renderHome();

    window.scrollTo({ top: 0 });
  }

  headerForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const q = headerInput.value.trim();
    if (q) location.hash = `#/search?q=${encodeURIComponent(q)}`;
  });

  window.addEventListener('hashchange', route);
  route();
})();
