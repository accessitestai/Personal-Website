/* Azure Speech TTS proxy — Cloudflare Worker
   Endpoints:
     GET /version          → which build is live
     GET /diag             → checks secret + Azure connectivity
     GET /?text=...&lang=  → returns audio/mpeg
*/

const BUILD_ID     = 'azure-v3-2026-04-07';
const AZURE_REGION = 'centralindia';
const AZURE_TTS    = `https://${AZURE_REGION}.tts.speech.microsoft.com/cognitiveservices/v1`;
const AZURE_TOKEN  = `https://${AZURE_REGION}.api.cognitive.microsoft.com/sts/v1.0/issueToken`;

const VOICES = {
  en:'en-US-AriaNeural', hi:'hi-IN-SwaraNeural', ta:'ta-IN-PallaviNeural',
  te:'te-IN-ShrutiNeural', kn:'kn-IN-SapnaNeural', ml:'ml-IN-SobhanaNeural',
  bn:'bn-IN-TanishaaNeural', mr:'mr-IN-AarohiNeural', gu:'gu-IN-DhwaniNeural',
  ur:'ur-PK-UzmaNeural', pa:'hi-IN-SwaraNeural', or:'hi-IN-SwaraNeural',
  as:'hi-IN-SwaraNeural',
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
  'Access-Control-Allow-Headers': 'Content-Type'
};

const json = (obj, status = 200) => new Response(JSON.stringify(obj, null, 2), {
  status, headers: { ...CORS, 'Content-Type': 'application/json' }
});

const xmlEsc = s => s.replace(/[<>&'"]/g, c =>
  ({'<':'&lt;','>':'&gt;','&':'&amp;',"'":'&apos;','"':'&quot;'}[c]));

function pickVoice(lang) {
  if (VOICES[lang]) return VOICES[lang];
  const base = (lang || 'en').split('-')[0].toLowerCase();
  return VOICES[base] || VOICES.en;
}

function localeOf(voice) {
  const m = voice.match(/^([a-z]{2,3}-[A-Za-z]{2,4})-/);
  return m ? m[1] : 'en-US';
}

async function synth(env, text, lang, rate) {
  const voice  = pickVoice(lang);
  const locale = localeOf(voice);
  const r      = Number.isFinite(+rate) ? +rate : 0;
  const ssml   =
    `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='${locale}'>` +
      `<voice xml:lang='${locale}' name='${voice}'>` +
        `<prosody rate='${r >= 0 ? '+' : ''}${r}%'>${xmlEsc(text)}</prosody>` +
      `</voice>` +
    `</speak>`;

  const res = await fetch(AZURE_TTS, {
    method: 'POST',
    headers: {
      'Ocp-Apim-Subscription-Key': env.AZURE_TTS_KEY,
      'Content-Type':              'application/ssml+xml; charset=utf-8',
      'X-Microsoft-OutputFormat':  'audio-24khz-48kbitrate-mono-mp3',
      'User-Agent':                'AMASAMYA-tts'
    },
    body: ssml
  });
  return { res, voice, locale, ssml };
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });

    const url  = new URL(request.url);
    const path = url.pathname;

    // /version — confirm which build is live
    if (path === '/version') {
      return json({ build: BUILD_ID, region: AZURE_REGION, hasKey: !!env.AZURE_TTS_KEY });
    }

    // /diag — try to get a token from Azure to prove the key works
    if (path === '/diag') {
      if (!env.AZURE_TTS_KEY) return json({ ok: false, step: 'secret', error: 'AZURE_TTS_KEY not set' }, 500);
      try {
        const t = await fetch(AZURE_TOKEN, {
          method: 'POST',
          headers: {
            'Ocp-Apim-Subscription-Key': env.AZURE_TTS_KEY,
            'Content-Length': '0'
          }
        });
        const body = await t.text();
        return json({
          ok: t.ok,
          step: 'issueToken',
          status: t.status,
          region: AZURE_REGION,
          bodyPreview: body.slice(0, 120),
          keyLen: env.AZURE_TTS_KEY.length
        }, t.ok ? 200 : 502);
      } catch (e) {
        return json({ ok: false, step: 'fetch', error: String(e && e.message || e) }, 502);
      }
    }

    // / — synthesize
    const text = url.searchParams.get('text');
    const lang = url.searchParams.get('lang') || 'en';
    const rate = url.searchParams.get('rate') || '0';

    if (!text) return json({ error: 'Missing "text" param', hint: 'try /version or /diag' }, 400);
    if (text.length > 3000) return json({ error: 'text too long' }, 413);
    if (!env.AZURE_TTS_KEY) return json({ error: 'AZURE_TTS_KEY secret not set on this worker' }, 500);

    try {
      const { res, voice, locale } = await synth(env, text, lang, rate);
      if (!res.ok) {
        const body = await res.text().catch(() => '');
        return json({
          error: 'azure',
          status: res.status,
          voice, locale,
          azureBody: body.slice(0, 300)
        }, 502);
      }
      const audio = await res.arrayBuffer();
      return new Response(audio, {
        headers: {
          ...CORS,
          'Content-Type':  'audio/mpeg',
          'Cache-Control': 'public, max-age=86400',
          'X-TTS-Voice':   voice,
          'X-TTS-Build':   BUILD_ID
        }
      });
    } catch (e) {
      return json({ error: String(e && e.message || e) }, 502);
    }
  }
};
