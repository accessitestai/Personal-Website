/* ─────────────────────────────────────────────────────────────
   Azure Speech TTS proxy — Cloudflare Worker
   Accepts: GET /?text=...&lang=hi&voice=hi-IN-SwaraNeural&rate=0
   Returns: audio/mpeg (MP3) with CORS headers.
   The Azure key lives in the AZURE_TTS_KEY Worker secret — never
   in source. Set it once with:
     wrangler secret put AZURE_TTS_KEY
   ───────────────────────────────────────────────────────────── */

const AZURE_REGION   = 'centralindia';
const AZURE_ENDPOINT = `https://${AZURE_REGION}.tts.speech.microsoft.com/cognitiveservices/v1`;

const VOICE_FOR_LANG = {
  en:'en-US-AriaNeural',
  hi:'hi-IN-SwaraNeural',
  ta:'ta-IN-PallaviNeural',
  te:'te-IN-ShrutiNeural',
  kn:'kn-IN-SapnaNeural',
  ml:'ml-IN-SobhanaNeural',
  bn:'bn-IN-TanishaaNeural',
  mr:'mr-IN-AarohiNeural',
  gu:'gu-IN-DhwaniNeural',
  ur:'ur-PK-UzmaNeural',
  // Azure has no native Punjabi/Odia/Assamese voices — fall back to Hindi
  pa:'hi-IN-SwaraNeural',
  or:'hi-IN-SwaraNeural',
  as:'hi-IN-SwaraNeural',
  es:'es-ES-ElviraNeural',
  fr:'fr-FR-DeniseNeural',
  de:'de-DE-KatjaNeural',
  pt:'pt-PT-RaquelNeural',
  ar:'ar-SA-ZariyahNeural',
  ru:'ru-RU-SvetlanaNeural',
  it:'it-IT-ElsaNeural',
  'zh':'zh-CN-XiaoxiaoNeural',
  'zh-CN':'zh-CN-XiaoxiaoNeural',
  'zh-TW':'zh-TW-HsiaoChenNeural',
  ja:'ja-JP-NanamiNeural',
  ko:'ko-KR-SunHiNeural',
  nl:'nl-NL-ColetteNeural',
  tr:'tr-TR-EmelNeural',
  th:'th-TH-PremwadeeNeural',
  vi:'vi-VN-HoaiMyNeural',
  id:'id-ID-GadisNeural',
  ms:'ms-MY-YasminNeural',
  pl:'pl-PL-ZofiaNeural',
  sv:'sv-SE-SofieNeural'
};

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  // Cache identical text+lang combinations at Cloudflare edge for 24h
  'Cache-Control':                'public, max-age=86400'
};

function xmlEscape(s) {
  return s.replace(/[<>&'"]/g, c => ({'<':'&lt;','>':'&gt;','&':'&amp;',"'":'&apos;','"':'&quot;'}[c]));
}

function resolveVoice(voice, lang) {
  if (voice) return voice;
  if (VOICE_FOR_LANG[lang]) return VOICE_FOR_LANG[lang];
  const base = (lang || 'en').split('-')[0].toLowerCase();
  return VOICE_FOR_LANG[base] || VOICE_FOR_LANG.en;
}

function voiceLocale(voice) {
  // e.g. "hi-IN-SwaraNeural" → "hi-IN"
  const m = voice.match(/^([a-z]{2,3}-[A-Za-z]{2,4})-/);
  return m ? m[1] : 'en-US';
}

async function synthesize(env, text, lang, voice, rate) {
  if (!env.AZURE_TTS_KEY) throw new Error('AZURE_TTS_KEY secret is not set');

  const voiceName = resolveVoice(voice, lang);
  const locale    = voiceLocale(voiceName);
  const ratePct   = Number.isFinite(+rate) ? +rate : 0;
  const rateStr   = (ratePct >= 0 ? '+' : '') + ratePct + '%';

  const ssml =
    `<speak version='1.0' xml:lang='${locale}'>` +
      `<voice xml:lang='${locale}' name='${voiceName}'>` +
        `<prosody rate='${rateStr}' pitch='+0Hz'>` +
          xmlEscape(text) +
        `</prosody>` +
      `</voice>` +
    `</speak>`;

  const res = await fetch(AZURE_ENDPOINT, {
    method: 'POST',
    headers: {
      'Ocp-Apim-Subscription-Key': env.AZURE_TTS_KEY,
      'Content-Type':              'application/ssml+xml',
      'X-Microsoft-OutputFormat':  'audio-24khz-48kbitrate-mono-mp3',
      'User-Agent':                'ama11y-tts-worker'
    },
    body: ssml
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`Azure TTS ${res.status}: ${errText.slice(0, 200)}`);
  }
  return await res.arrayBuffer();
}

export default {
  async fetch(request, env) {
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
    if (text.length > 3000) {
      return new Response(JSON.stringify({ error: 'Text too long (max 3000 chars)' }), {
        status: 413,
        headers: { ...CORS, 'Content-Type': 'application/json' }
      });
    }

    try {
      const audio = await synthesize(env, text, lang, voice, rate);
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
