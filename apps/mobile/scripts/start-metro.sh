#!/usr/bin/env bash
# The ONLY way Metro starts on this box (PLAN ADR-12). Never run `expo start` directly and never
# use --tunnel: a tunnel is a public URL, and the packet filter cannot cover it.
#
# It exits 1 unless the packet filter of metro-firewall.sh is in place, for IPv4 and IPv6:
#   iptables  -C INPUT -p tcp --dport 8091 -j METRO-8091
#   iptables  -C METRO-8091 -j DROP
#   ip6tables -C INPUT -p tcp --dport 8091 -j METRO-8091
#   ip6tables -C METRO-8091 -j DROP
# Then it starts Metro on the tailnet address and prints the listener of the port.
# Reviewer sessions run only while Metro is stopped (`ss -ltn | grep 8091` is empty).
set -euo pipefail

PORT=8091
TAILNET_IP=100.69.123.19

cd "$(dirname "$0")/.."

# -C needs root. `sudo -n` never prompts: when sudo would ask for a password the check fails closed.
SUDO=""
if [ "$(id -u)" -ne 0 ]; then SUDO="sudo -n"; fi

missing=0
check() {
  if $SUDO "$@" >/dev/null 2>&1; then
    echo "ok: $SUDO $*"
  else
    echo "MISSING: $SUDO $*" >&2
    missing=1
  fi
}
check iptables -C INPUT -p tcp --dport "$PORT" -j METRO-8091
check iptables -C METRO-8091 -j DROP
check ip6tables -C INPUT -p tcp --dport "$PORT" -j METRO-8091
check ip6tables -C METRO-8091 -j DROP
if [ "$missing" -ne 0 ]; then
  echo "start-metro: the packet filter is not in place. Samuel runs apps/mobile/scripts/metro-firewall.sh (step S3), then retry." >&2
  exit 1
fi

if ss -ltn | grep -q ":$PORT "; then
  echo "start-metro: port $PORT already has a listener. Stop it first." >&2
  exit 1
fi

REACT_NATIVE_PACKAGER_HOSTNAME="$TAILNET_IP" npx expo start --port "$PORT" --host lan &
METRO_PID=$!
trap 'kill "$METRO_PID" 2>/dev/null || true' INT TERM

for _ in $(seq 1 120); do
  if ss -ltn | grep -q ":$PORT "; then break; fi
  sleep 1
done
echo "listener (expected *:$PORT, or 0.0.0.0:$PORT and [::]:$PORT):"
ss -ltn | grep ":$PORT " || echo "start-metro: no listener on $PORT after 120 s" >&2

wait "$METRO_PID"
