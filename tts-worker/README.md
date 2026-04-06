# Edge TTS Cloudflare Worker

A free, zero-key proxy that turns Microsoft Edge's neural "Read Aloud" voices
into a plain `audio/mpeg` HTTP endpoint your static site can call from anywhere.

## One-time deploy (≈ 3 minutes)

1. Create a free Cloudflare account: https://dash.cloudflare.com/sign-up
2. Install Wrangler (Cloudflare's CLI) — needs Node.js 18+:
   ```
   npm install -g wrangler
   ```
3. Log in (opens a browser tab):
   ```
   wrangler login
   ```
4. From this folder, deploy:
   ```
   cd tts-worker
   wrangler deploy
   ```
   Wrangler prints a URL like `https://tts.<your-subdomain>.workers.dev`.
5. Copy that URL and paste it into `screen-reader.js` as `TTS_WORKER_URL`
   (top of the VoiceEngine block). Commit and push.

## Test it

Open in your browser:
```
https://tts.<your-subdomain>.workers.dev/?text=नमस्ते दुनिया&lang=hi
```
You should hear Hindi neural speech.

## Query parameters

| param | required | default | notes                                  |
|-------|----------|---------|----------------------------------------|
| text  | yes      | —       | Max 2000 chars per request             |
| lang  | no       | en      | Translation code (hi, ta, fr, zh-CN …) |
| voice | no       | auto    | Full Edge voice name override          |
| rate  | no       | 0       | Integer percent, e.g. `-10` or `+20`   |

## Limits

- Cloudflare free tier: **100,000 requests/day** (shared across all your Workers).
- Each request is a single chunk (≤ 2000 chars); the client chunks longer text automatically.
- Responses are cached for 24 h at Cloudflare's edge (same text+lang = instant).
