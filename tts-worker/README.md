# Azure Speech TTS — Cloudflare Worker

A thin proxy that turns Azure Cognitive Services' neural TTS into a simple
`audio/mpeg` HTTP endpoint your static site can call from anywhere. The Azure
subscription key lives in a Cloudflare Worker secret — never in source, never
in git.

## One-time setup

1. Create a Speech resource in Azure (Free **F0** tier is fine — 500k
   characters per month, no credit card).
2. From the resource's **Keys and Endpoint** page, copy **Key 1** and the
   **Location/Region** (e.g. `centralindia`). If your region is not
   `centralindia`, update `AZURE_REGION` at the top of `worker.js`.
3. Install Wrangler (needs Node.js 18+):
   ```
   npm install -g wrangler
   wrangler login
   ```
4. From this folder, store the key as an encrypted secret:
   ```
   cd tts-worker
   wrangler secret put AZURE_TTS_KEY
   ```
   Paste your Azure Key 1 when prompted.
5. Deploy:
   ```
   wrangler deploy
   ```
   Copy the printed URL (e.g. `https://tts.<subdomain>.workers.dev`) and, if
   different from the default, update `TTS_WORKER_URL` at the top of the
   VoiceEngine block in `screen-reader.js`.

## Test

```
https://tts.<subdomain>.workers.dev/?lang=hi&text=नमस्ते दुनिया
```
You should hear Hindi neural speech.

## Query parameters

| param | required | default | notes                                       |
|-------|----------|---------|---------------------------------------------|
| text  | yes      | —       | Max 3000 chars per request                  |
| lang  | no       | en      | Short code (hi, ta, fr, zh-CN, …)           |
| voice | no       | auto    | Full Azure voice name override              |
| rate  | no       | 0       | Integer percent, e.g. `-10` or `+20`        |

## Rotating the key

```
wrangler secret put AZURE_TTS_KEY     # paste new key
wrangler deploy                       # optional — secrets update live
```

## Limits

- Azure Free F0: **500,000 characters / month**, indefinite free tier.
- Cloudflare Workers free: **100,000 requests / day**.
- Responses are cached at Cloudflare's edge for 24 h (`Cache-Control: public, max-age=86400`),
  so repeated identical `text + lang` combinations are effectively free.
