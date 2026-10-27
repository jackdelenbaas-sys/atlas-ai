#!/bin/bash
set -euo pipefail
BASE="https://raw.githubusercontent.com/jackdelenbaas-sys/atlas-ai/main"
TARGET="$HOME/atlas-bridge-v2.py"
PLIST="$HOME/Library/LaunchAgents/io.atlasai.private-bridge.plist"
mkdir -p "$HOME/Library/LaunchAgents"
if [ -f "$TARGET" ]; then cp "$TARGET" "$TARGET.previous"; fi
echo "Downloading Atlas private research bridge from your own GitHub repository..."
curl --retry 3 --connect-timeout 10 -fLSs "$BASE/atlas-bridge-v2.py" -o "$TARGET"
PYTHON="$(command -v python3)"
"$PYTHON" -m py_compile "$TARGET"
echo "Stopping the older Atlas bridge if it is running..."
PORT_PID="$(lsof -tiTCP:11435 -sTCP:LISTEN 2>/dev/null || true)"
if [ -n "$PORT_PID" ]; then kill $PORT_PID 2>/dev/null || true; sleep 1; fi
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
printf "\n===== Ollama local model =====\n"
curl -fLsS --max-time 8 "http://127.0.0.1:11434/api/tags" | "$PYTHON" -c 'import sys,json; d=json.load(sys.stdin); print("Installed models:",", ".join(x["name"] for x in d.get("models",[])))' || echo "Ollama unavailable. Open the Ollama app."
echo ""
echo "Local bridge check:"
curl -fLsS --max-time 6 "http://127.0.0.1:11435/atlas/status" || true
echo ""
echo ""
echo "Private Tailscale HTTPS check:"
curl -fLsS --max-time 10 "https://erins-mac-mini.tail04f5e9.ts.net/atlas/status" || true
echo ""
echo ""
echo "WEB SEARCH SMOKE CHECK:"
curl -fLsS --max-time 18 "http://127.0.0.1:11435/atlas/search?q=Zeeland%20Michigan&type=web" | "$PYTHON" -c 'import sys,json; d=json.load(sys.stdin); print("Provider:",d.get("provider"),"Results:",len(d.get("results",[])),"Error:",d.get("error","none"))' || echo "Search test failed; use the app diagnostics for details."
echo ""
echo "===== Private HTTPS and full internet diagnostics ====="
curl -fLsS --max-time 95 "https://erins-mac-mini.tail04f5e9.ts.net/atlas/diagnostics" | "$PYTHON" -c 'import sys,json; d=json.load(sys.stdin); print("Bridge:",d.get("bridge")); [print(n+":",v.get("count",0),"results via",v.get("provider"),"Error:",v.get("error","")) for n,v in d.get("tests",{}).items()]' || echo "HTTPS search diagnostics unavailable; check Tailscale and the bridge log."
echo "Setup finished. Keep Ollama and Tailscale connected."
echo "To uninstall the new bridge later: launchctl bootout $USER_DOMAIN/io.atlasai.private-bridge; rm -f '$PLIST' '$TARGET'"
