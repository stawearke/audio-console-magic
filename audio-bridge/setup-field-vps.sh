#!/usr/bin/env bash
# MK VISION field relay: MediaMTX (WebRTC + SRT in, WebRTC out) behind Caddy HTTPS, on a fresh Ubuntu/Debian VPS.
#
#   sudo bash setup-field-vps.sh relay.example.com [units=6] [https://your-app-url]
#
# Needs: a domain (A record -> this VPS) so the camera page can run on https.
# Writes every link you need to /root/field-links.txt (keep it private).
# MK_DRY=1 only writes the config to ./out (no install), for checking.
set -euo pipefail

DOMAIN="${1:?Usage: setup-field-vps.sh relay.example.com [units] [app-url]}"
UNITS="${2:-6}"
APP="${3:-https://YOUR-APP-URL}"
DRY="${MK_DRY:-0}"
OUT="/etc/mediamtx"; LINKS="/root/field-links.txt"
[ "$DRY" = "1" ] && { OUT="./out"; LINKS="./out/field-links.txt"; mkdir -p "$OUT"; }

rnd() { openssl rand -hex 6; }
PUBIP="$(curl -fsS https://api.ipify.org || echo 0.0.0.0)"
[ "$DRY" = "1" ] && PUBIP="203.0.113.10"
READ="$(rnd)"

if [ "$DRY" != "1" ]; then
  [ "$(id -u)" = 0 ] || { echo "Run with sudo."; exit 1; }
  apt-get update -y
  apt-get install -y curl openssl ufw debian-keyring debian-archive-keyring apt-transport-https gpg
  # --- MediaMTX
  case "$(uname -m)" in x86_64) A=linux_amd64;; aarch64) A=linux_arm64;; *) echo "Unsupported CPU"; exit 1;; esac
  URL="$(curl -fsS https://api.github.com/repos/bluenviron/mediamtx/releases/latest | grep browser_download_url | grep "${A}.tar.gz" | head -1 | cut -d'"' -f4)"
  [ -n "$URL" ] || { echo "Could not find the MediaMTX download (GitHub rate limit?). Try again in a minute."; exit 1; }
  curl -fsSL "$URL" -o /tmp/mtx.tgz && tar xzf /tmp/mtx.tgz -C /tmp mediamtx && install -m 755 /tmp/mediamtx /usr/local/bin/mediamtx
  mkdir -p "$OUT"
  # --- Caddy (automatic https)
  if ! command -v caddy >/dev/null; then
    curl -fsSL https://dl.cloudsmith.io/public/caddy/stable/gpg.key | gpg --dearmor -o /usr/share/keyrings/caddy.gpg
    echo "deb [signed-by=/usr/share/keyrings/caddy.gpg] https://dl.cloudsmith.io/public/caddy/stable/deb/debian any-version main" > /etc/apt/sources.list.d/caddy.list
    apt-get update -y && apt-get install -y caddy
  fi
fi

# --- MediaMTX config: one publisher user per field unit (only its own path), one read user for the studio
{
cat <<YML
# Written by setup-field-vps.sh
api: false
rtsp: false
rtmp: false
hls: false
srt: true
srtAddress: :8890
webrtc: true
webrtcAddress: 127.0.0.1:8889
webrtcEncryption: false
webrtcAllowOrigins: ["*"]
webrtcTrustedProxies: ["127.0.0.1"]
webrtcLocalUDPAddress: :8189
webrtcLocalTCPAddress: :8189
webrtcIPsFromInterfaces: false
webrtcAdditionalHosts: ["$PUBIP"]
authMethod: internal
authInternalUsers:
  - user: studio
    pass: $READ
    permissions:
      - action: read
YML
for i in $(seq 1 "$UNITS"); do
  P="$(rnd)"; echo "$P" > "$OUT/.pw$i"
  cat <<YML
  - user: f$i
    pass: $P
    permissions:
      - action: publish
        path: field$i
YML
done
echo "paths:"
echo "  all_others:"
} > "$OUT/mediamtx.yml"
chmod 600 "$OUT/mediamtx.yml"

# --- links
{
echo "MK VISION field relay: $DOMAIN  (server IP $PUBIP)"
echo
for i in $(seq 1 "$UNITS"); do
  P="$(cat "$OUT/.pw$i")"; rm -f "$OUT/.pw$i"
  echo "== FIELD $i"
  echo "Reporter (browser):  $APP/field?server=https://$DOMAIN&path=field$i&user=f$i&pass=$P"
  echo "Reporter (backup):   https://$DOMAIN/field$i/publish?user=f$i&pass=$P"
  echo "OBS web source:      https://$DOMAIN/field$i?controls=false&muted=false&autoplay=true&user=studio&pass=$READ"
  echo "SRT publish (Larix): srt://$DOMAIN:8890?streamid=publish:field$i:f$i:$P"
  echo "SRT read (OBS media):srt://$DOMAIN:8890?streamid=read:field$i:studio:$READ"
  echo
done
} > "$LINKS"
chmod 600 "$LINKS"

if [ "$DRY" = "1" ]; then echo "Dry run: see ./out"; exit 0; fi

cat > /etc/systemd/system/mediamtx.service <<UNIT
[Unit]
Description=MediaMTX field relay
After=network.target
[Service]
ExecStart=/usr/local/bin/mediamtx /etc/mediamtx/mediamtx.yml
Restart=always
[Install]
WantedBy=multi-user.target
UNIT
printf '%s {\n  reverse_proxy 127.0.0.1:8889\n}\n' "$DOMAIN" > /etc/caddy/Caddyfile
ufw allow 22/tcp; ufw allow 80/tcp; ufw allow 443/tcp; ufw allow 8189/udp; ufw allow 8189/tcp; ufw allow 8890/udp
ufw --force enable
systemctl daemon-reload && systemctl enable --now mediamtx && systemctl restart caddy
echo
echo "Done. Your links are in $LINKS"
cat "$LINKS"
