(() => {
  // ---- Helpers --------------------------------------------------------------

  const $ = (id) => document.getElementById(id);
  const el = (tag, props = {}, children = []) => {
    const node = Object.assign(document.createElement(tag), props);
    for (const c of [].concat(children)) node.append(c);
    return node;
  };

  const shuffle = (arr) => {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  };

  const store = {
    get(key, fallback) {
      try {
        const v = localStorage.getItem("kana-quiz:" + key);
        return v == null ? fallback : JSON.parse(v);
      } catch {
        return fallback;
      }
    },
    set(key, value) {
      try {
        localStorage.setItem("kana-quiz:" + key, JSON.stringify(value));
      } catch {}
    },
  };

  function levenshtein(a, b) {
    const dp = Array.from({ length: b.length + 1 }, (_, i) => i);
    for (let i = 1; i <= a.length; i++) {
      let prev = dp[0];
      dp[0] = i;
      for (let j = 1; j <= b.length; j++) {
        const tmp = dp[j];
        dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
        prev = tmp;
      }
    }
    return dp[b.length];
  }

  const fmtSecs = (ms) => (ms / 1000).toFixed(1) + " s";

  // ---- Kana modifiers (dakuten, handakuten, small) ---------------------------

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

  // ---- Similarity -------------------------------------------------------------

  function groupLookup(groups) {
    const m = new Map();
    groups.forEach((g, i) => {
      for (const ch of g) {
        if (!m.has(ch)) m.set(ch, new Set());
        m.get(ch).add(i);
      }
    });
    return (a, b) => {
      const sa = m.get(a), sb = m.get(b);
      if (!sa || !sb) return false;
      for (const x of sa) if (sb.has(x)) return true;
      return false;
    };
  }
  const kanaLooksAlike = groupLookup(KANA_LOOKALIKES);
  const kanjiLooksAlike = groupLookup(KANJI_LOOKALIKES);

  const SOUND_GROUPS = [
    ["shi", "chi", "tsu", "su", "ji", "zu"],
    ["sha", "cha", "ja", "sa"], ["shu", "chu", "ju", "su"], ["sho", "cho", "jo", "so"],
    ["ha", "wa"], ["fu", "hu", "u"], ["o", "wo"], ["n", "nu", "mu", "no"], ["ra", "ri", "ru", "re", "ro"],
  ];
  const soundAlike = (a, b) => SOUND_GROUPS.some((g) => g.includes(a) && g.includes(b));

  function kanaVisual(a, b) {
    if (!a || !b) return 0;
    const [a0, b0] = [a[0], b[0]];
    let s = 0;
    if (kanaLooksAlike(a0, b0)) s += 3;
    if (baseKana(a0) === baseKana(b0)) s += a0 === b0 ? 2 : 3; // か/が, きゃ/きょ
    if (a.length !== b.length) s -= 0.5;
    return s;
  }

  function kanaSimilarity(mode, a, b) {
    let s = 0;
    for (const script of mode.scripts) s += kanaVisual(a[script], b[script]);
    const ra = a.romaji, rb = b.romaji;
    const cons = (r) => r.replace(/[aeiou]$/, "");
    if (cons(ra) && cons(ra) === cons(rb)) s += 1.5;
    if (ra.slice(-1) === rb.slice(-1)) s += 0.75;
    if (soundAlike(ra, rb)) s += 2;
    const d = levenshtein(ra, rb);
    if (d <= 1) s += 1.5;
    else if (d === 2) s += 0.5;
    return s;
  }

  function readingSimilarity(a, b) {
    let s = 0;
    const ka = [...a.kana], kb = [...b.kana];
    if (ka.length === kb.length) s += 1;
    const setA = new Set(ka);
    s += kb.filter((c) => setA.has(c)).length;
    if (ka[0] === kb[0]) s += 1;
    if (ka.at(-1) === kb.at(-1)) s += 0.5;
    const d = levenshtein(a.romaji, b.romaji);
    if (d <= 2) s += 2 - d * 0.5;
    return s;
  }

  function kanjiSimilarity(a, b) {
    if (!a.kanji || !b.kanji) return 0;
    const ca = [...a.kanji], cb = [...b.kanji];
    let s = 0;
    if (ca.length === cb.length) s += 0.5;
    const setA = new Set(ca);
    s += cb.filter((c) => setA.has(c)).length * 2;
    if (ca.some((x) => cb.some((y) => x !== y && kanjiLooksAlike(x, y)))) s += 3;
    return s;
  }

  function wordSimilarity(mode, a, b) {
    const theme = a.theme === b.theme ? 1 : 0;
    switch (mode.focus) {
      case "meaning": return theme * 3 + kanjiSimilarity(a, b) + readingSimilarity(a, b) * 0.3;
      case "kanji": return kanjiSimilarity(a, b) * 2 + theme;
      default: return readingSimilarity(a, b) + theme * 0.5;
    }
  }

  // ---- Modes ------------------------------------------------------------------

  const F = {
    hira: (e) => ({ text: e.hira, kind: "hiragana", jp: true }),
    kata: (e) => ({ text: e.kata, kind: "katakana", jp: true }),
    romaji: (e) => ({ text: e.romaji, kind: "romaji" }),
    word: (e) => ({ text: e.kana, kind: "hiragana", jp: true }),
    kanji: (e) => ({ text: e.kanji, kind: "kanji", jp: true }),
    english: (e) => ({ text: e.english, kind: "english" }),
  };

  const MODE_GROUPS = [
    { id: "kana", label: "Kana · multiple choice" },
    { id: "words", label: "Words · multiple choice" },
    { id: "kanji", label: "Kanji · multiple choice" },
    { id: "typing", label: "Kanji · type the reading" },
  ];

  const kanaMode = (id, label, sample, prompt, answer, scripts) =>
    ({ id, group: "kana", label, sample, source: "kana", type: "choice", prompt, answer, scripts });

  const MODES = [
    kanaMode("hira-romaji", "Hiragana → Romaji", "あ → a", F.hira, F.romaji, ["hira"]),
    kanaMode("romaji-hira", "Romaji → Hiragana", "a → あ", F.romaji, F.hira, ["hira"]),
    kanaMode("kata-romaji", "Katakana → Romaji", "ア → a", F.kata, F.romaji, ["kata"]),
    kanaMode("romaji-kata", "Romaji → Katakana", "a → ア", F.romaji, F.kata, ["kata"]),
    kanaMode("hira-kata", "Hiragana → Katakana", "あ → ア", F.hira, F.kata, ["hira", "kata"]),
    kanaMode("kata-hira", "Katakana → Hiragana", "ア → あ", F.kata, F.hira, ["hira", "kata"]),

    { id: "word-romaji", group: "words", label: "Word → Romaji", sample: "ねこ → neko", source: "words", type: "choice", prompt: F.word, answer: F.romaji, focus: "reading" },
    { id: "word-english", group: "words", label: "Word → English", sample: "ねこ → cat", source: "words", type: "choice", prompt: F.word, answer: F.english, focus: "meaning" },
    { id: "english-word", group: "words", label: "English → Word", sample: "cat → ねこ", source: "words", type: "choice", prompt: F.english, answer: F.word, focus: "reading" },

    { id: "english-kanji", group: "kanji", label: "English → Kanji", sample: "cat → 猫", source: "kanji", type: "choice", prompt: F.english, answer: F.kanji, focus: "kanji" },
    { id: "kanji-english", group: "kanji", label: "Kanji → English", sample: "猫 → cat", source: "kanji", type: "choice", prompt: F.kanji, answer: F.english, focus: "meaning" },
    { id: "kanji-reading", group: "kanji", label: "Kanji → Reading", sample: "猫 → ねこ", source: "kanji", type: "choice", prompt: F.kanji, answer: F.word, focus: "reading" },

    { id: "type-kanji", group: "typing", label: "Kanji → type reading", sample: "猫 → ねこ / neko", source: "kanji", type: "typing", prompt: F.kanji },
    { id: "type-english", group: "typing", label: "English → type reading", sample: "cat → ねこ / neko", source: "kanji", type: "typing", prompt: F.english },
  ];

  const LEVELS = [
    { id: "easy", label: "Easy", options: 4, choiceTime: 0, typeTime: 0, share: 0 },
    { id: "medium", label: "Medium", options: 6, choiceTime: 12, typeTime: 30, share: 0.5 },
    { id: "hard", label: "Hard", options: 9, choiceTime: 7, typeTime: 18, share: 0.8 },
    { id: "expert", label: "Expert", options: 12, choiceTime: 4, typeTime: 10, share: 1 },
  ];

  const INPUTS = [
    { id: "kana", label: "Kana keyboard" },
    { id: "romaji", label: "Romaji" },
  ];

  const kanaInfo = (e) => `${e.hira} · ${e.kata} · ${e.romaji}`;
  const wordInfo = (e) => `${e.kanji ? e.kanji + " · " : ""}${e.kana} · ${e.romaji} · ${e.english}`;

  const SOURCES = {
    kana: { items: KANA, groups: KANA_GROUPS, groupOf: (e) => e.group, info: kanaInfo, similarity: kanaSimilarity },
    words: { items: WORDS, groups: WORD_THEMES, groupOf: (e) => e.theme, info: wordInfo, similarity: wordSimilarity },
    kanji: { items: WORDS.filter((w) => w.kanji), groups: WORD_THEMES, groupOf: (e) => e.theme, info: wordInfo, similarity: wordSimilarity },
  };

  const QUESTIONS_PER_ROUND = 20;
  const CORRECT_DELAY = 700;

  // ---- Settings ---------------------------------------------------------------

  const settings = Object.assign(
    {
      mode: "hira-romaji",
      level: "easy",
      input: "kana",
      filters: { kana: ["a", "ka", "sa"], words: ["animals", "food", "colors"], kanji: ["numbers", "nature", "body"] },
    },
    store.get("settings", {})
  );
  const saveSettings = () => store.set("settings", settings);

  const currentMode = () => MODES.find((m) => m.id === settings.mode) || MODES[0];
  const currentLevel = () => LEVELS.find((l) => l.id === settings.level) || LEVELS[0];

  // Typing modes answer with the kana reading or its romaji.
  function answerFace(mode, e) {
    if (mode.type === "choice") return mode.answer(e);
    return settings.input === "kana" ? F.word(e) : F.romaji(e);
  }

  function pool(mode) {
    const src = SOURCES[mode.source];
    const selected = new Set(settings.filters[mode.source] || []);
    return src.items.filter((e) => selected.has(src.groupOf(e)));
  }

  const distinctAnswers = (mode, items) => new Set(items.map((e) => answerFace(mode, e).text)).size;

  // ---- Menu -------------------------------------------------------------------

  function radio(name, value, checked, children, className = "chip") {
    return el("label", { className }, [el("input", { type: "radio", name, value, checked }), ...[].concat(children)]);
  }

  function renderMenu() {
    $("mode-list").replaceChildren(
      ...MODE_GROUPS.map((g) =>
        el("div", { className: "mode-group" }, [
          el("h3", { textContent: g.label }),
          el("div", { className: "mode-list" },
            MODES.filter((m) => m.group === g.id).map((m) =>
              radio("mode", m.id, m.id === settings.mode,
                el("span", { className: "mode-body" }, [
                  el("span", { className: "mode-label", textContent: m.label }),
                  el("span", { className: "mode-sample", lang: "ja", textContent: m.sample }),
                ]), "mode")
            )
          ),
        ])
      )
    );

    $("level-list").replaceChildren(
      ...LEVELS.map((l) =>
        radio("level", l.id, l.id === settings.level,
          el("span", { className: "mode-body" }, [
            el("span", { className: "mode-label", textContent: l.label }),
            el("span", { className: "mode-sample", textContent: levelDescription(l) }),
          ]), "mode")
      )
    );

    $("input-list").replaceChildren(
      ...INPUTS.map((i) => radio("input", i.id, i.id === settings.input, el("span", { textContent: i.label })))
    );

    renderFilters();
  }

  function levelDescription(l) {
    const time = l.choiceTime ? `${l.choiceTime}s per pick (${l.typeTime}s typing)` : "no time limit";
    const sim = l.share ? `${Math.round(l.share * 100)}% tricky options` : "random options";
    return `${l.options} options · ${time} · ${sim}`;
  }

  function renderFilters() {
    const mode = currentMode();
    const src = SOURCES[mode.source];
    const selected = new Set(settings.filters[mode.source] || []);
    const groups = src.groups.filter((g) => src.items.some((e) => src.groupOf(e) === g.id));
    $("filter-list").replaceChildren(
      ...groups.map((g) =>
        el("label", { className: "chip" }, [
          el("input", { type: "checkbox", value: g.id, checked: selected.has(g.id) }),
          el("span", { textContent: g.label }),
        ])
      )
    );
    $("input-field").hidden = mode.type !== "typing";
    updateAvailable();
  }

  function updateAvailable() {
    const mode = currentMode();
    const level = currentLevel();
    const items = pool(mode);
    const n = distinctAnswers(mode, items);
    $("start").disabled = n < 2;
    let msg;
    if (n < 2) msg = "Select more content to play.";
    else if (mode.type === "choice" && n < level.options) msg = `${items.length} items — only ${n} options per question with this selection.`;
    else msg = `${items.length} items available.`;
    $("available").textContent = msg;
  }

  $("mode-list").addEventListener("change", (ev) => {
    settings.mode = ev.target.value;
    saveSettings();
    renderFilters();
  });
  $("level-list").addEventListener("change", (ev) => {
    settings.level = ev.target.value;
    saveSettings();
    updateAvailable();
  });
  $("input-list").addEventListener("change", (ev) => {
    settings.input = ev.target.value;
    saveSettings();
    updateAvailable();
  });
  $("filter-list").addEventListener("change", () => {
    settings.filters[currentMode().source] = [...$("filter-list").querySelectorAll("input:checked")].map((i) => i.value);
    saveSettings();
    updateAvailable();
  });
  const setAllFilters = (on) => {
    const source = currentMode().source;
    settings.filters[source] = on ? SOURCES[source].groups.map((g) => g.id) : [];
    saveSettings();
    renderFilters();
  };
  $("filter-all").addEventListener("click", () => setAllFilters(true));
  $("filter-none").addEventListener("click", () => setAllFilters(false));

  // ---- Quiz state -------------------------------------------------------------

  const state = {
    token: 0, mode: null, level: null, pool: [], questions: [], index: 0,
    score: 0, streak: 0, bestStreak: 0, missed: [], times: [],
    answered: false, startedAt: 0, deadline: 0, raf: 0, options: [],
  };

  const showScreen = (id) => {
    for (const s of ["menu", "quiz", "results"]) $(s).hidden = s !== id;
  };

  function startQuiz() {
    state.mode = currentMode();
    state.level = currentLevel();
    state.pool = pool(state.mode);
    state.questions = [];
    while (state.questions.length < QUESTIONS_PER_ROUND) {
      const batch = shuffle(state.pool.slice());
      // Avoid the same item twice in a row across reshuffles.
      if (state.questions.length && batch[0] === state.questions.at(-1) && batch.length > 1) batch.push(batch.shift());
      state.questions.push(...batch);
    }
    state.questions.length = QUESTIONS_PER_ROUND;
    Object.assign(state, { index: 0, score: 0, streak: 0, bestStreak: 0, missed: [], times: [] });

    $("q-mode").textContent = `${state.mode.label} · ${state.level.label}`;
    showScreen("quiz");
    renderQuestion();
  }

  // Options for a choice question: the answer plus wrong options, a share of
  // which are picked from the items most similar to the answer.
  function buildOptions(item) {
    const { mode, level } = state;
    const promptText = mode.prompt(item).text;
    const answerText = mode.answer(item).text;
    const n = Math.min(level.options, distinctAnswers(mode, state.pool));
    // Never offer an item that shares the prompt (it would also be correct).
    const cands = state.pool.filter((e) => e !== item && mode.prompt(e).text !== promptText);
    const similarity = SOURCES[mode.source].similarity;
    const ranked = cands
      .map((e) => ({ e, s: similarity(mode, item, e) + Math.random() * 0.5 }))
      .sort((a, b) => b.s - a.s)
      .map((x) => x.e);

    const used = new Set([answerText]);
    const picked = [];
    const take = (list, limit) => {
      for (const e of list) {
        if (picked.length >= limit) break;
        const t = mode.answer(e).text;
        if (used.has(t)) continue;
        used.add(t);
        picked.push(e);
      }
    };
    const similarCount = Math.round(level.share * (n - 1));
    take(shuffle(ranked.slice(0, Math.ceil(similarCount * 1.5))), similarCount);
    take(shuffle(cands.slice()), n - 1);
    return shuffle([item, ...picked]);
  }

  function sizeClass(face) {
    const len = [...face.text].length;
    if (face.jp) return len <= 1 ? "xl" : len <= 2 ? "lg" : len <= 3 ? "md" : "sm";
    return len <= 3 ? "lg" : len <= 7 ? "md" : "sm";
  }

  function faceNode(face) {
    return el("span", {
      className: `face ${face.jp ? "jp" : "latin"} ${sizeClass(face)}`,
      lang: face.jp ? "ja" : "en",
      textContent: face.text,
    });
  }

  function renderQuestion() {
    const { mode, level } = state;
    const item = state.questions[state.index];
    state.answered = false;
    state.token++;

    $("q-progress").textContent = `${state.index + 1}/${QUESTIONS_PER_ROUND}`;
    $("q-score").textContent = state.score;
    $("q-streak").textContent = state.streak;
    $("feedback").hidden = true;

    const p = mode.prompt(item);
    $("prompt").className = `prompt kind-${p.kind}`;
    $("prompt").replaceChildren(el("span", { className: "tag", textContent: p.kind }), faceNode(p));

    const typing = mode.type === "typing";
    $("choices").hidden = typing;
    $("type-form").hidden = !typing;
    $("keyboard").hidden = !(typing && settings.input === "kana");

    if (typing) {
      const input = $("type-input");
      const kana = settings.input === "kana";
      input.value = "";
      input.readOnly = kana;
      input.className = kana ? "jp" : "";
      input.lang = kana ? "ja" : "en";
      input.placeholder = kana ? "Use the keyboard below" : "Type the reading in romaji";
      input.disabled = false;
      $("type-form").querySelector("button").disabled = false;
      if (kana) renderKeyboard();
      else input.focus();
    } else {
      state.options = buildOptions(item);
      const choices = $("choices");
      choices.dataset.count = state.options.length;
      choices.replaceChildren(
        ...state.options.map((e, i) => {
          const f = mode.answer(e);
          const btn = el("button", { type: "button", className: "option" }, [
            i < 9 ? el("span", { className: "key-hint", textContent: i + 1 }) : "",
            faceNode(f),
          ]);
          btn.dataset.index = i;
          return btn;
        })
      );
    }

    startTimer(typing ? level.typeTime : level.choiceTime);
  }

  // ---- Timer ------------------------------------------------------------------

  function startTimer(secs) {
    cancelAnimationFrame(state.raf);
    state.startedAt = performance.now();
    const bar = $("timer");
    bar.hidden = !secs;
    if (!secs) return;
    const fill = bar.firstElementChild;
    state.deadline = state.startedAt + secs * 1000;
    const tick = (now) => {
      const left = Math.max(0, state.deadline - now);
      fill.style.width = `${(left / (secs * 1000)) * 100}%`;
      bar.classList.toggle("low", left < secs * 300);
      if (left <= 0) return answer({ timeout: true });
      state.raf = requestAnimationFrame(tick);
    };
    state.raf = requestAnimationFrame(tick);
  }

  // ---- Answering --------------------------------------------------------------

  const normalizeRomaji = (s) =>
    s.toLowerCase().normalize("NFC")
      .replace(/[ā]/g, "aa").replace(/[ī]/g, "ii").replace(/[ūû]/g, "uu").replace(/[ē]/g, "ee").replace(/[ōô]/g, "ou")
      .replace(/[\s'\-]/g, "");
  const normalizeKana = (s) => s.replace(/\s/g, "");

  function acceptedAnswers(item) {
    const { mode } = state;
    const promptText = mode.prompt(item).text;
    const norm = settings.input === "kana" ? normalizeKana : normalizeRomaji;
    const accepted = new Set();
    for (const e of state.pool) {
      if (mode.prompt(e).text !== promptText) continue;
      accepted.add(norm(answerFace(mode, e).text));
      // Accept ō-style input for long vowels written "oo" too (おおきい → ōkii).
      if (settings.input === "romaji") accepted.add(norm(e.romaji.replace(/oo/g, "ou")));
    }
    return { accepted, norm };
  }

  function answer({ choice = null, typed = null, timeout = false }) {
    if (state.answered) return;
    state.answered = true;
    cancelAnimationFrame(state.raf);

    const { mode } = state;
    const item = state.questions[state.index];
    const correctFace = answerFace(mode, item);
    let correct = false;

    if (mode.type === "choice") {
      if (choice != null) correct = mode.answer(state.options[choice]).text === correctFace.text;
      $("choices").querySelectorAll(".option").forEach((btn, i) => {
        btn.disabled = true;
        const isAnswer = mode.answer(state.options[i]).text === correctFace.text;
        if (isAnswer) btn.classList.add("correct");
        else if (i === choice) btn.classList.add("wrong");
      });
    } else {
      if (typed != null) {
        const { accepted, norm } = acceptedAnswers(item);
        correct = accepted.has(norm(typed));
      }
      const input = $("type-input");
      input.disabled = true;
      input.classList.add(correct ? "correct" : "wrong");
      $("type-form").querySelector("button").disabled = true;
      $("keyboard").querySelectorAll("button").forEach((b) => (b.disabled = true));
    }

    state.times.push(performance.now() - state.startedAt);
    if (correct) {
      state.score++;
      state.streak++;
      state.bestStreak = Math.max(state.bestStreak, state.streak);
    } else {
      state.streak = 0;
      state.missed.push({ prompt: mode.prompt(item).text, answer: correctFace.text, info: SOURCES[mode.source].info(item) });
    }
    $("q-score").textContent = state.score;
    $("q-streak").textContent = state.streak;

    const fb = $("feedback");
    fb.hidden = false;
    fb.className = `feedback ${correct ? "ok" : "bad"}`;
    $("feedback-text").textContent = correct
      ? "正解! Correct"
      : `${timeout ? "Time's up!" : "Not quite."} Answer: ${correctFace.text}`;
    $("feedback-info").textContent = SOURCES[mode.source].info(item);
    $("next").hidden = correct;

    if (correct) {
      const token = state.token;
      setTimeout(() => token === state.token && next(), CORRECT_DELAY);
    } else {
      $("next").focus();
    }
  }

  function next() {
    state.index++;
    if (state.index >= QUESTIONS_PER_ROUND) showResults();
    else renderQuestion();
  }

  $("choices").addEventListener("click", (ev) => {
    const btn = ev.target.closest(".option");
    if (btn) answer({ choice: Number(btn.dataset.index) });
  });

  $("type-form").addEventListener("submit", (ev) => {
    ev.preventDefault();
    if (state.answered) return next();
    const v = $("type-input").value;
    if (v.trim()) answer({ typed: v });
  });

  $("next").addEventListener("click", () => state.answered && next());

  document.addEventListener("keydown", (ev) => {
    if ($("quiz").hidden || ev.ctrlKey || ev.metaKey || ev.altKey) return;
    const inField = ev.target === $("type-input") && !$("type-input").readOnly;
    if (ev.key === "Enter") {
      if (ev.target.tagName === "BUTTON" || inField) return; // native activation / form submit
      ev.preventDefault();
      if (state.answered) next();
      else if (state.mode.type === "typing") $("type-form").requestSubmit();
      return;
    }
    if (inField || state.answered) return;
    if (state.mode.type === "choice" && /^[1-9]$/.test(ev.key)) {
      const i = Number(ev.key) - 1;
      if (i < state.options.length) answer({ choice: i });
    } else if (state.mode.type === "typing" && settings.input === "kana" && ev.key === "Backspace") {
      ev.preventDefault();
      editKana("back");
    }
  });

  $("quit").addEventListener("click", () => {
    cancelAnimationFrame(state.raf);
    state.token++;
    showScreen("menu");
  });

  // ---- Kana keyboard ----------------------------------------------------------

  const KB_ROWS = [
    "あいうえお", "かきくけこ", "さしすせそ", "たちつてと", "なにぬねの",
    "はひふへほ", "まみむめも", "や ゆ よ", "らりるれろ", "わ を ん",
  ];
  const romajiOf = new Map(KANA.map((k) => [k.hira, k.romaji]));

  function renderKeyboard() {
    const kb = $("keyboard");
    if (kb.childElementCount) {
      kb.querySelectorAll("button").forEach((b) => (b.disabled = false));
      return;
    }
    const grid = el("div", { className: "kb-grid" });
    for (const row of KB_ROWS) {
      for (const ch of row) {
        if (ch === " ") {
          grid.append(el("span", { className: "kb-blank" }));
          continue;
        }
        const b = el("button", { type: "button", className: "kb-key", lang: "ja", textContent: ch, title: romajiOf.get(ch) || "" });
        b.dataset.ch = ch;
        grid.append(b);
      }
    }
    const mods = el("div", { className: "kb-mods" }, [
      ["dak", "゛", "Dakuten: か→が"],
      ["han", "゜", "Handakuten: は→ぱ"],
      ["small", "小", "Small kana: つ→っ, や→ゃ"],
      ["ー", "ー", "Long vowel mark"],
      ["back", "⌫", "Backspace"],
      ["clear", "Clear", "Clear"],
    ].map(([action, label, title]) => {
      const b = el("button", { type: "button", className: "kb-key kb-mod", lang: "ja", textContent: label, title });
      b.dataset.action = action;
      return b;
    }));
    const enter = el("button", { type: "button", className: "kb-key kb-enter primary", textContent: "Check ⏎" });
    enter.dataset.action = "enter";
    mods.append(enter);
    kb.replaceChildren(grid, mods);
  }

  function editKana(action, ch) {
    const input = $("type-input");
    const chars = [...input.value];
    if (ch) chars.push(ch);
    else if (action === "back") chars.pop();
    else if (action === "clear") chars.length = 0;
    else if (action === "ー") chars.push("ー");
    else if (chars.length) {
      const changed = applyModifier(action, chars.at(-1));
      if (changed) chars[chars.length - 1] = changed;
    }
    input.value = chars.join("");
  }

  $("keyboard").addEventListener("click", (ev) => {
    const b = ev.target.closest("button");
    if (!b || state.answered) return;
    if (b.dataset.action === "enter") $("type-form").requestSubmit();
    else editKana(b.dataset.action, b.dataset.ch);
  });

  // ---- Results ----------------------------------------------------------------

  function showResults() {
    const { mode, level } = state;
    const avg = state.times.reduce((a, b) => a + b, 0) / state.times.length;
    const pct = Math.round((state.score / QUESTIONS_PER_ROUND) * 100);

    const key = `best:${mode.id}:${level.id}${mode.type === "typing" ? ":" + settings.input : ""}`;
    const best = store.get(key, null);
    const isBest = !best || state.score > best.score || (state.score === best.score && avg < best.avg);
    if (isBest) store.set(key, { score: state.score, avg });

    $("results-title").textContent = pct === 100 ? "完璧! Perfect" : pct >= 80 ? "すごい! Great job" : pct >= 50 ? "いいね! Good" : "がんばって! Keep going";
    $("results-stats").textContent =
      `${state.score}/${QUESTIONS_PER_ROUND} correct (${pct}%) · best streak ${state.bestStreak} · avg ${fmtSecs(avg)} per question`;
    $("results-best").textContent = isBest
      ? `New best for ${mode.label} · ${level.label}!`
      : `Best for ${mode.label} · ${level.label}: ${best.score}/${QUESTIONS_PER_ROUND}, avg ${fmtSecs(best.avg)}`;

    $("missed-wrap").hidden = !state.missed.length;
    $("missed").replaceChildren(
      ...state.missed.map((m) =>
        el("li", {}, [
          el("span", { className: "missed-prompt", lang: "ja", textContent: m.prompt }),
          el("span", { className: "muted", textContent: " → " }),
          el("strong", { lang: "ja", textContent: m.answer }),
          el("span", { className: "missed-info muted", lang: "ja", textContent: m.info }),
        ])
      )
    );
    showScreen("results");
  }

  $("start").addEventListener("click", startQuiz);
  $("again").addEventListener("click", startQuiz);
  $("to-menu").addEventListener("click", () => showScreen("menu"));

  renderMenu();
})();
