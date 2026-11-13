# Atlas — Free daily chat and images

Atlas uses Cloudflare Workers AI through the AI binding in wrangler.jsonc. No OpenAI key or paid-provider fallback is used.

Keep the Cloudflare Workers account on the Free plan. The free allocation is account-wide, shared by chat, image understanding and image generation, and resets at midnight UTC. Image requests consume more of that allowance. Workers Paid accounts can bill overage.

Required runtime binding: AI (Workers AI). Required runtime secret: ATLAS_ACCESS_TOKEN, matching Atlas Settings. Existing configured tokens are preserved on deployment.

Supported: text chat, text attachments, JPEG/PNG/WebP image understanding with Llama 4 Scout, and new images and direct reference-image editing with FLUX.2 Klein 4B. Uploaded images are resized in the browser; up to three attachments per message. Images can be displayed in the studio, downloaded, pasted or dropped, and retained in this browser through IndexedDB.

Edit image attaches the selected original for direct editing. Follow-up instructions such as “make it green” automatically use the latest image in the current conversation. Reference images are resized below 512 pixels to meet the model input limit. The model can still change unintended details; pixel-perfect preservation is not guaranteed. No live web image search, PDF understanding or video generation is enabled.

Studio buttons control gestures and walking without using AI quota. Each answer runs a short context-matched gesture sequence; new requests and Stop cancel it. Natural movement adds occasional idle variations and respects reduced-motion preferences. Uploaded and generated images appear on the studio screen automatically.

Daily-limit errors include the next UTC reset; requests work again when the provider resets its quota. The connection test also consumes a small amount of the same allowance.
