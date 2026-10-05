#!/usr/bin/env bash
# Packet filter for the Metro port (PLAN ADR-12, row 0.3, step S3).
#
# Run by Samuel, once per boot, BEFORE the first Metro start. It needs sudo, and no agent runs it.
# It puts a dedicated chain METRO-8091 in front of port 8091 on IPv4 and IPv6: loopback and
# tailscale0 are accepted, everything else is dropped. Safe to re-run: a second run flushes and
# refills the chain instead of failing on -N or adding a second jump. The rules do not survive a
# reboot; start-metro.sh refuses to start Metro without them.
set -euo pipefail

sudo iptables -N METRO-8091 2>/dev/null || sudo iptables -F METRO-8091
sudo iptables -A METRO-8091 -i lo -j ACCEPT
sudo iptables -A METRO-8091 -i tailscale0 -j ACCEPT
sudo iptables -A METRO-8091 -j DROP
sudo iptables -C INPUT -p tcp --dport 8091 -j METRO-8091 2>/dev/null || sudo iptables -I INPUT 1 -p tcp --dport 8091 -j METRO-8091
sudo ip6tables -N METRO-8091 2>/dev/null || sudo ip6tables -F METRO-8091
sudo ip6tables -A METRO-8091 -i lo -j ACCEPT
sudo ip6tables -A METRO-8091 -i tailscale0 -j ACCEPT
sudo ip6tables -A METRO-8091 -j DROP
sudo ip6tables -C INPUT -p tcp --dport 8091 -j METRO-8091 2>/dev/null || sudo ip6tables -I INPUT 1 -p tcp --dport 8091 -j METRO-8091

echo "METRO-8091 installed for IPv4 and IPv6. Next: from the phone on mobile data, both public addresses must time out."
