// Languages come from the Whisper model itself, not a list typed into this app.
// Whisper's generation_config.json names every language it was trained on (99 for whisper-tiny).
// Names are written by the browser in the reader's own language, and the tag live captions need
// (a region such as ml-IN) is derived from the language, so nothing here is maintained by hand.

const CONFIG_URL = "https://huggingface.co/Xenova/whisper-tiny/resolve/main/generation_config.json";
const STORE_KEY = "vn:whisper-languages";

// Whisper uses a few codes that differ from BCP 47.
const BCP47 = { jw: "jv", iw: "he", haw: "haw" };

export function bcp47(code) {
  const base = String(code || "").split("-")[0].toLowerCase();
  return BCP47[base] || base;
}

export function languageName(code, locale = navigator.language) {
  if (!code || code === "auto") return "Auto-detect";
  try {
    const name = new Intl.DisplayNames([locale, "en"], { type: "language" }).of(bcp47(code));
    return name && name !== code ? name.charAt(0).toUpperCase() + name.slice(1) : code;
  } catch {
    return code;
  }
}

// The tag Web Speech wants. The reader's own locale wins when the language matches, so an
// English speaker in India gets en-IN rather than en-US.
export function speechTag(code) {
  if (!code || code === "auto") return navigator.language || "en-US";
  if (code.includes("-")) return code;
  const lang = bcp47(code);
  const own = (navigator.languages || [navigator.language]).find((l) => l && l.split("-")[0].toLowerCase() === lang);
  if (own && own.includes("-")) return own;
  try {
    const loc = new Intl.Locale(lang).maximize();
    return loc.region ? `${loc.language}-${loc.region}` : lang;
  } catch {
    return lang;
  }
}

// The code Whisper wants: the bare language, or "auto" to let it detect.
export function whisperCode(code) {
  if (!code || code === "auto") return "auto";
  const base = String(code).split("-")[0].toLowerCase();
  const back = Object.entries(BCP47).find(([, v]) => v === base);
  return back ? back[0] : base;
}

export function codesFromConfig(config) {
  return Object.keys(config?.lang_to_id || {})
    .map((token) => token.replace(/^<\|/, "").replace(/\|>$/, ""))
    .filter(Boolean);
}

function readStored() {
  try {
    const codes = JSON.parse(localStorage.getItem(STORE_KEY) || "[]");
    return Array.isArray(codes) ? codes : [];
  } catch {
    return [];
  }
}

// Every language Whisper knows, named for this reader and sorted by that name. Offline, the list
// saved on the last successful load is used; with neither, the reader's own browser languages.
export async function loadLanguages(fetchImpl = fetch) {
  let codes = readStored();
  try {
    const res = await fetchImpl(CONFIG_URL);
    if (res.ok) {
      const fresh = codesFromConfig(await res.json());
      if (fresh.length) {
        codes = fresh;
        try {
          localStorage.setItem(STORE_KEY, JSON.stringify(codes));
        } catch {
          /* storage full or blocked: the list still works for this session */
        }
      }
    }
  } catch {
    /* offline: use what was stored */
  }
  if (!codes.length) codes = (navigator.languages || [navigator.language || "en"]).map((l) => l.split("-")[0]);
  const seen = new Set();
  return codes
    .map((code) => code.toLowerCase())
    .filter((code) => !seen.has(code) && seen.add(code))
    .map((code) => ({ code, name: languageName(code) }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
