#!/usr/bin/env bash
set -euo pipefail
if [[ -z "${PREFIX:-}" || ! -d "${PREFIX}" ]]; then
 echo "This installer is intended for Termux." >&2; exit 1
fi
echo "[1/3] Install Termux runtime and proot"
pkg update -y
pkg install -y nodejs-lts proot-distro git
echo "[2/3] Install Debian container (first run may take time)"
if ! proot-distro list | grep -q '^debian'; then proot-distro install debian; fi
echo "[3/3] Install Firefox ESR and GeckoDriver in Debian"
# Debian has no geckodriver package; Mozilla publishes an official linux-aarch64 build on GitHub.
proot-distro login debian -- sh -lc '
set -e
apt-get update
apt-get install -y firefox-esr curl ca-certificates
if ! command -v geckodriver >/dev/null 2>&1; then
 case "$(uname -m)" in aarch64|arm64) arch=linux-aarch64;; x86_64) arch=linux64;; *) echo "No official geckodriver build for $(uname -m)" >&2; exit 1;; esac
 tag=$(curl -fsSLI -o /dev/null -w "%{url_effective}" https://github.com/mozilla/geckodriver/releases/latest | sed "s#.*/tag/##")
 [ -n "$tag" ] || tag=v0.36.0
 curl -fL "https://github.com/mozilla/geckodriver/releases/download/$tag/geckodriver-$tag-$arch.tar.gz" | tar -xz -C /usr/local/bin geckodriver
 chmod +x /usr/local/bin/geckodriver
fi
firefox-esr --version
geckodriver --version | head -1
'
cat <<'MSG'

Security: keep GeckoDriver on 127.0.0.1. Binding it to 0.0.0.0 lets anyone on the same Wi-Fi
control the browser.

Installation attempted. Check package availability before assuming success.
Start GeckoDriver inside Debian:
  proot-distro login debian -- geckodriver --host 127.0.0.1 --port 4444

Then in Termux, run the MCP server from the repository:
  AETHERICA_GECKODRIVER_URL=http://127.0.0.1:4444 node --experimental-strip-types browser/server.ts

Firefox ESR headless in proot on Android ARM may not work on every device/ROM.
No CAPTCHA, login or paywall bypass is supported. The browser adapter currently has no Tor egress.
MSG
