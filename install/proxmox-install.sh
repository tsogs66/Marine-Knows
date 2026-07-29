#!/usr/bin/env bash
# Marine Knows — Proxmox VE installer
#
# Run this ON THE PROXMOX HOST (as root) to create a new Debian 12 LXC
# container and install the Marine Knows website inside it:
#
#   curl -fsSL https://raw.githubusercontent.com/tsogs66/marine-knows/main/install/proxmox-install.sh | bash
#
# Every setting below can be overridden by exporting the corresponding
# environment variable before running the one-liner, e.g.:
#
#   CTID=150 CT_HOSTNAME=marine-knows CT_MEMORY=1024 \
#   curl -fsSL https://raw.githubusercontent.com/tsogs66/marine-knows/main/install/proxmox-install.sh | bash
#
set -euo pipefail

# ---------------------------------------------------------------------------
# Configuration (override via environment variables)
# ---------------------------------------------------------------------------
CT_HOSTNAME="${CT_HOSTNAME:-marine-knows}"
CT_MEMORY="${CT_MEMORY:-1024}"          # MB
CT_SWAP="${CT_SWAP:-512}"               # MB
CT_CORES="${CT_CORES:-2}"
CT_DISK_GB="${CT_DISK_GB:-6}"           # GB
CT_BRIDGE="${CT_BRIDGE:-vmbr0}"
CT_NET_CONFIG="${CT_NET_CONFIG:-name=eth0,bridge=${CT_BRIDGE},ip=dhcp}"
CT_STORAGE="${CT_STORAGE:-local-lvm}"   # storage for the container rootfs
TEMPLATE_STORAGE="${TEMPLATE_STORAGE:-local}"  # storage holding CT templates
CT_UNPRIVILEGED="${CT_UNPRIVILEGED:-1}" # 1 = unprivileged (recommended)
CT_PASSWORD="${CT_PASSWORD:-}"          # optional root password inside the CT

MARINE_KNOWS_REPO="${MARINE_KNOWS_REPO:-https://github.com/tsogs66/marine-knows.git}"
MARINE_KNOWS_BRANCH="${MARINE_KNOWS_BRANCH:-main}"

TEMPLATE_PATTERN='debian-12-standard'

log()  { echo -e "\033[1;36m[marine-knows]\033[0m $*"; }
warn() { echo -e "\033[1;33m[marine-knows]\033[0m $*" >&2; }
die()  { echo -e "\033[1;31m[marine-knows] ERROR:\033[0m $*" >&2; exit 1; }

# ---------------------------------------------------------------------------
# Sanity checks
# ---------------------------------------------------------------------------
[ "$(id -u)" -eq 0 ] || die "This script must be run as root on the Proxmox host."
command -v pveversion >/dev/null 2>&1 || die "pveversion not found — this script must run on a Proxmox VE host, not inside a container."
command -v pct >/dev/null 2>&1 || die "'pct' command not found."

log "Detected Proxmox VE: $(pveversion)"

# ---------------------------------------------------------------------------
# Pick a container ID
# ---------------------------------------------------------------------------
if [ -z "${CTID:-}" ]; then
  CTID="$(pvesh get /cluster/nextid)"
fi
log "Using CTID=${CTID}"

if pct status "${CTID}" >/dev/null 2>&1; then
  die "Container ${CTID} already exists. Set CTID to an unused ID, or 'pct destroy ${CTID}' first."
fi

# ---------------------------------------------------------------------------
# Ensure a Debian 12 template is available
# ---------------------------------------------------------------------------
log "Refreshing available container template list..."
pveam update >/dev/null 2>&1 || warn "pveam update failed (continuing with cached template list)"

TEMPLATE="$(pveam available --section system 2>/dev/null | awk '{print $2}' | grep "${TEMPLATE_PATTERN}" | sort -V | tail -n1 || true)"
[ -n "${TEMPLATE}" ] || die "Could not find a ${TEMPLATE_PATTERN} template in 'pveam available'. Check your Proxmox template catalog."

if ! pveam list "${TEMPLATE_STORAGE}" 2>/dev/null | grep -q "${TEMPLATE}"; then
  log "Downloading template ${TEMPLATE} to storage '${TEMPLATE_STORAGE}'..."
  pveam download "${TEMPLATE_STORAGE}" "${TEMPLATE}"
else
  log "Template ${TEMPLATE} already present on '${TEMPLATE_STORAGE}'."
fi

# ---------------------------------------------------------------------------
# Create and start the container
# ---------------------------------------------------------------------------
log "Creating container ${CTID} (${CT_HOSTNAME})..."

CREATE_ARGS=(
  "${CTID}" "${TEMPLATE_STORAGE}:vztmpl/${TEMPLATE}"
  --hostname "${CT_HOSTNAME}"
  --memory "${CT_MEMORY}"
  --swap "${CT_SWAP}"
  --cores "${CT_CORES}"
  --rootfs "${CT_STORAGE}:${CT_DISK_GB}"
  --net0 "${CT_NET_CONFIG}"
  --unprivileged "${CT_UNPRIVILEGED}"
  --features "nesting=1"
  --onboot 1
  --start 0
)
if [ -n "${CT_PASSWORD}" ]; then
  CREATE_ARGS+=(--password "${CT_PASSWORD}")
fi

pct create "${CREATE_ARGS[@]}"

log "Starting container ${CTID}..."
pct start "${CTID}"

log "Waiting for container network..."
for i in $(seq 1 30); do
  if pct exec "${CTID}" -- getent hosts deb.debian.org >/dev/null 2>&1; then
    break
  fi
  sleep 2
  if [ "${i}" -eq 30 ]; then
    die "Container did not get network connectivity in time. Check bridge/DHCP configuration (CT_BRIDGE=${CT_BRIDGE})."
  fi
done

# ---------------------------------------------------------------------------
# Install Marine Knows inside the container
# ---------------------------------------------------------------------------
log "Installing Marine Knows inside container ${CTID} (this runs git/apt/npm, may take a few minutes)..."
pct exec "${CTID}" -- bash -c "
  set -euo pipefail
  export DEBIAN_FRONTEND=noninteractive
  apt-get update -y
  apt-get install -y --no-install-recommends ca-certificates curl git
  curl -fsSL 'https://raw.githubusercontent.com/tsogs66/marine-knows/${MARINE_KNOWS_BRANCH}/install/container-setup.sh' -o /root/container-setup.sh
  chmod +x /root/container-setup.sh
  MARINE_KNOWS_REPO='${MARINE_KNOWS_REPO}' MARINE_KNOWS_BRANCH='${MARINE_KNOWS_BRANCH}' /root/container-setup.sh
"

CT_IP="$(pct exec "${CTID}" -- hostname -I 2>/dev/null | awk '{print $1}')"

log ""
log "======================================================================"
log " Marine Knows is installed in container ${CTID} (${CT_HOSTNAME})"
if [ -n "${CT_IP}" ]; then
  log " Website: http://${CT_IP}/"
else
  log " Could not detect the container IP automatically — check with:"
  log "   pct exec ${CTID} -- hostname -I"
fi
log " Logs:    pct exec ${CTID} -- journalctl -u marine-knows -f"
log "======================================================================"
