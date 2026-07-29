#!/usr/bin/env bash
# Marine Knows — update an existing install to the latest commit on its
# tracked branch.
#
# Used two ways:
#   1. Manually, whenever you want to update right now:
#        sudo bash /opt/marine-knows/install/update.sh
#   2. Automatically, via the cron job container-setup.sh installs at
#      /etc/cron.d/marine-knows (daily by default — see AUTO_UPDATE_SCHEDULE
#      in container-setup.sh). Same script either way; cron just runs it
#      non-interactively and logs to /var/log/marine-knows-update.log.
#
# It is safe to run at any time: if there's nothing new upstream, it exits
# immediately without touching the running service.
set -euo pipefail

INSTALL_DIR="${INSTALL_DIR:-/opt/marine-knows}"
MARINE_KNOWS_BRANCH="${MARINE_KNOWS_BRANCH:-main}"
SERVICE_USER="${SERVICE_USER:-marineknows}"
SERVICE_NAME="${SERVICE_NAME:-marine-knows}"
FORCE_UPDATE="${FORCE_UPDATE:-0}"

log()  { echo -e "\033[1;36m[update]\033[0m $(date '+%Y-%m-%d %H:%M:%S') $*"; }
warn() { echo -e "\033[1;33m[update]\033[0m $(date '+%Y-%m-%d %H:%M:%S') $*" >&2; }
die()  { echo -e "\033[1;31m[update] ERROR:\033[0m $*" >&2; exit 1; }

[ "$(id -u)" -eq 0 ] || die "Run as root (it needs to restart the systemd service)."
[ -d "${INSTALL_DIR}/.git" ] || die "${INSTALL_DIR} is not a git checkout — run container-setup.sh first."

cd "${INSTALL_DIR}"

if [ -n "$(git status --porcelain)" ] && [ "${FORCE_UPDATE}" != "1" ]; then
  die "Working tree at ${INSTALL_DIR} has local modifications — refusing to discard them. Review with 'git -C ${INSTALL_DIR} status', then either commit/stash them elsewhere or re-run with FORCE_UPDATE=1 to discard and continue."
fi

log "Checking for updates on branch ${MARINE_KNOWS_BRANCH}..."
git fetch origin "${MARINE_KNOWS_BRANCH}"

LOCAL_SHA="$(git rev-parse HEAD)"
REMOTE_SHA="$(git rev-parse "origin/${MARINE_KNOWS_BRANCH}")"

if [ "${LOCAL_SHA}" = "${REMOTE_SHA}" ]; then
  log "Already up to date (${LOCAL_SHA:0:12}). Nothing to do."
  exit 0
fi

log "Updating ${LOCAL_SHA:0:12} -> ${REMOTE_SHA:0:12}..."
CHANGED_FILES="$(git diff --name-only "${LOCAL_SHA}" "${REMOTE_SHA}")"

git checkout "${MARINE_KNOWS_BRANCH}"
git reset --hard "origin/${MARINE_KNOWS_BRANCH}"

if echo "${CHANGED_FILES}" | grep -qE '^package(-lock)?\.json$'; then
  log "package.json changed — reinstalling npm dependencies..."
  npm install --omit=dev --no-audit --no-fund
else
  log "No dependency changes — skipping npm install."
fi

log "Re-seeding the publications & reference database (safe/idempotent)..."
node server/seed/seed.js

chown -R "${SERVICE_USER}:${SERVICE_USER}" "${INSTALL_DIR}"

log "Restarting ${SERVICE_NAME}.service..."
systemctl restart "${SERVICE_NAME}.service"

log "Updated to ${REMOTE_SHA:0:12} and restarted. Service status:"
systemctl --no-pager status "${SERVICE_NAME}.service" || true
