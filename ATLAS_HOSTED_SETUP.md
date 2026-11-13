# Atlas — Free daily chat

Atlas uses Cloudflare Workers AI directly through the AI binding declared in wrangler.jsonc. No OpenAI key, API credits, external provider account or paid-provider fallback is used.

Keep the Cloudflare Workers account on the Free plan. Cloudflare's free daily allocation is account-wide and stops when exhausted, resetting at midnight UTC. On a Workers Paid account Cloudflare can bill overage; do not upgrade for this setup.

Required runtime binding: AI (Workers AI). Required private runtime secret: ATLAS_ACCESS_TOKEN (at least 24 characters), matching Atlas's Settings token. Existing configured owner tokens are preserved on deployment. The OpenAI key is ignored and can be removed from runtime settings.

Supported: text chat, saved browser history and memory notes, text attachments, avatar commands, browser microphone input where available, browser speech output.

Not enabled in this free text setup: live web search, image/PDF/video understanding, image/video generation. Unsupported attachments are rejected before inference; Atlas must not claim to have read them.

The connection test uses a small inference request from the same daily allocation. A daily-limit message includes the next UTC reset. There is no sticky lockout: requests can succeed again after the provider resets its quota.

If a deployment reports a missing AI binding, redeploy the checked-in Wrangler configuration. There is no need to create or copy a new provider API key.
