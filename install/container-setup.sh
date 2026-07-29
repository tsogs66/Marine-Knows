#!/usr/bin/env bash
# Marine Knows — in-container setup.
#
# Runs INSIDE the Debian 12 LXC container as root. Normally invoked
# automatically by install/proxmox-install.sh, but can be re-run directly
# inside an existing container to (re)install / update:
#
#   MARINE_KNOWS_BRANCH=main bash container-setup.sh
#
set -euo pipefail

MARINE_KNOWS_REPO="${MARINE_KNOWS_REPO:-https://github.com/tsogs66/marine-knows.git}"
MARINE_KNOWS_BRANCH="${MARINE_KNOWS_BRANCH:-main}"
INSTALL_DIR="${INSTALL_DIR:-/opt/marine-knows}"
APP_PORT="${APP_PORT:-3000}"
NODE_MAJOR="${NODE_MAJOR:-20}"
SERVICE_USER="${SERVICE_USER:-marineknows}"
ENABLE_AUTO_UPDATE="${ENABLE_AUTO_UPDATE:-1}"
AUTO_UPDATE_SCHEDULE="${AUTO_UPDATE_SCHEDULE:-0 4 * * *}"

log()  { echo -e "\033[1;36m[setup]\033[0m $*"; }
die()  { echo -e "\033[1;31m[setup] ERROR:\033[0m $*" >&2; exit 1; }

[ "$(id -u)" -eq 0 ] || die "Run as root."

export DEBIAN_FRONTEND=noninteractive

log "Installing base packages (git, build tools, nginx, sqlite3, cron)..."
apt-get update -y
apt-get install -y --no-install-recommends \
  ca-certificates curl gnupg git build-essential python3 \
  sqlite3 nginx cron

if ! command -v node >/dev/null 2>&1 || [ "$(node -v | sed -E 's/^v([0-9]+).*/\1/')" -lt "${NODE_MAJOR}" ]; then
  log "Installing Node.js ${NODE_MAJOR}.x via NodeSource..."
  curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | bash -
  apt-get install -y nodejs
else
  log "Node.js already present: $(node -v)"
fi

if ! id "${SERVICE_USER}" >/dev/null 2>&1; then
  log "Creating service user '${SERVICE_USER}'..."
  useradd --system --home "${INSTALL_DIR}" --shell /usr/sbin/nologin "${SERVICE_USER}"
fi

if [ -d "${INSTALL_DIR}/.git" ]; then
  log "Existing install found at ${INSTALL_DIR}, updating..."
  git -C "${INSTALL_DIR}" fetch origin "${MARINE_KNOWS_BRANCH}"
  git -C "${INSTALL_DIR}" checkout "${MARINE_KNOWS_BRANCH}"
  git -C "${INSTALL_DIR}" reset --hard "origin/${MARINE_KNOWS_BRANCH}"
else
  log "Cloning ${MARINE_KNOWS_REPO} (${MARINE_KNOWS_BRANCH}) to ${INSTALL_DIR}..."
  rm -rf "${INSTALL_DIR}"
  git clone --branch "${MARINE_KNOWS_BRANCH}" --depth 1 "${MARINE_KNOWS_REPO}" "${INSTALL_DIR}"
fi

cd "${INSTALL_DIR}"

log "Installing npm dependencies..."
npm install --omit=dev --no-audit --no-fund

log "Seeding the publications & reference database..."
node server/seed/seed.js

log "Fetching initial news + currency data (best-effort, continues on failure)..."
node scripts/update-news.js || log "News fetch failed — will retry via cron. Check network/DNS from the container."
node scripts/update-currency.js || log "Currency fetch failed — will retry via cron. Check network/DNS from the container."

chown -R "${SERVICE_USER}:${SERVICE_USER}" "${INSTALL_DIR}"

log "Installing systemd service..."
cat > /etc/systemd/system/marine-knows.service <<EOF
[Unit]
Description=Marine Knows - maritime publications, reference & news website
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=${SERVICE_USER}
Group=${SERVICE_USER}
WorkingDirectory=${INSTALL_DIR}
Environment=NODE_ENV=production
Environment=PORT=${APP_PORT}
ExecStart=/usr/bin/node ${INSTALL_DIR}/server/index.js
Restart=on-failure
RestartSec=5
NoNewPrivileges=true
PrivateTmp=true

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable --now marine-knows.service

log "Configuring nginx reverse proxy on port 80..."
cat > /etc/nginx/sites-available/marine-knows <<EOF
server {
    listen 80 default_server;
    listen [::]:80 default_server;
    server_name _;

    location / {
        proxy_pass http://127.0.0.1:${APP_PORT};
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
}
EOF
rm -f /etc/nginx/sites-enabled/default
ln -sf /etc/nginx/sites-available/marine-knows /etc/nginx/sites-enabled/marine-knows
nginx -t
systemctl enable --now nginx
systemctl reload nginx

log "Installing cron jobs (news every 30 min, currency daily)..."
cat > /etc/cron.d/marine-knows <<EOF
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
*/30 * * * * ${SERVICE_USER} /usr/bin/node ${INSTALL_DIR}/scripts/update-news.js >> /var/log/marine-knows-news.log 2>&1
17 3 * * * ${SERVICE_USER} /usr/bin/node ${INSTALL_DIR}/scripts/update-currency.js >> /var/log/marine-knows-currency.log 2>&1
EOF

if [ "${ENABLE_AUTO_UPDATE}" = "1" ]; then
  log "Installing auto-update cron job (schedule: '${AUTO_UPDATE_SCHEDULE}')..."
  # Runs as root (needs to restart the systemd service); the actual git/npm
  # steps re-chown app files back to SERVICE_USER when done. See
  # install/update.sh for the update logic itself, and README.md for how
  # to change the schedule or disable this after install.
  echo "${AUTO_UPDATE_SCHEDULE} root INSTALL_DIR=${INSTALL_DIR} MARINE_KNOWS_BRANCH=${MARINE_KNOWS_BRANCH} SERVICE_USER=${SERVICE_USER} /usr/bin/bash ${INSTALL_DIR}/install/update.sh >> /var/log/marine-knows-update.log 2>&1" >> /etc/cron.d/marine-knows
  touch /var/log/marine-knows-update.log
else
  log "Auto-update disabled (ENABLE_AUTO_UPDATE=0) — update manually with install/update.sh."
fi

chmod 644 /etc/cron.d/marine-knows
touch /var/log/marine-knows-news.log /var/log/marine-knows-currency.log
chown "${SERVICE_USER}:${SERVICE_USER}" /var/log/marine-knows-news.log /var/log/marine-knows-currency.log
systemctl enable --now cron

log "Marine Knows setup complete. Service status:"
systemctl --no-pager status marine-knows.service || true
