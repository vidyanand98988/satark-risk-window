// SATARK Risk Window: voice server for Ask SATARK, on Sarvam AI (Cloudflare Worker).
// Keeps the Sarvam key secret. The page records what the person says and sends it here. This Worker asks Sarvam to
// (1) write it down (Saaras), (2) think of a reply (Sarvam 105B), which calls the page's forecast tools whenever it
// needs a number, and (3) speak the reply (Bulbul). Answers come only from tools that read the page's forecast.
//
// Settings (Cloudflare dashboard, Worker > Settings > Variables and Secrets):
//   SARVAM_API_KEY   secret, your Sarvam key from dashboard.sarvam.ai (required)
//   ALLOWED_ORIGINS  text, required: the sites that may use it, e.g. https://yourname.github.io,https://risk.satark.co.in
//   CHAT_MODEL       text, optional, default sarvam-105b-conversations
//   STT_MODEL        text, optional, default saaras:v4
//   TTS_MODEL        text, optional, default bulbul:v4-flash
//   VOICES           text, optional JSON: a bulbul:v4-flash voice per language, e.g. {"pa-IN":"harpreet_pa_narration"}
//   REASONING        text, optional, default low (none answers faster, high thinks longer)
//   PER_IP_PER_HOUR  text, optional, default 300 requests (one spoken question uses about 4)

const LANGS = { en: "English", hi: "Hindi", pa: "Punjabi", bn: "Bengali" };
const SCRIPT = { en: "English", hi: "Devanagari script", pa: "Gurmukhi script", bn: "Bengali script" };
const TTS_LANGS = ["bn-IN", "en-IN", "gu-IN", "hi-IN", "kn-IN", "ml-IN", "mr-IN", "od-IN", "pa-IN", "ta-IN", "te-IN"];
const VOICES = { "pa-IN": "anand_pa_conversation", "bn-IN": "roopa_bn_conversational", "hi-IN": "roopa_hi_conversational",
                 "en-IN": "roopa_en_conversational" };
const HELLO = {
  en: "Hello, I'm SATARK. Ask me about the fire risk in your village, where the smoke is going, or how to avoid burning straw.",
  hi: "नमस्ते, मैं सतर्क हूँ। अपने गाँव में आग के खतरे, धुआँ किधर जा रहा है, या पराली जलाने के बजाय क्या करें, मुझसे पूछिए।",
  pa: "ਸਤ ਸ੍ਰੀ ਅਕਾਲ, ਮੈਂ ਸਤਰਕ ਹਾਂ। ਆਪਣੇ ਪਿੰਡ ਵਿੱਚ ਅੱਗ ਦੇ ਖ਼ਤਰੇ, ਧੂੰਆਂ ਕਿੱਧਰ ਜਾ ਰਿਹਾ ਹੈ, ਜਾਂ ਪਰਾਲੀ ਸਾੜਨ ਦੀ ਥਾਂ ਕੀ ਕਰੀਏ, ਮੈਨੂੰ ਪੁੱਛੋ।",
  bn: "নমস্কার, আমি সতর্ক। আপনার গ্রামে আগুনের ঝুঁকি, ধোঁয়া কোন দিকে যাচ্ছে, বা খড় না পুড়িয়ে কী করবেন, আমাকে জিজ্ঞেস করুন।",
};
const KEYTERMS = ["SATARK", "parali", "PIN code", "Punjab", "Haryana", "Purba Medinipur", "Kolaghat", "Rajasthan",
                  "Madhya Pradesh", "Uttar Pradesh", "Kisan Call Centre"];

