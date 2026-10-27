#!/bin/bash
set -euo pipefail
BASE="https://raw.githubusercontent.com/jackdelenbaas-sys/atlas-ai/main"
TARGET="$HOME/atlas-bridge-v2.py"
PLIST="$HOME/Library/LaunchAgents/io.atlasai.private-bridge.plist"
mkdir -p "$HOME/Library/LaunchAgents"
if [ -f "$TARGET" ]; then cp "$TARGET" "$TARGET.previous"; fi
echo "Downloading Atlas private research bridge from your own GitHub repository..."
curl -fLSs "$BASE/atlas-bridge-v2.py" -o "$TARGET"
PYTHON="$(command -v python3)"
"$PYTHON" -m py_compile "$TARGET"
echo "Stopping the older Atlas bridge if it is running..."
PORT_PID="$(lsof -tiTCP:11435 -sTCP:LISTEN 2>/dev/null || true)"
if [ -n "$PORT_PID" ]; then kill $PORT_PID 2>/dev/null || true; sleep 2; fi
cat > "$PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>Label</key><string>io.atlasai.private-bridge</string>
<key>ProgramArguments</key><array>
<string>$PYTHON</string>
<string>$TARGET</string>
</array>
<key>RunAtLoad</key><true/>
<key>KeepAlive</key><true/>
<key>StandardOutPath</key><string>$HOME/atlas-bridge-v2.log</string>
<key>StandardErrorPath</key><string>$HOME/atlas-bridge-v2.log</string>
</dict></plist>
EOF
USER_DOMAIN="gui/$(id -u)"
launchctl bootout "$USER_DOMAIN/io.atlasai.private-bridge" 2>/dev/null || true
launchctl bootstrap "$USER_DOMAIN" "$PLIST"
launchctl kickstart -k "$USER_DOMAIN/io.atlasai.private-bridge"
sleep 2
echo ""
echo "Local bridge check:"
curl -fLsS --max-time 6 "http://127.0.0.1:11435/atlas/status" || true
echo ""
echo ""
echo "Private Tailscale HTTPS check:"
curl -fLsS --max-time 10 "https://erins-mac-mini.tail04f5e9.ts.net/atlas/status" || true
echo ""
echo "Setup finished. Keep Ollama and Tailscale connected."
echo "To uninstall the new bridge later: launchctl bootout $USER_DOMAIN/io.atlasai.private-bridge; rm -f '$PLIST' '$TARGET'"
