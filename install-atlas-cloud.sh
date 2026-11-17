#!/bin/bash
set -euo pipefail
BASE="https://raw.githubusercontent.com/jackdelenbaas-sys/atlas-ai/main"
TARGET="$HOME/atlas-cloud-bridge.py"
KEY="$HOME/.atlas-openai-key"
PLIST="$HOME/Library/LaunchAgents/io.atlasai.private-bridge.plist"
PYTHON="$(command -v python3)"
mkdir -p "$HOME/Library/LaunchAgents"
echo "Atlas 8.0 — switching from local Qwen/Ollama to OpenAI API"
echo "Downloading Atlas's new private cloud bridge…"
curl --retry 3 --connect-timeout 10 -fLSs "$BASE/atlas-cloud-bridge.py" -o "$TARGET"
"$PYTHON" -m py_compile "$TARGET"
chmod 600 "$TARGET"
if [ ! -s "$KEY" ]; then
  echo ""
  echo "Atlas needs an OpenAI API key. It will be saved privately on this Mac."
  echo "You can create a key at https://platform.openai.com/api-keys"
  read -r -p "Enter your API key now? [y/N]: " answer
  if [[ "$answer" =~ ^[Yy]$ ]]; then
    read -r -s -p "Paste your OpenAI API key (hidden): " NEW_KEY
    echo ""
    if [[ "$NEW_KEY" == sk-* ]]; then
      (umask 077; printf '%s' "$NEW_KEY" > "$KEY")
      echo "Key saved privately to $KEY"
    else
      echo "That did not look like an API key. No key was saved."
    fi
    unset NEW_KEY
  fi
else
  chmod 600 "$KEY"
  echo "Existing private API key found."
fi
echo "Restarting Atlas's private bridge…"
USER_DOMAIN="gui/$(id -u)"
launchctl bootout "$USER_DOMAIN/io.atlasai.private-bridge" 2>/dev/null || true
LISTENER="$(lsof -tiTCP:11435 -sTCP:LISTEN 2>/dev/null || true)"
if [ -n "$LISTENER" ]; then kill $LISTENER 2>/dev/null || true; sleep 1; fi
cat > "$PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>Label</key><string>io.atlasai.private-bridge</string>
<key>ProgramArguments</key><array><string>$PYTHON</string><string>$TARGET</string></array>
<key>RunAtLoad</key><true/>
<key>KeepAlive</key><true/>
<key>StandardOutPath</key><string>$HOME/atlas-cloud-bridge.log</string>
<key>StandardErrorPath</key><string>$HOME/atlas-cloud-bridge.log</string>
</dict></plist>
EOF
launchctl bootstrap "$USER_DOMAIN" "$PLIST"
launchctl kickstart -k "$USER_DOMAIN/io.atlasai.private-bridge"
sleep 2
echo ""
echo "Local Atlas status:"
curl -fLsS --max-time 8 "http://127.0.0.1:11435/atlas/api/status" || true
echo ""
echo "Secure Tailscale status:"
curl -fLsS --max-time 12 "https://erins-mac-mini.tail04f5e9.ts.net/atlas/api/status" || true
echo ""
if [ ! -s "$KEY" ]; then
 echo "API key is still needed. Re-run this installer after creating a key."
else
 echo "Atlas backend is installed. The API key is configured; live chat still needs a paid API account with credits."
fi
if [ -s "$KEY" ]; then
 echo ""
 echo "===== LIVE OPENAI API TEST ====="
 echo "This sends one tiny paid model request to confirm key access and billing."
 if curl -fLsS --max-time 55 "http://127.0.0.1:11435/atlas/api/diagnose" | "$PYTHON" -c 'import sys,json; d=json.load(sys.stdin); print("AI:", d.get("model"), "Reply:", d.get("reply"), "Connected:", d.get("connected"))'; then
  echo "Live AI test completed."
 else
  echo "AI was not verified. Check your API key, project permissions, available credits and Atlas Settings."
 fi
fi
echo "Open https://jackdelenbaas-sys.github.io/atlas-ai/?v=84"
echo "The old Ollama model is no longer used by Atlas. It has NOT been deleted from your Mac."