function instructions(b) {
  const regions = Array.isArray(b.regions) ? b.regions.slice(0, 8).map(String).join(", ") : "Punjab and Haryana, Purba Medinipur";
  const heard = String(b.heard || "").slice(0, 2);
  const lang = LANGS[heard] ? heard : (LANGS[b.lang] ? b.lang : "en");
  return `You are SATARK, the voice of SATARK Risk Window: a free forecast of where farm fires are likely in India, checked against NASA satellites every morning.
Speak like a calm, quick, warm expert assistant, a little like Jarvis: confident and kind, never robotic, never salesy.

LANGUAGE: The person is speaking ${LANGS[lang]}. Reply in ${LANGS[lang]}, written in ${SCRIPT[lang]} (English words mixed in are fine).
SPOKEN ANSWERS: Your reply is read aloud. One to three short sentences, then stop. No lists, no markdown, no emojis, no links. Many listeners are farmers on a phone in a field, officers, or visitors at an expo.

FACTS: Never guess a number. For any village, region, smoke, air or accuracy question, call a tool first and use only what it returns.
When you call village_forecast or smoke_forecast, write the place in English letters (for example Sangrur, Kolaghat, Tamluk) or give the 6 digit PIN code, even if the person said it in another script.
Say chances as a percent and a plain word (low, medium, high, very high). If a place is not found, ask for the spelling, the PIN code, or a bigger village nearby. If the tool lists other places with the same name, say which district you answered for and offer the others.
Regions covered: ${regions}. Today is ${String(b.date || "").slice(0, 10) || "today"}. The page is showing ${String(b.region || "").slice(0, 60) || "a region"}.

TONE ON BURNING: Support first, enforcement last. Never threaten, blame or mention fines or police. When the risk is medium or higher, offer one practical alternative (call help_options): a straw machine from a Custom Hiring Centre, the Pusa decomposer, or the free Kisan Call Centre 1800-180-1551.
HONESTY: The forecast is a chance for the 5 km area around a village, not a certainty. Satellites pass at about 1:30 pm, so fires lit later are missed. If you don't know, say so.
SCOPE: Farm fires, straw, smoke and air in the covered regions. For anything else, answer in one line or say it's outside what you know, and steer back.
ABOUT SATARK, only if asked: a youth-led team from Purba Medinipur, West Bengal, backed by an Emergent Ventures grant. It also builds DIVA, a cold plasma drum that treats straw on the combine harvester (still in development). Website: satark.co.in.`;
}

const fn = (name, description, properties = {}, required) =>
  ({ type: "function", function: { name, description, parameters: { type: "object", properties, ...(required ? { required } : {}) } } });
const TOOLS = [
  fn("village_forecast", "Chance of a farm fire today, tomorrow and the day after for the 5 km area around a village, town or PIN code. Also opens it on the screen.",
     { place: { type: "string", description: "Village or town name in English letters, or a 6 digit PIN code" } }, ["place"]),
  fn("region_summary", "Today's picture for a region: expected fires today, tomorrow and the day after, busiest districts, people living in high-risk areas, how yesterday's forecast did, and this season against last season.",
     { region: { type: "string", description: "Region or state name, or empty for the one on screen" } }),
  fn("smoke_forecast", "Where today's smoke is likely to drift over the next 36 hours, which towns it reaches and when, and tomorrow's PM2.5 forecast for those towns.",
     { town: { type: "string", description: "Optional town name in English letters" } }),
  fn("how_accurate", "How well the forecast did on a full season it never saw while learning, compared with a simple guess.",
     { region: { type: "string" } }),
  fn("help_options", "Practical alternatives to burning straw, and the free helpline."),
];
const TOOL_NAMES = new Set(TOOLS.map((t) => t.function.name));

// keep only what a conversation needs, so the Worker can't be used as a free general chatbot
function cleanMessages(list) {
  const out = [];
  for (const m of Array.isArray(list) ? list.slice(-40) : []) {
    if (!m || typeof m !== "object") continue;
    if (m.role === "user" && typeof m.content === "string") out.push({ role: "user", content: m.content.slice(0, 1500) });
    else if (m.role === "assistant") {
      const calls = (Array.isArray(m.tool_calls) ? m.tool_calls : []).slice(0, 4)
        .filter((c) => c && c.function && TOOL_NAMES.has(c.function.name))
        .map((c) => ({ id: String(c.id || "").slice(0, 80), type: "function",
                       function: { name: c.function.name, arguments: String(c.function.arguments || "{}").slice(0, 600) } }));
      const msg = { role: "assistant", content: typeof m.content === "string" ? m.content.slice(0, 1500) : null };
      if (calls.length) msg.tool_calls = calls;
      if (msg.content !== null || calls.length) out.push(msg);
    } else if (m.role === "tool" && typeof m.tool_call_id === "string") {
      out.push({ role: "tool", tool_call_id: m.tool_call_id.slice(0, 80), content: String(m.content || "").slice(0, 6000) });
    }
  }
  while (out.length && out[0].role !== "user") out.shift();   // a conversation starts with the person
  return out;
}

