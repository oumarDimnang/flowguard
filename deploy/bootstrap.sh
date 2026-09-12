#!/usr/bin/env bash
#
# One-time setup for the FlowGuard demo host (Ubuntu 24.04).
#
# Installs the runtimes, creates the service user and directories, and hardens
# SSH. It deliberately does NOT install the application, the systemd units or
# the Caddy config — those ship with the code, from .github/workflows/deploy.yml,
# so a change to a unit file is a normal push rather than a manual edit on a box
# nobody remembers touching.
#
# Safe to re-run: every step checks before it acts.
#
# Usage, from your laptop:
#   scp -i flowguard-admin.pem deploy/bootstrap.sh ubuntu@<elastic-ip>:~
#   ssh -i flowguard-admin.pem ubuntu@<elastic-ip> 'sudo bash bootstrap.sh'

set -euo pipefail

NODE_MAJOR=22          # floor is 20.11 (@nestjs/cli@12); 22 is the current LTS
SERVICE_USER=flowguard
APP_ROOT=/opt/flowguard
STATE_DIR=/var/lib/flowguard
SWAP_FILE=/swapfile
SWAP_SIZE=2G

log() { printf '\n\033[1;35m==>\033[0m %s\n' "$*"; }

if [[ $EUID -ne 0 ]]; then
  echo "Run this with sudo: sudo bash bootstrap.sh" >&2
  exit 1
fi

# ── Swap ──────────────────────────────────────────────────────────────
# 2 GB of RAM is enough to *run* the three services, but `npm ci` and
# `uv sync` both spike well past their steady state during a deploy. Swap is
# what keeps a deploy from OOM-killing the thing it is deploying.
log "Swap"
if [[ -f $SWAP_FILE ]]; then
  echo "already present"
else
  fallocate -l "$SWAP_SIZE" "$SWAP_FILE"
  chmod 600 "$SWAP_FILE"
  mkswap "$SWAP_FILE"
  swapon "$SWAP_FILE"
  echo "$SWAP_FILE none swap sw 0 0" >>/etc/fstab
  echo "created $SWAP_SIZE"
fi

log "Base packages"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq \
  curl ca-certificates gnupg rsync gettext-base \
  debian-keyring debian-archive-keyring apt-transport-https

# ── Node ──────────────────────────────────────────────────────────────
log "Node ${NODE_MAJOR}"
if command -v node >/dev/null && [[ "$(node -v)" == v${NODE_MAJOR}.* ]]; then
  echo "already $(node -v)"
else
  curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | bash -
  apt-get install -y -qq nodejs
  echo "installed $(node -v)"
fi

# ── uv (Python toolchain) ─────────────────────────────────────────────
# Installed system-wide rather than into a user's home: the deploy runs it as
# `ubuntu` and the venv it builds is read by `flowguard`.
log "uv"
if command -v uv >/dev/null; then
  echo "already $(uv --version)"
else
  curl -LsSf https://astral.sh/uv/install.sh | UV_INSTALL_DIR=/usr/local/bin sh
  echo "installed $(uv --version)"
fi

# ── Temporal CLI ──────────────────────────────────────────────────────
log "Temporal CLI"
if command -v temporal >/dev/null; then
  echo "already $(temporal --version)"
else
  # The installer drops it in the invoking user's home; move it somewhere the
  # systemd unit can reach with an absolute path.
  curl -sSf https://temporal.download/cli.sh | sh
  install -m 755 "${HOME:-/root}/.temporalio/bin/temporal" /usr/local/bin/temporal
  echo "installed $(temporal --version)"
fi

# ── Caddy ─────────────────────────────────────────────────────────────
log "Caddy"
if command -v caddy >/dev/null; then
  echo "already $(caddy version)"
else
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' \
    | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' \
    >/etc/apt/sources.list.d/caddy-stable.list
  apt-get update -qq
  apt-get install -y -qq caddy
  echo "installed $(caddy version)"
fi

# ── Service user and layout ───────────────────────────────────────────
#
# Ownership is deliberately lopsided:
#
#   /opt/flowguard   ubuntu:ubuntu 755  — the deploy rsyncs here as `ubuntu`;
#                                         `flowguard` only ever reads it.
#   .env files       flowguard:flowguard 600 — written by the deploy via
#                                         `install`, unreadable to anyone else.
#   /var/lib/flowguard flowguard 750    — the only thing a service writes.
#
# That combination means the deploy never needs to sudo to place code, and the
# service account never needs write access to the code it runs.
log "Service user and directories"
if id "$SERVICE_USER" &>/dev/null; then
  echo "user $SERVICE_USER already exists"
else
  useradd --system --home-dir "$STATE_DIR" --shell /usr/sbin/nologin "$SERVICE_USER"
  echo "created user $SERVICE_USER"
fi

install -d -o ubuntu -g ubuntu -m 755 \
  "$APP_ROOT" "$APP_ROOT/server" "$APP_ROOT/agent" "$APP_ROOT/client" "$APP_ROOT/deploy"
install -d -o "$SERVICE_USER" -g "$SERVICE_USER" -m 750 "$STATE_DIR"
echo "layout ready under $APP_ROOT"

# ── SSH hardening ─────────────────────────────────────────────────────
# Port 22 is open to the internet (GitHub-hosted runners have no stable IP
# range worth allowlisting), so keys are the only thing standing in front of it.
# Assert that rather than trusting the AMI default.
log "SSH hardening"
cat >/etc/ssh/sshd_config.d/99-flowguard.conf <<'CONF'
PasswordAuthentication no
PermitRootLogin no
KbdInteractiveAuthentication no
CONF
if sshd -t; then
  systemctl reload ssh 2>/dev/null || systemctl reload sshd
  echo "password auth off, root login off"
else
  echo "sshd config test FAILED — leaving the running config alone" >&2
  exit 1
fi

log "Done"
cat <<SUMMARY

  node     $(node -v)
  npm      $(npm -v)
  uv       $(uv --version)
  temporal $(temporal --version)
  caddy    $(caddy version | head -1)

Next: add your deploy key to ~ubuntu/.ssh/authorized_keys, then push to master.
The workflow installs the systemd units, the Caddy config and the app itself.

SUMMARY
