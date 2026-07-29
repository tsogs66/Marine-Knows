# Marine Knows

A self-hosted maritime knowledge site: searchable summaries of IMO/ILO
conventions and codes (SOLAS, MARPOL, STCW, ISPS, MLC, COLREG, ISM, Load
Lines, Tonnage, BWM, AFS, GMDSS, SAR/IAMSAR, IMDG, Polar Code, FAL and
more), everyday deck/engine/galley reference tables, an interactive
network diagram of how it all connects, maritime news grouped by
category, and a currency converter with a simple trend forecast —
packaged to install into a Proxmox VE LXC container with one command,
with a companion Android app to match.

Responsive, mobile-first UI with a slide-in menu, three switchable
nautical themes, and light motion throughout (see
[Style & Explore](#style--explore) below). An `android/` app wraps any
Marine Knows install in a native shell — see
[Android app](#android-app).

## Install (one-liner, run on the Proxmox host as root)

```bash
curl -fsSL https://raw.githubusercontent.com/tsogs66/marine-knows/main/install/proxmox-install.sh | bash
```

This creates a new **unprivileged Debian 12 LXC container**, installs
Node.js, clones this repo into it, seeds the database, and starts the site
behind nginx on port 80. When it finishes it prints the container's IP —
open `http://<container-ip>/` in a browser.

Every setting has a sane default and can be overridden with environment
variables, e.g.:

```bash
CTID=150 CT_HOSTNAME=marine-knows CT_MEMORY=1024 CT_CORES=2 CT_DISK_GB=6 \
CT_STORAGE=local-lvm CT_BRIDGE=vmbr0 \
curl -fsSL https://raw.githubusercontent.com/tsogs66/marine-knows/main/install/proxmox-install.sh | bash
```

| Variable | Default | Meaning |
|---|---|---|
| `CTID` | next free ID | Container ID |
| `CT_HOSTNAME` | `marine-knows` | Container hostname |
| `CT_MEMORY` / `CT_SWAP` | `1024` / `512` (MB) | RAM / swap |
| `CT_CORES` | `2` | vCPUs |
| `CT_DISK_GB` | `6` | Root filesystem size |
| `CT_STORAGE` | `local-lvm` | Storage for the container rootfs |
| `TEMPLATE_STORAGE` | `local` | Storage holding the Debian 12 template |
| `CT_BRIDGE` | `vmbr0` | Network bridge |
| `CT_NET_CONFIG` | `name=eth0,bridge=$CT_BRIDGE,ip=dhcp` | Full `pct` net string, override for static IP/VLAN |
| `CT_UNPRIVILEGED` | `1` | Unprivileged container |
| `MARINE_KNOWS_BRANCH` | `main` | Branch to install |
| `ENABLE_AUTO_UPDATE` | `1` | Set to `0` to skip installing the daily auto-update cron job (see [Updating](#updating)) |
| `AUTO_UPDATE_SCHEDULE` | `0 4 * * *` | Cron schedule for auto-update, if enabled |

## Updating

**Automatic:** every install runs `install/update.sh` from a daily cron
job by default (4am container time) — it fetches the tracked branch,
and if there's anything new, pulls it, reinstalls npm dependencies only
if `package.json`/`package-lock.json` changed, re-seeds the database
(safe to re-run — it upserts by slug), and restarts the service. If
there's nothing new it exits immediately without touching anything.
Logs go to `/var/log/marine-knows-update.log` inside the container.

Turn it off at install time with `ENABLE_AUTO_UPDATE=0` before the
one-liner, or change how often it runs with e.g.
`AUTO_UPDATE_SCHEDULE="0 */6 * * *"` (standard 5-field cron syntax,
container-local time). To change it on an already-running install, edit
`/etc/cron.d/marine-knows` inside the container directly (or remove its
`update.sh` line to disable).

**Manual:** run it yourself anytime, from inside the container:

```bash
sudo bash /opt/marine-knows/install/update.sh
```

It's the same script the cron job calls, so the same safety behavior
applies: it refuses to run (and tells you so) if the checkout has local
modifications, rather than silently discarding them — pass
`FORCE_UPDATE=1` if you're sure you want to discard them and continue.

`install/container-setup.sh` can also still be re-run in full
(`bash /opt/marine-knows/install/container-setup.sh`) — it does
everything `update.sh` does plus reinstalling system packages, so it's
the heavier option, mainly useful if you need to pick up a change to the
install script itself, not just the app.

## What's inside

- **Search** (`/api/search`) — SQLite FTS5 full-text search over every
  section of every publication, with highlighted snippets and a reference
  link. Clicking a result opens the article scrolled to and highlighting
  the matching section.
- **Publications** (`/api/articles`) — original, plain-English summaries of
  major IMO/ILO instruments, organized by convention/code, each broken into
  cited sections. See [Content scope & limitations](#content-scope--limitations) below.
- **Reference** (`/api/reference/{conversions,deck,engine,galley}`) — unit
  conversions, Beaufort scale, IALA buoyage, COLREG lights/shapes, phonetic
  alphabet, rope strength tables, ISO 8217 fuel grades, lube oil viscosity
  cross-reference, bunker density correction, HACCP food-safety
  temperatures, MLC catering requirements, and more.
- **News** (`/api/news`) — aggregates maritime industry RSS feeds and
  auto-classifies each story into **Business / Tech / Accidents / Other**
  using keyword rules (`server/lib/newsClassify.js`), refreshed by cron
  every 30 minutes.
- **Currency** (`/api/currency`) — daily reference exchange rates (ECB via
  the free, keyless [Frankfurter API](https://frankfurter.dev/)) for a
  seafarer-relevant currency set, plus a **+1 week / +1 month** projection
  computed by ordinary-least-squares linear regression over the last ~60
  days of stored rates. This is a naive statistical trend line, clearly
  labeled in the UI as indicative only — **not financial advice**.
- **Explore** (`/api/graph`, `#/explore`) — an interactive network diagram
  of IMO/ILO, every convention/code, and the amendments/protocols that
  shaped them (33 nodes, 43 relationships — `data/graph.json`). Nodes are
  laid out with a self-written Fruchterman-Reingold force simulation
  (`public/js/app.js`, no charting library). Drag nodes, scroll/pinch or
  use the on-screen +/− to zoom (titles fade in at low zoom, subtitles at
  high zoom), and click a node for its origin, adoption/in-force years,
  full history, every connection, and — where one exists — a link to the
  full publication. Small ships continuously sail the connections between
  nodes for a "living network" feel.
- **Three nautical themes** (Deep Sea / Lighthouse / Old Chart), switched
  from the header and persisted in `localStorage`, plus maritime motion
  throughout: an animated wave divider, a slowly spinning compass rose and
  a sailing ship on the homepage hero, card hover/entrance animations, and
  a highlight pulse when a search result opens straight to its section.
  Everything respects `prefers-reduced-motion`.

## Style & Explore

The header is a single interactive menu component that's inline on
desktop and becomes a slide-in drawer (with a backdrop, animated
hamburger icon, and glass/blur styling) below 860px width — same markup,
CSS media query handles both layouts. Cards use a light glassmorphism
treatment (`backdrop-filter: blur`) with a glowing hover state, and the
header gradient drifts slowly for a subtle "alive" feel.

The `#/explore` network is fully touch-capable, not just mouse-driven:
one-finger drag moves a node or pans the canvas, two-finger pinch zooms,
and a tap selects a node — mirroring the desktop mouse/wheel/click
behavior with the same underlying state.

## Architecture

```
server/            Express app: routes, SQLite access (better-sqlite3 + FTS5)
  routes/           search, articles, reference, news, currency, graph
  lib/               FTS query sanitizer, news classifier, currency client, forecast math
  seed/seed.js        loads data/articles/*.json into SQLite (idempotent, upserts by slug)
data/
  articles/*.json    the publication content (one JSON array of articles per file)
  reference/*.json    conversions / deck / engine / galley tables
  news-sources.json   list of RSS feeds + default category per source
  graph.json          the Explore network: org/convention/code/amendment nodes + relationships
scripts/
  update-news.js      fetches & classifies RSS items into SQLite (run via cron)
  update-currency.js  fetches/backfills exchange rates into SQLite (run via cron)
public/             Static frontend (no build step): vanilla HTML/CSS/JS, hash-routed
install/
  proxmox-install.sh   run on the Proxmox HOST — creates & provisions the LXC
  container-setup.sh   run INSIDE the LXC — installs Node/nginx/cron, clones repo, starts service
  update.sh            run INSIDE the LXC (manually or via cron) — pulls, reinstalls deps if
                        needed, re-seeds, restarts the service; see "Updating" below
```

Data lives in a single SQLite file (`data/marine-knows.db`, git-ignored).
Search uses two FTS5 virtual tables (one over article title/summary/tags,
one over section headings/bodies) so results can point at the exact
section that matched, not just the article.

## Local development

```bash
npm install
npm run seed             # populate the publications + build FTS index
node scripts/update-news.js       # optional: fetch live news (needs outbound internet)
node scripts/update-currency.js   # optional: fetch live exchange rates
npm start                # http://localhost:3000
```

## Android app

`android/` is a small native Kotlin/WebView wrapper — it does **not**
hard-code a server address. On first launch it asks for your Marine
Knows install's IP or hostname (whatever `install/proxmox-install.sh`
printed at the end), stores it, and loads the site; "Change server…" in
the overflow menu lets you point it elsewhere later. See
[`android/README.md`](android/README.md) for what it does, how to build
it (Android Studio or `./gradlew assembleDebug`), and an honest note on
what could/couldn't be verified without an Android SDK in this
environment.

## Content scope & limitations

- **Publications are original summaries, not reproductions.** Full texts of
  IMO conventions and codes are copyrighted and sold by IMO; this site does
  not republish them. Each article is an original explanatory summary
  citing the issuing body (IMO/ILO/etc.), intended as a study aid and quick
  reference — always confirm binding requirements against the official
  convention text and your flag State/class society's current circulars
  before relying on them operationally.
- **The seed set (18 articles) covers the major instruments** a working
  seafarer deals with day to day. It's intentionally structured
  (`data/articles/*.json`, one file per topic group) so more can be added
  without touching any code — the seed script re-scans the directory and
  upserts by slug.
- **News feed URLs are the standard/documented endpoints** for each source
  (mostly WordPress `/feed/` conventions) but could not be live-verified
  from this development sandbox, whose outbound network is restricted to an
  allow-list that blocks general internet hosts. `scripts/update-news.js`
  fails per-source without breaking the others, logs the failure, and the
  feed list in `data/news-sources.json` is trivial to edit if any URL has
  changed. Verify feeds resolve once the container has normal internet
  access (`node scripts/update-news.js` inside the LXC).
- **Currency forecasts are a simple linear trend**, not a real financial
  forecasting model — treat them as "which way has this rate been drifting
  recently," nothing more.

## License / attribution

Reference content is original writing citing public regulatory bodies
(IMO, ILO). News items link out to their original publisher; only a short
excerpt is stored locally. Exchange rate data is sourced from the European
Central Bank via the Frankfurter API.
