# Atlas AI 8.3 — Cloud API setup

Atlas's old Qwen/Ollama and scraped-search code is no longer used by the website. The 3D human, 20+ Mixamo motions and studio remain unchanged.

## One-time setup (Mac)

1. Create an OpenAI Platform API key at https://platform.openai.com/api-keys (API usage is billed separately from ChatGPT subscriptions).
2. Keep Tailscale connected to the existing tailnet on your Mac and any iPhone that needs to reach Atlas.
3. In Terminal, run:

   curl -fLSs "https://raw.githubusercontent.com/jackdelenbaas-sys/atlas-ai/main/install-atlas-cloud.sh" -o "$HOME/install-atlas-cloud.sh" && bash "$HOME/install-atlas-cloud.sh"

4. When prompted, paste your API key into **Terminal only**. Input is hidden; the key is saved to \`~/.atlas-openai-key\` with file permissions restricted to your account.
5. Open https://jackdelenbaas-sys.github.io/atlas-ai/?v=83, Settings → **Test API connection**.

No key belongs in \`index.html\`, GitHub issues, commit messages, or chat.

## Features
- OpenAI Responses API, GPT-6 Luna for fast replies or GPT-6.1 Sol for smarter (more expensive) replies, with built-in web search and inline citations.
- Multi-file input: photos, PDF, DOCX, XLSX, PPTX, text and code; sampled frames from video clips (not complete video/audio analysis).
- AI image generation and image references, and Sora video creation when API permissions and credits allow.
- Basic microphone dictation and synthesized read-aloud where supported by Safari.
- Avatar motions (wave, dance, point, greet, idle, think, walk) triggered by AI action tags or direct user instructions.
- Conversation history and saved notes stored **in the current browser**. Not synced automatically across devices.
- API key and all API requests on your local private bridge, served over Tailscale HTTPS. Mac must remain on and connected.

## Safety & operational limits
- The bridge binds only \`127.0.0.1:11435\`; only the authorized Tailscale network should reach its HTTPS forwarding rule. Do not use Tailscale Funnel.
- API responses use \`store:false\`, but uploaded content is still processed by the provider under your account's data handling terms.
- Web search may incur tool fees. Image and Sora video generation incur additional charges and may require entitlement; a ChatGPT Plus subscription is not an API credit balance.
- A successful \`/atlas/api/status\` confirms the bridge and key presence, not billing. Use **Test API connection** to perform a live tiny model call.
- Source links in model responses should be reviewed for high-stakes decisions.
- Generated media isn't permanently backed up by Atlas; download images and videos when created. Attachments are sent with that request, not uploaded to GitHub.
- Do not share your Tailscale hostname and key together in a publicly accessible app. Do not store API secrets in browser JavaScript.

## Undo / clean up
Stop the API bridge by running:
\`launchctl bootout gui/$(id -u)/io.atlasai.private-bridge\`
To remove its key file, run:
\`rm "$HOME/.atlas-openai-key"\`
To remove old Ollama models or uninstall Tailscale, follow their official uninstall guides separately; this installer intentionally does not delete other apps or files.

The old \`install-atlas-bridge.sh\` now forwards to the new cloud installer for compatibility.
