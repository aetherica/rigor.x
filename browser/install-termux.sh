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
proot-distro login debian -- sh -lc 'apt-get update && apt-get install -y firefox-esr geckodriver'
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
