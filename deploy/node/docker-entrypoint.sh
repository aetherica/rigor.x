#!/bin/sh
# Starts Tor for the dark-web layer (DL04) when TOR_ENABLED=1, waits until it has bootstrapped,
# then runs the server. Tor listens on 127.0.0.1 only; no other port is opened.
set -eu
if [ "${TOR_ENABLED:-0}" = "1" ]; then
	TOR_DIR="${DATA_DIR:-/data}/tor"
	mkdir -p "$TOR_DIR" && chmod 700 "$TOR_DIR"
	tor --SocksPort 127.0.0.1:9050 --DataDirectory "$TOR_DIR" --Log "notice file $TOR_DIR/tor.log" --RunAsDaemon 1
	export TOR_SOCKS_URL="${TOR_SOCKS_URL:-socks5h://127.0.0.1:9050}"
	i=0
	until grep -q "Bootstrapped 100%" "$TOR_DIR/tor.log" 2>/dev/null; do
		i=$((i + 1))
		if [ "$i" -gt 120 ]; then echo "tor did not bootstrap within 120 s; onion checks will fail until it does" >&2; break; fi
		sleep 1
	done
fi
exec "$@"
