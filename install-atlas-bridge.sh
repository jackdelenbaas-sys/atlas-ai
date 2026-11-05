#!/bin/bash
# Backward-compatible installer entrypoint. Atlas 8 no longer uses local Ollama or search scrapers.
set -euo pipefail
echo "Atlas has moved to the OpenAI API connection. Installing Atlas Cloud Bridge instead…"
curl --retry 3 --connect-timeout 10 -fLSs "https://raw.githubusercontent.com/jackdelenbaas-sys/atlas-ai/main/install-atlas-cloud.sh" -o "$HOME/install-atlas-cloud.sh"
bash "$HOME/install-atlas-cloud.sh"
