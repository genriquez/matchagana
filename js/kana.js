// Kana helpers, exported as ctx.kana:
//
//   applyModifier(kind, ch)   // ch changed by "dak" (か→が) | "han" (は→ぱ) |
//                             // "small" (つ→っ), toggling back; null if it can't
//   baseKana(ch)              // strip voicing marks: が → か, ぱ → は
//   kanaToRomaji(str)         // "がっこう" → "gakkou" (handles yoon, っ and ー)
//   normalizeRomaji(s)        // for comparing typed romaji: lowercase, no
//                             // spaces/hyphens/apostrophes, macrons spelled out
//   normalizeKana(s)          // for comparing typed kana: no whitespace
//   lookalikesOf(ch)          // characters easy to confuse with ch: its listed
//                             // lookalikes plus its voiced/unvoiced twins
//
// Uses ctx.data (KANA for the romaji table, the lookalike lists).

grab("js/data.js").run((ctx) => {
  const { KANA, KANA_LOOKALIKES, KANJI_LOOKALIKES } = ctx.data;

  // ---- Modifiers (dakuten, handakuten, small) -------------------------------

  const pairMaps = (str) => {
    const fwd = new Map(), rev = new Map();
    for (const p of str.split(" ")) {
      fwd.set(p[0], p[1]);
      rev.set(p[1], p[0]);
    }
    return { fwd, rev };
  };
  const DAK = pairMaps("かが きぎ くぐ けげ こご さざ しじ すず せぜ そぞ ただ ちぢ つづ てで とど はば ひび ふぶ へべ ほぼ カガ キギ クグ ケゲ コゴ サザ シジ スズ セゼ ソゾ タダ チヂ ツヅ テデ トド ハバ ヒビ フブ ヘベ ホボ");
  const HAN = pairMaps("はぱ ひぴ ふぷ へぺ ほぽ ハパ ヒピ フプ ヘペ ホポ");
  const SMALL = pairMaps("あぁ いぃ うぅ えぇ おぉ つっ やゃ ゆゅ よょ わゎ");

  // Strip voicing marks: が → か, ぱ → は.
  const baseKana = (ch) => DAK.rev.get(ch) || HAN.rev.get(ch) || ch;

  function applyModifier(kind, ch) {
    if (kind === "dak") {
      if (DAK.fwd.has(ch)) return DAK.fwd.get(ch);
      if (DAK.rev.has(ch)) return DAK.rev.get(ch);
      if (HAN.rev.has(ch)) return DAK.fwd.get(HAN.rev.get(ch));
    } else if (kind === "han") {
      if (HAN.fwd.has(ch)) return HAN.fwd.get(ch);
      if (HAN.rev.has(ch)) return HAN.rev.get(ch);
      if (DAK.rev.has(ch) && HAN.fwd.has(DAK.rev.get(ch))) return HAN.fwd.get(DAK.rev.get(ch));
    } else if (kind === "small") {
      if (SMALL.fwd.has(ch)) return SMALL.fwd.get(ch);
      if (SMALL.rev.has(ch)) return SMALL.rev.get(ch);
    }
    return null;
  }

  // ---- Kana → romaji -----------------------------------------------------------

  const KANA_TO_ROMAJI = new Map();
  for (const k of KANA) {
    if (!KANA_TO_ROMAJI.has(k.hira)) KANA_TO_ROMAJI.set(k.hira, k.romaji);
    if (!KANA_TO_ROMAJI.has(k.kata)) KANA_TO_ROMAJI.set(k.kata, k.romaji);
  }
  for (const [small, r] of [["ぁ", "a"], ["ぃ", "i"], ["ぅ", "u"], ["ぇ", "e"], ["ぉ", "o"], ["ゃ", "ya"], ["ゅ", "yu"], ["ょ", "yo"], ["ゎ", "wa"]]) {
    KANA_TO_ROMAJI.set(small, r);
  }

  function kanaToRomaji(str) {
    const chars = [...str];
    let out = "";
    let double = false; // pending small っ
    for (let i = 0; i < chars.length; i++) {
      const pair = chars[i] + (chars[i + 1] || "");
      let r;
      if (KANA_TO_ROMAJI.has(pair)) { r = KANA_TO_ROMAJI.get(pair); i++; }
      else if (chars[i] === "っ" || chars[i] === "ッ") { double = true; continue; }
      else if (chars[i] === "ー") { r = out.slice(-1); }
      else r = KANA_TO_ROMAJI.get(chars[i]) ?? chars[i];
      if (double) {
        out += r.startsWith("ch") ? "t" : r[0];
        double = false;
      }
      out += r;
    }
    return out;
  }

  // ---- Normalizing typed answers --------------------------------------------

  const normalizeRomaji = (s) =>
    s.toLowerCase().normalize("NFC")
      .replace(/[ā]/g, "aa").replace(/[ī]/g, "ii").replace(/[ūû]/g, "uu").replace(/[ē]/g, "ee").replace(/[ōô]/g, "ou")
      .replace(/[\s'\-]/g, "");
  const normalizeKana = (s) => s.replace(/\s/g, "");

  // ---- Lookalikes ------------------------------------------------------------

  // Characters that could be confused with ch: listed lookalikes plus its
  // voiced/unvoiced twins (か/が/…).
  function lookalikesOf(ch) {
    const out = new Set();
    for (const g of [...KANA_LOOKALIKES, ...KANJI_LOOKALIKES]) {
      if (g.includes(ch)) for (const c of g) out.add(c);
    }
    for (const m of [DAK.fwd, DAK.rev, HAN.fwd, HAN.rev]) if (m.has(ch)) out.add(m.get(ch));
    out.delete(ch);
    return [...out];
  }

  ctx.kana = { applyModifier, baseKana, kanaToRomaji, normalizeRomaji, normalizeKana, lookalikesOf };
});
