/* ─────────────────────────────────────────────────────────────
   Edge Neural TTS proxy — Cloudflare Worker
   Accepts: GET /?text=...&lang=hi&voice=hi-IN-SwaraNeural&rate=0
   Returns: audio/mpeg (MP3) with CORS headers
   Free tier: 100k requests/day. No API key needed.
   ───────────────────────────────────────────────────────────── */

const EDGE_TOKEN = '6A5AA1D4EAFF4E9FB37E23D68491D6F4';
const EDGE_WSS   = 'https://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1?TrustedClientToken=' + EDGE_TOKEN;

const DEFAULT_VOICE_FOR_LANG = {
  en:'en-US-AriaNeural',
  hi:'hi-IN-SwaraNeural', ta:'ta-IN-PallaviNeural', te:'te-IN-ShrutiNeural',
  kn:'kn-IN-SapnaNeural', ml:'ml-IN-SobhanaNeural', bn:'bn-IN-TanishaaNeural',
  mr:'mr-IN-AarohiNeural', gu:'gu-IN-DhwaniNeural', ur:'ur-PK-UzmaNeural',
  pa:'hi-IN-SwaraNeural',  or:'hi-IN-SwaraNeural', as:'hi-IN-SwaraNeural',
  es:'es-ES-ElviraNeural', fr:'fr-FR-DeniseNeural', de:'de-DE-KatjaNeural',
  pt:'pt-PT-RaquelNeural', ar:'ar-SA-ZariyahNeural', ru:'ru-RU-SvetlanaNeural',
  it:'it-IT-ElsaNeural',
  zh:'zh-CN-XiaoxiaoNeural','zh-CN':'zh-CN-XiaoxiaoNeural','zh-TW':'zh-TW-HsiaoChenNeural',
  ja:'ja-JP-NanamiNeural', ko:'ko-KR-SunHiNeural',
  nl:'nl-NL-ColetteNeural', tr:'tr-TR-EmelNeural', th:'th-TH-PremwadeeNeural',
  vi:'vi-VN-HoaiMyNeural', id:'id-ID-GadisNeural', ms:'ms-MY-YasminNeural',
  pl:'pl-PL-ZofiaNeural', sv:'sv-SE-SofieNeural'
};

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Cache-Control':                'public, max-age=86400'
};

function uuid() {
  const b = new Uint8Array(16);
  crypto.getRandomValues(b);
  return Array.from(b, x => x.toString(16).padStart(2, '0')).join('');
}