const spoken = (s) => String(s || "").replace(/[*#_`>|~]/g, "").replace(/\s+/g, " ").trim();

function sniff(b64) {
  try {
    const h = atob(b64.slice(0, 16));
    if (h.startsWith("RIFF")) return "audio/wav";
    if (h.startsWith("OggS")) return "audio/ogg";
    if (h.startsWith("fLaC")) return "audio/flac";
  } catch (e) {}
  return "audio/mpeg";
}

const seen = new Map();   // best effort, per Cloudflare location: requests per IP per hour

export default {
  async fetch(req, env) {
    const origin = req.headers.get("Origin") || "";
    const allowed = (env.ALLOWED_ORIGINS || "").split(",").map((s) => s.trim().replace(/\/$/, "")).filter(Boolean);
    const ok = allowed.includes(origin);
    const cors = { "Access-Control-Allow-Origin": ok ? origin : "null", "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
                   "Access-Control-Allow-Headers": "Content-Type", "Vary": "Origin" };
    const json = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: { ...cors, "Content-Type": "application/json" } });
    const fail = (msg, status) => json({ error: msg }, status);
    if (req.method === "OPTIONS") return new Response(null, { headers: cors });
    const url = new URL(req.url), path = url.pathname;
    if (path === "/" && req.method === "GET") return new Response("SATARK voice server (Sarvam) is running.", { headers: cors });
    if (!allowed.length) return fail("Set ALLOWED_ORIGINS on the Worker to the site's address.", 403);
    if (!ok) return fail("This site is not allowed to use the voice.", 403);
    if (req.method !== "POST" || !["/hello", "/stt", "/chat", "/tts"].includes(path)) return fail("Not found", 404);
    const key = env.SARVAM_API_KEY;
    if (!key) return fail("SARVAM_API_KEY is not set on the Worker.", 500);

    const ip = req.headers.get("CF-Connecting-IP") || "?";
    const hour = Math.floor(Date.now() / 3600000), k = ip + ":" + hour, n = (seen.get(k) || 0) + 1;
    seen.set(k, n);
    if (seen.size > 5000) seen.clear();
    if (n > Number(env.PER_IP_PER_HOUR || 300)) return fail("Too many questions from here. Try again in an hour.", 429);

    const sarvam = async (p, init) => {
      const r = await fetch("https://api.sarvam.ai" + p, { method: "POST", ...init,
        headers: { "api-subscription-key": key, ...(init.headers || {}) } });
      let body = null; try { body = await r.json(); } catch (e) {}
      return { ok: r.ok, status: r.status, body: body || {} };
    };
    const why = (r) => (r.body && r.body.error && (r.body.error.message || r.body.error.code)) || ("status " + r.status);

    const speak = async (text, lang) => {
      const language_code = TTS_LANGS.includes(lang) ? lang : "en-IN";
      let voices = VOICES;
      try { if (env.VOICES) voices = { ...VOICES, ...JSON.parse(env.VOICES) }; } catch (e) {}
      const model = env.TTS_MODEL || "bulbul:v4-flash";
      const body = { text: spoken(text).slice(0, 1500), language_code, model, speech_sample_rate: 24000, output_audio_codec: "mp3" };
      if (model === "bulbul:v4-flash" && voices[language_code]) body.speaker = voices[language_code];
      let r = await sarvam("/text-to-speech", { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (!r.ok && model !== "bulbul:v3" && r.status !== 429 && r.status !== 403) {   // voice not available: fall back to v3, which reads all 11 languages
        r = await sarvam("/text-to-speech", { headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: body.text, language_code, model: "bulbul:v3", speech_sample_rate: 24000, output_audio_codec: "mp3" }) });
      }
      if (!r.ok || !Array.isArray(r.body.audios) || !r.body.audios[0]) return { error: "speech: " + why(r), status: r.status || 502 };
      const audio = r.body.audios.join("");
      return { audio, mime: sniff(audio), lang: language_code };
    };

    if (path === "/hello") {
      let b = {}; try { b = await req.json(); } catch (e) {}
      const lang = LANGS[b.lang] ? b.lang : "en";
      const s = await speak(HELLO[lang], lang + "-IN");
      return s.error ? fail(s.error, s.status) : json({ text: HELLO[lang], ...s });
    }

    if (path === "/stt") {
      const buf = await req.arrayBuffer();
      if (!buf.byteLength) return fail("No audio.", 400);
      if (buf.byteLength > 3_000_000) return fail("That was too long. Ask in under 25 seconds.", 413);
      const type = (req.headers.get("Content-Type") || "audio/webm").split(";")[0].trim();
      const ext = { "audio/webm": "webm", "audio/mp4": "m4a", "audio/x-m4a": "m4a", "audio/aac": "aac", "audio/ogg": "ogg",
                    "audio/wav": "wav", "audio/mpeg": "mp3" }[type] || "webm";
      const fd = new FormData();
      fd.append("file", new Blob([buf], { type }), "question." + ext);
      const model = env.STT_MODEL || "saaras:v4";
      fd.append("model", model);
      fd.append("mode", "transcribe");
      fd.append("language_code", "unknown");   // Sarvam works out the language
      if (model === "saaras:v4") fd.append("keyterms", JSON.stringify(KEYTERMS));
      const r = await sarvam("/speech-to-text", { body: fd });
      if (!r.ok) return fail("listening: " + why(r), r.status);
      return json({ transcript: String(r.body.transcript || ""), language_code: r.body.language_code || null });
    }

    if (path === "/chat") {
      const raw = await req.text();
      if (raw.length > 60000) return fail("The conversation is too long. Tap End and start again.", 413);
      let b = {}; try { b = JSON.parse(raw); } catch (e) { return fail("Bad request.", 400); }
      const messages = cleanMessages(b.messages);
      if (!messages.length) return fail("Nothing to answer.", 400);
      const body = { model: env.CHAT_MODEL || "sarvam-105b-conversations",
                     messages: [{ role: "system", content: instructions(b) }, ...messages],
                     tools: TOOLS, tool_choice: "auto", temperature: 0.3, max_tokens: 800,
                     reasoning_effort: env.REASONING || "low" };
      const headers = { "Content-Type": "application/json", Authorization: "Bearer " + key };
      let r = await sarvam("/v1/chat/completions", { headers, body: JSON.stringify(body) });
      if (!r.ok && (r.status === 400 || r.status === 422)) {   // in case this model doesn't take reasoning_effort
        delete body.reasoning_effort;
        r = await sarvam("/v1/chat/completions", { headers, body: JSON.stringify(body) });
      }
      const m = r.ok && r.body.choices && r.body.choices[0] && r.body.choices[0].message;
      if (!m) return fail("thinking: " + why(r), r.status === 200 ? 502 : r.status);
      const calls = (m.tool_calls || []).filter((c) => c && c.function && TOOL_NAMES.has(c.function.name))
        .map((c) => ({ id: c.id, type: "function", function: { name: c.function.name, arguments: c.function.arguments || "{}" } }));
      const said = m.content == null ? null : spoken(String(m.content).replace(/<think>[\s\S]*?<\/think>/g, ""));
      return json({ message: { role: "assistant", content: said, ...(calls.length ? { tool_calls: calls } : {}) } });
    }

    // /tts
    let b = {}; try { b = await req.json(); } catch (e) {}
    const text = spoken(b.text);
    if (!text) return fail("Nothing to say.", 400);
    const s = await speak(text, String(b.lang || ""));
    return s.error ? fail(s.error, s.status) : json(s);
  },
};
