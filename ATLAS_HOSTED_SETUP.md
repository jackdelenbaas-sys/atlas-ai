# Atlas — Free daily chat and images

Atlas uses Cloudflare Workers AI through the AI binding in wrangler.jsonc. No OpenAI key is used. Optional free-plan Groq and Gemini connections can supplement Cloudflare.

Keep the Cloudflare Workers account on the Free plan. The free allocation is account-wide, shared by chat, image understanding and image generation, and resets at midnight UTC. Image requests consume more of that allowance. Workers Paid accounts can bill overage.

Required runtime binding: AI (Workers AI). Required runtime secret: ATLAS_ACCESS_TOKEN, matching Atlas Settings. Existing configured tokens are preserved on deployment.

Supported: text chat, text attachments, JPEG/PNG/WebP image understanding with Llama 4 Scout, and new images and direct reference-image editing with FLUX.2 Klein 4B. Uploaded images are resized in the browser; up to three attachments per message. Images can be displayed in the studio, downloaded, pasted or dropped, and retained in this browser through IndexedDB.

Edit image attaches the selected original for direct editing. Follow-up instructions such as “make it green” automatically use the latest image in the current conversation. Reference images are resized below 512 pixels to meet the model input limit. The model can still change unintended details; pixel-perfect preservation is not guaranteed. No live web image search, PDF understanding or video generation is enabled.

Studio buttons control gestures and walking without using AI quota. Each answer runs a short context-matched gesture sequence; new requests and Stop cancel it. Natural movement adds occasional idle variations and respects reduced-motion preferences. Uploaded and generated images appear on the studio screen automatically.

Daily-limit errors include the next UTC reset; requests work again when the provider resets its quota. The connection test also consumes a small amount of the same allowance.

Atlas defaults to a brief, warm, witty and lightly sarcastic voice. Sass softens for serious topics and can be adjusted by saying “less sarcasm” or “more sass.” Familiarity grows from a local interaction counter and explicit saved preferences, not invented memories. No separate personality or memory AI calls are made. Browser memory stores at most 80 notes, selects up to eight within 1,100 characters for a request, and sends bounded recent conversation history. Say “remember that …”, “what do you remember”, or “forget …” to manage notes. Clearing all memory also resets familiarity. Default chat output is capped at 320 tokens; requests for detailed explanations, drafts or code can use 900 tokens.

Studio controls now start collapsed in a native expandable menu; Escape or clicking outside closes it. Generic dance requests shuffle the hosted dance library, avoid the previous routine when another is available, and retain fallback clips if a download fails. Named dance requests retain their specific style. Replies are rendered before motion starts; a new command cancels a pending action. Stop remains available in the controls while AI is busy. Failed requests restore the original draft and attachments when they would not overwrite newer input. Animation metadata is separated from visible chat text.

## Optional free-plan backups

Text routing: Groq, then Gemini, then Cloudflare. Uploaded-photo understanding: Gemini, then Cloudflare. Image creation and editing remain on Cloudflare. This reserves more Cloudflare neurons for images; it does not increase Cloudflare’s account-wide allowance. Multiple keys for one account do not add quota.

Create a free Groq account/key at https://console.groq.com/keys and keep it on the Free plan. Add runtime secret GROQ_API_KEY and runtime text variable GROQ_FREE_PLAN=true to the existing Worker, then deploy. Gemini is optional: create a key in a free project with billing disabled at https://aistudio.google.com/apikey, then add GEMINI_API_KEY and GEMINI_FREE_PLAN=true. Never paste keys in chat, the frontend, or a public repository. The flags are owner attestations, not verification of billing status; do not enable them for paid accounts. No key alone activates a backup.

Backup failures fall through once to the next enabled provider; content-policy refusals do not. Each provider has its own limits and reset schedule. Connection status reports configured credentials, not a live quota balance or successful inference; Test connection runs a small inference through the available chain. Groq uses openai/gpt-oss-20b hosted by Groq, not OpenAI's API. Gemini uses gemini-3.5-flash-lite for text and photo understanding, not image generation. Current free-tier terms may allow provider use of submitted data; review provider terms before sending sensitive content.

No dependable free recurring video-generation API was verified. Video requests return an explicit unavailable error without calling chat or a paid generator. Hugging Face currently provides no free-user inference credits; Pollinations free rewards are quest-based, not automatic daily refills. Neither is enabled as a paid fallback.