function xmlEscape(s) {
  return s.replace(/[<>&'"]/g, c => ({'<':'&lt;','>':'&gt;','&':'&amp;',"'":'&apos;','"':'&quot;'}[c]));
}

function resolveVoice(voice, lang) {
  if (voice) return voice;
  if (DEFAULT_VOICE_FOR_LANG[lang]) return DEFAULT_VOICE_FOR_LANG[lang];
  const base = (lang || 'en').split('-')[0].toLowerCase();
  return DEFAULT_VOICE_FOR_LANG[base] || DEFAULT_VOICE_FOR_LANG.en;
}

// Sec-MS-GEC token: SHA256 of (ticks-rounded-to-5min + clock-skew-key), upper-case hex.
// Required by Edge Read-Aloud since mid-2024 to block unofficial clients.
const GEC_TRUSTED_KEY = '6A5AA1D4EAFF4E9FB37E23D68491D6F4MSEdge';
async function buildSecMsGec() {
  // Windows file-time ticks since 1601-01-01, rounded down to 5-minute window.
  const WIN_EPOCH = 11644473600n;            // seconds between 1601 and 1970
  const nowSec = BigInt(Math.floor(Date.now() / 1000));
  let ticks = (nowSec + WIN_EPOCH) * 10000000n;
  ticks -= ticks % (3000000000n);            // round to 5 min (300s * 1e7)
  const data = ticks.toString() + GEC_TRUSTED_KEY;
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(data));
  return Array.from(new Uint8Array(hash), b => b.toString(16).padStart(2, '0')).join('').toUpperCase();
}

async function synthesize(text, lang, voice, rate) {
  const voiceName = resolveVoice(voice, lang);
  const ratePct   = Number.isFinite(+rate) ? +rate : 0;
  const rateStr   = (ratePct >= 0 ? '+' : '') + ratePct + '%';
  const reqId     = uuid();
  const connId    = uuid();
  const gec       = await buildSecMsGec();

  // Open WebSocket to Edge with Sec-MS-GEC auth headers.
  const wsUrl = EDGE_WSS + '&Sec-MS-GEC=' + gec + '&Sec-MS-GEC-Version=1-130.0.2849.68&ConnectionId=' + connId;
  const upstream = await fetch(wsUrl, {
    headers: {
      'Upgrade':    'websocket',
      'Origin':     'chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.2849.68'
    }
  });

  const ws = upstream.webSocket;
  if (!ws) throw new Error('Edge TTS upgrade failed: ' + upstream.status);
  ws.accept();

  return new Promise((resolve, reject) => {
    const audioParts = [];
    let settled = false;
    const fail  = (e) => { if (!settled) { settled = true; reject(e); } };
    const done  = ()  => {
      if (settled) return;
      settled = true;
      let total = 0;
      for (const p of audioParts) total += p.byteLength;
      const merged = new Uint8Array(total);
      let off = 0;
      for (const p of audioParts) { merged.set(new Uint8Array(p), off); off += p.byteLength; }
      resolve(merged);
    };

    ws.addEventListener('message', (ev) => {
      if (typeof ev.data === 'string') {
        if (ev.data.includes('Path:turn.end')) {
          try { ws.close(); } catch (e) {}
          done();
        }
      } else {
        const buf = ev.data instanceof ArrayBuffer ? ev.data : new Uint8Array(ev.data).buffer;
        const view = new Uint8Array(buf);
        const headerLen = (view[0] << 8) | view[1];
        if (view.length > 2 + headerLen) {
          audioParts.push(view.slice(2 + headerLen).buffer);
        }
      }
    });
    ws.addEventListener('close', () => done());
    ws.addEventListener('error', (e) => fail(new Error('ws error')));

    // 1. Speech config
    ws.send(
      'X-Timestamp:' + new Date().toISOString() + '\r\n' +
      'Content-Type:application/json; charset=utf-8\r\n' +
      'Path:speech.config\r\n\r\n' +
      '{"context":{"synthesis":{"audio":{"metadataoptions":{"sentenceBoundaryEnabled":"false","wordBoundaryEnabled":"false"},"outputFormat":"audio-24khz-48kbitrate-mono-mp3"}}}}'
    );
    // 2. SSML
    const ssml =
      "<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='" + (lang || 'en') + "'>" +
        "<voice name='" + voiceName + "'>" +
          "<prosody rate='" + rateStr + "' pitch='+0Hz'>" +
            xmlEscape(text) +
          "</prosody>" +
        "</voice>" +
      "</speak>";
    ws.send(
      'X-RequestId:' + reqId + '\r\n' +
      'Content-Type:application/ssml+xml\r\n' +
      'X-Timestamp:' + new Date().toISOString() + 'Z\r\n' +
      'Path:ssml\r\n\r\n' + ssml
    );

    setTimeout(() => fail(new Error('timeout')), 15000);
  });
}

export default {
  async fetch(request) {
    if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });

    const url   = new URL(request.url);
    const text  = url.searchParams.get('text');
    const lang  = url.searchParams.get('lang')  || 'en';
    const voice = url.searchParams.get('voice') || '';
    const rate  = url.searchParams.get('rate')  || '0';

    if (!text) {
      return new Response(JSON.stringify({ error: 'Missing "text" param' }), {
        status: 400,
        headers: { ...CORS, 'Content-Type': 'application/json' }
      });
    }
    if (text.length > 2000) {
      return new Response(JSON.stringify({ error: 'Text too long (max 2000 chars)' }), {
        status: 413,
        headers: { ...CORS, 'Content-Type': 'application/json' }
      });
    }

    try {
      const audio = await synthesize(text, lang, voice, rate);
      return new Response(audio, {
        headers: { ...CORS, 'Content-Type': 'audio/mpeg' }
      });
    } catch (e) {
      return new Response(JSON.stringify({ error: String(e && e.message || e) }), {
        status: 502,
        headers: { ...CORS, 'Content-Type': 'application/json' }
      });
    }
  }
};
