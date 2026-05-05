#!/usr/bin/env bash
# =============================================================
# setup-vps.sh — Fresh Ubuntu 22.04/24.04 VPS setup
#
# Run as root (or with sudo):
#   curl -fsSL https://raw.githubusercontent.com/.../setup-vps.sh | bash
#   or: sudo bash scripts/setup-vps.sh
#
# What it installs:
#   - System updates + essential packages
#   - Docker Engine (official repo)
#   - Docker Compose v2
#   - UFW firewall (80, 443, 22 only)
#   - Unattended security upgrades
#   - Logrotate for Docker logs
# =============================================================
set -euo pipefail

# Must be root
if [[ "$EUID" -ne 0 ]]; then
  echo "❌  Run as root:  sudo bash $0"
  exit 1
fi

log() { echo -e "\n\033[1;32m▶  $*\033[0m"; }

APP_USER="${APP_USER:-deploy}"
APP_DIR="/opt/saas-restaurant"

# ── 1. System update ─────────────────────────────────────────
log "Updating system packages..."
apt-get update -qq
apt-get upgrade -y -qq
apt-get install -y -qq \
  curl wget git vim htop \
  ca-certificates gnupg \
  lsb-release gettext-base \
  unattended-upgrades \
  ufw fail2ban

# ── 2. Unattended security upgrades ──────────────────────────
log "Configuring automatic security updates..."
cat > /etc/apt/apt.conf.d/20auto-upgrades <<'EOF'
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
APT::Periodic::AutocleanInterval "7";
EOF
systemctl enable --now unattended-upgrades

# ── 3. Docker Engine ─────────────────────────────────────────
log "Installing Docker Engine..."
if ! command -v docker &> /dev/null; then
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg \
    | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
  chmod a+r /etc/apt/keyrings/docker.gpg

  echo \
    "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
    https://download.docker.com/linux/ubuntu \
    $(lsb_release -cs) stable" \
    > /etc/apt/sources.list.d/docker.list

  apt-get update -qq
  apt-get install -y -qq docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
  systemctl enable --now docker
  echo "✅  Docker $(docker --version) installed."
else
  echo "   Docker already installed: $(docker --version)"
fi

# ── 4. App user ───────────────────────────────────────────────
log "Creating app user: $APP_USER..."
if ! id "$APP_USER" &> /dev/null; then
  useradd --create-home --shell /bin/bash "$APP_USER"
fi
usermod -aG docker "$APP_USER"
echo "   $APP_USER added to docker group."

# ── 5. App directory ──────────────────────────────────────────
log "Setting up app directory: $APP_DIR..."
mkdir -p "$APP_DIR"
chown "$APP_USER:$APP_USER" "$APP_DIR"

# ── 6. Firewall (UFW) ─────────────────────────────────────────
log "Configuring UFW firewall..."
ufw --force reset
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp   comment "SSH"
ufw allow 80/tcp   comment "HTTP"
ufw allow 443/tcp  comment "HTTPS"
ufw --force enable
ufw status verbose

# ── 7. Fail2ban ───────────────────────────────────────────────
log "Configuring fail2ban (SSH brute-force protection)..."
cat > /etc/fail2ban/jail.local <<'EOF'
[DEFAULT]
bantime  = 1h
findtime = 10m
maxretry = 5

[sshd]
enabled = true
EOF
systemctl enable --now fail2ban

# ── 8. Docker log rotation ────────────────────────────────────
log "Configuring Docker daemon log rotation..."
mkdir -p /etc/docker
cat > /etc/docker/daemon.json <<'EOF'
{
  "log-driver": "json-file",
  "log-opts": {
    "max-size": "20m",
    "max-file": "5"
  }
}
EOF
systemctl restart docker

# ── 9. SSH hardening ─────────────────────────────────────────
log "Hardening SSH (disabling root password login)..."
sed -i 's/^#*PermitRootLogin.*/PermitRootLogin prohibit-password/'   /etc/ssh/sshd_config
sed -i 's/^#*PasswordAuthentication.*/PasswordAuthentication no/'    /etc/ssh/sshd_config
sed -i 's/^#*X11Forwarding.*/X11Forwarding no/'                      /etc/ssh/sshd_config
systemctl reload sshd
echo "   SSH: root password login disabled, password auth disabled."

# ── Done ─────────────────────────────────────────────────────
echo ""
echo "╔══════════════════════════════════════════════════════════╗"
echo "║  ✅  VPS setup complete!                                 ║"
echo "║                                                          ║"
echo "║  Next steps (as $APP_USER):                              ║"
echo "║    su - $APP_USER                                         ║"
echo "║    cd $APP_DIR                                           ║"
echo "║    git clone <repo-url> .                                ║"
echo "║    cp .env.example .env && nano .env                     ║"
echo "║    ./scripts/generate-secrets.sh  # fill secrets        ║"
echo "║    make up                                               ║"
echo "║    ./scripts/init-ssl.sh <domain> <email>               ║"
echo "╚══════════════════════════════════════════════════════════╝"
