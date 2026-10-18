grab("js/data.js").grab("js/dom-utilities.js").grab("js/utilities.js").grab("js/storage.js")
  .grab("js/kana.js").grab("js/draw.js").grab("js/keyboard.js").run((ctx) => {
  const { KANA, KANA_GROUPS, WORDS, WORD_THEMES, KANA_LOOKALIKES, KANJI_LOOKALIKES } = ctx.data;
  const { $, el } = ctx.dom;
  const { shuffle, levenshtein, groupLookup, fmtSecs, pct } = ctx.utils;
  const { baseKana, kanaToRomaji, toKatakana, normalizeRomaji, normalizeKana, lookalikesOf } = ctx.kana;
  const { draw: Draw, keyboard: Keyboard } = ctx;

  const store = ctx.storage.createStore("matchagana:");

  // ---- Similarity -------------------------------------------------------------

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

  // Faces: how an item is written in the prompt or an answer.
  const F = {
    hira: (e) => ({ text: e.hira, kind: "hiragana", jp: true }),
    kata: (e) => ({ text: e.kata, kind: "katakana", jp: true }),
    romaji: (e) => ({ text: e.romaji, kind: "romaji" }),
    word: (e) => ({ text: e.kana, kind: "hiragana", jp: true }),
    wordKata: (e) => ({ text: toKatakana(e.kana), kind: "katakana", jp: true }),
    kanji: (e) => ({ text: e.kanji, kind: "kanji", jp: true }),
    english: (e) => ({ text: e.english, kind: "english" }),
  };

  // A mode is built from what is shown (PROMPTS) and how it is answered
  // (ANSWERS). `kind` is the script of the face, used to hide redundant pairs.
  const PROMPTS = [
    { id: "kana-romaji", label: "Kana in romaji", source: "kana", kind: "romaji", face: F.romaji },
    { id: "word-romaji", label: "Words in romaji", source: "words", kind: "romaji", face: F.romaji },
    { id: "hira", label: "Hiragana", source: "kana", kind: "hiragana", face: F.hira },
    { id: "kata", label: "Katakana", source: "kana", kind: "katakana", face: F.kata },
    { id: "word-hira", label: "Words in hiragana", source: "words", kind: "hiragana", face: F.word },
    { id: "word-kata", label: "Words in katakana", source: "words", kind: "katakana", face: F.wordKata },
    { id: "kanji", label: "Kanji", source: "kanji", kind: "kanji", face: F.kanji },
    { id: "english", label: "English", source: "words", kind: "english", face: F.english },
  ];

  // faces: the face for kana items and for word items (null: not available).
  // mark: shown before the answer in the samples.
  const ANSWERS = [
    { id: "type-romaji", label: "Write romaji", type: "typing", input: "romaji", kind: "romaji", mark: "⌨ ", faces: { kana: F.romaji, word: F.romaji } },
    { id: "pick-romaji", label: "Select romaji", type: "choice", kind: "romaji", mark: "", faces: { kana: F.romaji, word: F.romaji } },
    { id: "pick-hira", label: "Select hiragana", type: "choice", kind: "hiragana", mark: "", faces: { kana: F.hira, word: F.word } },
    { id: "pick-kata", label: "Select katakana", type: "choice", kind: "katakana", mark: "", faces: { kana: F.kata, word: F.wordKata } },
    { id: "keyboard", label: "Hiragana keyboard", type: "typing", input: "kana", kind: "hiragana", mark: "⌨ ", faces: { kana: F.hira, word: F.word } },
    { id: "pick-kanji", label: "Select kanji", type: "choice", kind: "kanji", mark: "", faces: { kana: null, word: F.kanji } },
    { id: "pick-english", label: "Select English", type: "choice", kind: "english", mark: "", faces: { kana: null, word: F.english } },
    { id: "draw-hira", label: "Draw hiragana", type: "draw", kind: "hiragana", mark: "✍ ", faces: { kana: F.hira, word: F.word } },
    { id: "draw-kata", label: "Draw katakana", type: "draw", kind: "katakana", mark: "✍ ", faces: { kana: F.kata, word: F.wordKata } },
    { id: "draw-kanji", label: "Draw kanji", type: "draw", kind: "kanji", mark: "✍ ", faces: { kana: null, word: F.kanji } },
  ];

  const findPrompt = (id) => PROMPTS.find((p) => p.id === id);
  const faceFor = (prompt, a) => a.faces[prompt.source === "kana" ? "kana" : "word"];

  // Answers that fit a prompt: available for its items and not in the same script.
  const answersFor = (prompt) => ANSWERS.filter((a) => faceFor(prompt, a) && a.kind !== prompt.kind);

  function buildMode(promptId, answerId) {
    const p = findPrompt(promptId);
    const a = p && answersFor(p).find((x) => x.id === answerId);
    if (!a) return null;
    const kinds = [p.kind, a.kind];
    const scripts = [["hira", "hiragana"], ["kata", "katakana"]].filter(([, k]) => kinds.includes(k)).map(([s]) => s);
    return {
      id: `${p.id}:${a.id}`,
      label: `${p.label} → ${a.label}`,
      promptId: p.id,
      answerId: a.id,
      source: p.kind === "kanji" || a.kind === "kanji" ? "kanji" : p.source,
      type: a.type,
      input: a.input,
      prompt: p.face,
      answer: faceFor(p, a),
      scripts: scripts.length ? scripts : ["hira"],
      focus: a.kind === "kanji" ? "kanji" : a.kind === "english" ? "meaning" : "reading",
    };
  }

  // Samples on the menu cards, e.g. "猫 → neko", "ka → ✍ か".
  const SAMPLE = { kana: KANA.find((k) => k.hira === "か"), word: WORDS.find((w) => w.kana === "ねこ") };
  const sampleItem = (prompt) => SAMPLE[prompt.source === "kana" ? "kana" : "word"];
  const promptSample = (p) => p.face(sampleItem(p)).text;
  const modeSample = (p, a) => `${promptSample(p)} → ${a.mark}${faceFor(p, a)(sampleItem(p)).text}`;

  const LEVELS = [
    { id: "easy", label: "Easy", options: 4, choiceTime: 0, typeTime: 0, revealTime: 5, share: 0, drawPass: 0.5, drawStrict: false, drawShift: 6 },
    { id: "medium", label: "Medium", options: 6, choiceTime: 12, typeTime: 30, revealTime: 6, share: 0.5, drawPass: 0.58, drawStrict: false, drawShift: 3 },
    { id: "hard", label: "Hard", options: 9, choiceTime: 7, typeTime: 18, revealTime: 3.5, share: 0.8, drawPass: 0.65, drawStrict: true, drawShift: 0 },
    { id: "expert", label: "Expert", options: 12, choiceTime: 4, typeTime: 10, revealTime: 2, share: 1, drawPass: 0.72, drawStrict: true, drawShift: 0 },
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
  const CORRECT_DELAY_DRAW = 1600; // longer, so the drawing review can be seen

  // ---- Settings ---------------------------------------------------------------

  const settings = Object.assign(
    {
      prompt: "hira",
      answer: "pick-romaji",
      recent: [], // last two modes played: [{ prompt, answer }], newest first
      level: "easy",
      hideOptions: false,
      noTimer: false,
      holdCorrect: false,
      filters: { kana: ["a", "ka", "sa"], words: ["animals", "food", "colors"], kanji: ["numbers", "nature", "body"] },
    },
    store.get("settings", {})
  );
  delete settings.mode; // replaced by prompt + answer
  delete settings.input; // now part of the answer
  // Saved choices that no longer exist fall back to the defaults.
  if (!findPrompt(settings.prompt)) settings.prompt = "hira";
  if (!buildMode(settings.prompt, settings.answer)) settings.answer = answersFor(findPrompt(settings.prompt))[0].id;
  settings.recent = settings.recent.filter((r) => buildMode(r.prompt, r.answer));
  const saveSettings = () => store.set("settings", settings);

  // null while the chosen answer doesn't fit the chosen prompt (menu step 2).
  const currentMode = () => buildMode(settings.prompt, settings.answer);
  const currentLevel = () => LEVELS.find((l) => l.id === settings.level) || LEVELS[0];
  const hidingOptions = () => currentMode().type === "choice" && settings.hideOptions;

  function pool(mode) {
    const src = SOURCES[mode.source];
    const selected = new Set(settings.filters[mode.source] || []);
    return src.items.filter((e) => selected.has(src.groupOf(e)));
  }

  const distinctAnswers = (mode, items) => new Set(items.map((e) => mode.answer(e).text)).size;

  // ---- Menu -------------------------------------------------------------------
  // A wizard: 1. what is shown, 2. how to answer, 3. content, difficulty and options.

  const STEPS = ["step-prompt", "step-answer", "step-setup"];

  function radio(name, value, checked, children, className = "chip") {
    return el("label", { className }, [el("input", { type: "radio", name, value, checked }), ...[].concat(children)]);
  }

  // A clickable card; picking one moves on to the next step.
  function card(label, sample, pressed, data) {
    const btn = el("button", { type: "button", className: "mode" }, [
      el("span", { className: "mode-body" }, [
        el("span", { className: "mode-label", textContent: label }),
        el("span", { className: "mode-sample", lang: "ja", textContent: sample }),
      ]),
    ]);
    btn.setAttribute("aria-pressed", String(pressed));
    Object.assign(btn.dataset, data);
    return btn;
  }

  function modeSummary(mode) {
    const p = findPrompt(mode.promptId);
    const a = ANSWERS.find((x) => x.id === mode.answerId);
    return [
      el("strong", { textContent: mode.label }),
      el("span", { className: "mode-sample", lang: "ja", textContent: modeSample(p, a) }),
    ];
  }

  function showStep(i) {
    STEPS.forEach((id, j) => ($(id).hidden = j !== i));
    $("menu-progress").textContent = `Step ${i + 1} of ${STEPS.length}`;
    if (i === 0) renderPromptStep();
    else if (i === 1) renderAnswerStep();
    else renderSetupStep();
  }

  function renderPromptStep() {
    const recent = settings.recent;
    $("recent-field").hidden = !recent.length;
    $("recent-list").replaceChildren(
      ...recent.map((r) => {
        const p = findPrompt(r.prompt);
        const a = ANSWERS.find((x) => x.id === r.answer);
        return card(`${p.label} → ${a.label}`, modeSample(p, a), false, { prompt: r.prompt, answer: r.answer });
      })
    );
    $("prompt-list").replaceChildren(
      ...PROMPTS.map((p) => card(p.label, promptSample(p), p.id === settings.prompt, { prompt: p.id }))
    );
  }

  function renderAnswerStep() {
    const p = findPrompt(settings.prompt);
    $("answer-shown").textContent = `Shown: ${p.label} (${promptSample(p)})`;
    $("answer-list").replaceChildren(
      ...answersFor(p).map((a) => card(a.label, modeSample(p, a), a.id === settings.answer, { answer: a.id }))
    );
    $("step-answer").querySelector(".step-next").disabled = !currentMode();
  }

  function renderSetupStep() {
    $("setup-mode").replaceChildren(...modeSummary(currentMode()));
    $("level-list").replaceChildren(
      ...LEVELS.map((l) =>
        radio("level", l.id, l.id === settings.level,
          el("span", { className: "mode-body" }, [
            el("span", { className: "mode-label", textContent: l.label }),
            el("span", { className: "mode-sample", textContent: levelDescription(l) }),
          ]), "mode")
      )
    );
    $("hide-options").checked = settings.hideOptions;
    $("no-timer").checked = settings.noTimer;
    $("hold-correct").checked = settings.holdCorrect;
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
    $("hide-label").hidden = mode.type !== "choice";
    $("hide-label").title = settings.noTimer
      ? "Think of the answer first, then reveal the options."
      : `Think of the answer first, then reveal. You get ${level.revealTime}s to pick once the options appear.`;
    $("hold-label").hidden = mode.type !== "draw";
  }

  // Remember the mode just started; keep the last two different ones.
  function rememberMode() {
    const { prompt, answer } = settings;
    settings.recent = [{ prompt, answer }, ...settings.recent.filter((r) => r.prompt !== prompt || r.answer !== answer)].slice(0, 2);
    saveSettings();
  }

  $("recent-list").addEventListener("click", (ev) => {
    const btn = ev.target.closest("button");
    if (!btn) return;
    settings.prompt = btn.dataset.prompt;
    settings.answer = btn.dataset.answer;
    saveSettings();
    showStep(2);
  });
  $("prompt-list").addEventListener("click", (ev) => {
    const btn = ev.target.closest("button");
    if (!btn) return;
    settings.prompt = btn.dataset.prompt;
    // Keep the answer if it still fits; otherwise it has to be picked again.
    if (!currentMode()) settings.answer = null;
    saveSettings();
    showStep(1);
  });
  $("answer-list").addEventListener("click", (ev) => {
    const btn = ev.target.closest("button");
    if (!btn) return;
    settings.answer = btn.dataset.answer;
    saveSettings();
    showStep(2);
  });
  for (const id of STEPS) {
    const i = STEPS.indexOf(id);
    $(id).querySelector(".step-next")?.addEventListener("click", () => showStep(i + 1));
    $(id).querySelector(".step-back")?.addEventListener("click", () => showStep(i - 1));
    $(id).querySelector(".step-restart")?.addEventListener("click", () => showStep(0));
  }

  $("level-list").addEventListener("change", (ev) => {
    settings.level = ev.target.value;
    saveSettings();
    updateAvailable();
  });
  $("no-timer").addEventListener("change", (ev) => {
    settings.noTimer = ev.target.checked;
    saveSettings();
    updateAvailable();
  });
  $("hold-correct").addEventListener("change", (ev) => {
    settings.holdCorrect = ev.target.checked;
    saveSettings();
  });
  $("hide-options").addEventListener("change", (ev) => {
    settings.hideOptions = ev.target.checked;
    saveSettings();
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
    answered: false, revealed: true, drawn: [], checking: false, startedAt: 0, deadline: 0, raf: 0, options: [],
  };

  // Back to the menu from a round: the last step, to tweak and restart the same mode.
  const showMenu = () => {
    showScreen("menu");
    showStep(STEPS.length - 1);
  };

  const showScreen = (id) => {
    for (const s of ["menu", "quiz", "results"]) $(s).hidden = s !== id;
  };

  function startQuiz() {
    rememberMode();
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

    $("q-mode").textContent = `${state.mode.label} · ${state.level.label}${hidingOptions() ? " · options hidden" : ""}${settings.noTimer ? " · no time limit" : ""}`;
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
    state.revealed = !hidingOptions();
    state.startedAt = performance.now();
    state.token++;

    $("q-progress").textContent = `${state.index + 1}/${QUESTIONS_PER_ROUND}`;
    $("q-score").textContent = state.score;
    $("q-streak").textContent = state.streak;
    $("feedback").hidden = true;

    const p = mode.prompt(item);
    $("prompt").className = `prompt kind-${p.kind}`;
    $("prompt").replaceChildren(el("span", { className: "tag", textContent: p.kind }), faceNode(p));

    const typing = mode.type === "typing";
    const drawing = mode.type === "draw";
    $("choices").hidden = mode.type !== "choice" || !state.revealed;
    $("reveal").hidden = state.revealed;
    $("type-form").hidden = !typing;
    $("keyboard").hidden = !(typing && mode.input === "kana");
    $("draw").hidden = !drawing;
    $("feedback-draw").hidden = true;

    if (drawing) {
      startDrawing(item);
    } else if (typing) {
      const input = $("type-input");
      const kana = mode.input === "kana";
      input.value = "";
      input.readOnly = kana;
      input.className = kana ? "jp" : "";
      input.lang = kana ? "ja" : "en";
      input.placeholder = kana ? "Use the keyboard below" : "Type the reading in romaji";
      input.disabled = false;
      $("type-form").querySelector("button").disabled = false;
      if (kana) keyboard.enable();
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

    if (!state.revealed) {
      startTimer(0);
      $("reveal").focus();
    } else if (drawing) {
      startTimer(level.typeTime * [...mode.answer(item).text].length);
    } else startTimer(typing ? level.typeTime : level.choiceTime);
  }

  // Hidden-options mode: the player recalls the answer first, then reveals the
  // options and gets the shorter revealTime to pick.
  function reveal() {
    if (state.revealed || state.answered) return;
    state.revealed = true;
    $("reveal").hidden = true;
    $("choices").hidden = false;
    startTimer(state.level.revealTime);
  }

  // ---- Timer ------------------------------------------------------------------

  function startTimer(secs) {
    if (settings.noTimer) secs = 0;
    cancelAnimationFrame(state.raf);
    const bar = $("timer");
    bar.hidden = !secs;
    if (!secs) return;
    const fill = bar.firstElementChild;
    state.deadline = performance.now() + secs * 1000;
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

  function acceptedAnswers(item) {
    const { mode } = state;
    const promptText = mode.prompt(item).text;
    const norm = mode.input === "kana" ? normalizeKana : normalizeRomaji;
    const accepted = new Set();
    for (const e of state.pool) {
      if (mode.prompt(e).text !== promptText) continue;
      accepted.add(norm(mode.answer(e).text));
      // Accept ō-style input for long vowels written "oo" too (おおきい → ōkii).
      if (mode.input === "romaji") accepted.add(norm(e.romaji.replace(/oo/g, "ou")));
    }
    return { accepted, norm };
  }

  // Explain the wrong answer in terms of the other scripts, e.g. "ツ (tsu)",
  // "犬 (いぬ · inu · dog)", or a typed "ねく (neku)".
  function describeAnswer(choice, typed, drawn) {
    const { mode } = state;
    if (mode.type === "choice") {
      if (choice == null) return "";
      const e = state.options[choice];
      const f = mode.answer(e);
      if (mode.source === "kana") {
        return f.kind === "romaji" ? `${f.text} (${mode.scripts.map((s) => e[s]).join(" · ")})` : `${f.text} (${e.romaji})`;
      }
      const reading = `${e.kana} · ${e.romaji}`;
      switch (f.kind) {
        case "kanji": return `${f.text} (${reading} · ${e.english})`;
        case "hiragana":
        case "katakana": return `${f.text} (${e.romaji} · ${e.english})`;
        case "romaji": return `${f.text} (${e.kana} · ${e.english})`;
        default: return `${f.text} (${e.kanji ? e.kanji + " · " : ""}${reading})`;
      }
    }
    if (mode.type === "draw") {
      if (!drawn) return "";
      const n = state.drawn.length;
      if (n !== drawn.chars.length) {
        return `${n} character${n === 1 ? "" : "s"} drawn, but ${drawn.target} has ${drawn.chars.length}`;
      }
      const bad = drawn.chars
        .map((ch, i) => ({ ch, ...drawn.scores[i] }))
        .filter((s) => !s.pass)
        .map((s) => `${s.ch} ${pct(s.score)}${s.beatenBy ? ` (looked more like ${s.beatenBy})` : ""}`);
      return `didn't match: ${bad.join(", ")}`;
    }
    if (typed == null) return "";
    const t = typed.trim();
    if (mode.source === "kana") {
      if (mode.input === "kana") return `${t} (${kanaToRomaji(t)})`;
      const kana = KANA.find((k) => k.romaji === normalizeRomaji(t));
      return kana ? `${t} (${mode.scripts.map((s) => kana[s]).join(" · ")})` : t;
    }
    if (mode.input === "kana") {
      const word = WORDS.find((w) => w.kana === t);
      return `${t} (${kanaToRomaji(t)}${word ? " = " + (word.kanji ? word.kanji + " · " : "") + word.english : ""})`;
    }
    const word = WORDS.find((w) => normalizeRomaji(w.romaji) === normalizeRomaji(t));
    return word ? `${t} (${word.kana} = ${word.kanji ? word.kanji + " · " : ""}${word.english})` : t;
  }

  function answer({ choice = null, typed = null, drawn = null, timeout = false }) {
    if (state.answered) return;
    state.answered = true;
    cancelAnimationFrame(state.raf);

    const { mode } = state;
    const item = state.questions[state.index];
    const correctFace = mode.answer(item);
    let correct = false;

    if (mode.type === "choice") {
      if (choice != null) correct = mode.answer(state.options[choice]).text === correctFace.text;
      $("choices").querySelectorAll(".option").forEach((btn, i) => {
        btn.disabled = true;
        const isAnswer = mode.answer(state.options[i]).text === correctFace.text;
        if (isAnswer) btn.classList.add("correct");
        else if (i === choice) btn.classList.add("wrong");
      });
    } else if (mode.type === "draw") {
      correct = !!drawn && drawn.pass;
      endDrawing(drawn);
    } else {
      if (typed != null) {
        const { accepted, norm } = acceptedAnswers(item);
        correct = accepted.has(norm(typed));
      }
      const input = $("type-input");
      input.disabled = true;
      input.classList.add(correct ? "correct" : "wrong");
      $("type-form").querySelector("button").disabled = true;
      keyboard.disable();
    }

    const yours = correct ? "" : describeAnswer(choice, typed, drawn);
    state.times.push(performance.now() - state.startedAt);
    if (correct) {
      state.score++;
      state.streak++;
      state.bestStreak = Math.max(state.bestStreak, state.streak);
    } else {
      state.streak = 0;
      state.missed.push({ prompt: mode.prompt(item).text, answer: correctFace.text, info: SOURCES[mode.source].info(item), yours });
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
    $("feedback-yours").hidden = correct || !yours;
    $("feedback-yours").textContent = yours ? `You answered: ${yours}` : "";
    // Optionally stay on correct drawings so the answer can be compared at leisure.
    const hold = correct && mode.type === "draw" && settings.holdCorrect;
    $("next").hidden = correct && !hold;

    if (correct && !hold) {
      const token = state.token;
      const delay = mode.type === "draw" ? CORRECT_DELAY_DRAW : CORRECT_DELAY;
      setTimeout(() => token === state.token && next(), delay);
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

  $("reveal").addEventListener("click", reveal);
  $("next").addEventListener("click", () => state.answered && next());

  document.addEventListener("keydown", (ev) => {
    if ($("quiz").hidden || ev.ctrlKey || ev.metaKey || ev.altKey) return;
    if (state.mode.type === "draw" && !state.answered) {
      if (ev.key === "Enter") {
        ev.preventDefault();
        checkDrawing();
      } else if (ev.key === " ") {
        ev.preventDefault();
        saveCurrentChar();
      } else if (ev.key === "Backspace") {
        ev.preventDefault();
        undoDraw();
      }
      return;
    }
    const inField = ev.target === $("type-input") && !$("type-input").readOnly;
    if (ev.key === "Enter") {
      if (ev.target.tagName === "BUTTON" || inField) return; // native activation / form submit
      ev.preventDefault();
      if (state.answered) next();
      else if (!state.revealed) reveal();
      else if (state.mode.type === "typing") $("type-form").requestSubmit();
      return;
    }
    if (inField || state.answered) return;
    if (!state.revealed) {
      if (ev.key === " " && ev.target.tagName !== "BUTTON") {
        ev.preventDefault();
        reveal();
      }
      return;
    }
    if (state.mode.type === "choice" && /^[1-9]$/.test(ev.key)) {
      const i = Number(ev.key) - 1;
      if (i < state.options.length) answer({ choice: i });
    } else if (state.mode.type === "typing" && state.mode.input === "kana" && ev.key === "Backspace") {
      ev.preventDefault();
      keyboard.edit("back");
    }
  });

  $("quit").addEventListener("click", () => {
    cancelAnimationFrame(state.raf);
    state.token++;
    showMenu();
  });

  // ---- Drawing (writing modes) --------------------------------------------------

  const pad = Draw.createPad($("draw-canvas"));
  const drawButtons = () => $("draw").querySelectorAll("button");

  function startDrawing(item) {
    state.drawn = [];
    state.checking = false;
    pad.clear();
    pad.setDisabled(false);
    $("draw-answer").hidden = true;
    drawButtons().forEach((b) => (b.disabled = false));
    renderStrip();
    // The canvas was hidden until now, so size it after layout.
    requestAnimationFrame(() => pad.resize());
    Draw.ensureFont(state.mode.answer(item).text);
  }

  function renderStrip() {
    $("draw-strip").replaceChildren(...state.drawn.map((strokes) => Draw.thumbnail(strokes, null, 44)));
  }

  function saveCurrentChar() {
    if (state.answered || pad.isEmpty()) return;
    state.drawn.push(pad.strokes);
    pad.clear();
    renderStrip();
  }

  // Undo a stroke; on an empty canvas, take back the last saved character.
  function undoDraw() {
    if (!pad.isEmpty()) pad.undo();
    else if (state.drawn.length) {
      state.drawn.pop();
      renderStrip();
    }
  }

  function clearDraw() {
    if (!pad.isEmpty()) pad.clear();
    else if (state.drawn.length) {
      state.drawn.pop();
      renderStrip();
    }
  }

  async function scoreChar(strokes, ch, level) {
    const score = await Draw.match(strokes, ch, level.drawShift);
    let pass = score >= level.drawPass;
    let beatenBy = null;
    if (pass && level.drawStrict) {
      for (const alt of lookalikesOf(ch)) {
        if ((await Draw.match(strokes, alt, level.drawShift)) > score) {
          pass = false;
          beatenBy = alt;
          break;
        }
      }
    }
    return { score, pass, beatenBy };
  }

  // Judge the drawing against every accepted answer (items sharing the prompt,
  // e.g. はな → 花 or 鼻) and keep the best result.
  async function checkDrawing() {
    if (state.answered || state.checking) return;
    saveCurrentChar();
    if (!state.drawn.length) return;
    state.checking = true;
    const token = state.token;
    const { mode, level } = state;
    const item = state.questions[state.index];
    const promptText = mode.prompt(item).text;
    const targets = [...new Set(state.pool.filter((e) => mode.prompt(e).text === promptText).map((e) => mode.answer(e).text))];

    let best = null;
    for (const target of targets) {
      const chars = [...target];
      const scores = [];
      for (let i = 0; i < chars.length; i++) {
        scores.push(state.drawn[i] ? await scoreChar(state.drawn[i], chars[i], level) : { score: 0, pass: false });
      }
      const pass = chars.length === state.drawn.length && scores.every((s) => s.pass);
      const total = scores.reduce((a, s) => a + s.score, 0) - Math.abs(chars.length - state.drawn.length);
      if (!best || (pass && !best.pass) || (pass === best.pass && total > best.total)) {
        best = { target, chars, scores, pass, total };
      }
    }
    state.checking = false;
    if (token !== state.token || state.answered) return;
    answer({ drawn: best });
  }

  // Lock the pad and show each drawn character over the expected one.
  function endDrawing(drawn) {
    pad.setDisabled(true);
    drawButtons().forEach((b) => (b.disabled = true));
    showDrawAnswer(drawn);
    const review = $("feedback-draw");
    if (!drawn) {
      review.hidden = true;
      return;
    }
    const count = Math.max(drawn.chars.length, state.drawn.length);
    const tiles = [];
    for (let i = 0; i < count; i++) {
      const ch = drawn.chars[i];
      const strokes = state.drawn[i];
      const s = drawn.scores[i];
      tiles.push(
        el("figure", { className: `draw-tile ${s && s.pass ? "pass" : "fail"}` }, [
          strokes ? Draw.thumbnail(strokes, ch, 72) : el("span", { className: "draw-missing", textContent: "—" }),
          el("figcaption", { lang: "ja", textContent: ch ? `${ch} ${s ? pct(s.score) : ""}` : "extra" }),
        ])
      );
    }
    review.replaceChildren(...tiles);
    review.hidden = false;
  }

  // The correct answer in a box the size of the pad, beside it. Shows the
  // accepted answer the drawing was judged against (はな → 花 or 鼻).
  function showDrawAnswer(drawn) {
    const text = drawn ? drawn.target : state.mode.answer(state.questions[state.index]).text;
    const box = $("draw-answer");
    box.className = `draw-answer ${drawn && drawn.pass ? "pass" : "fail"}`;
    box.style.setProperty("--chars", [...text].length);
    box.firstElementChild.textContent = text;
    box.hidden = false;
  }

  $("draw-undo").addEventListener("click", undoDraw);
  $("draw-clear").addEventListener("click", clearDraw);
  $("draw-next").addEventListener("click", saveCurrentChar);
  $("draw-check").addEventListener("click", checkDrawing);

  // ---- Kana keyboard ----------------------------------------------------------

  const keyboard = Keyboard.create($("keyboard"), {
    input: $("type-input"),
    onEnter: () => $("type-form").requestSubmit(),
  });

  // ---- Results ----------------------------------------------------------------

  function showResults() {
    const { mode, level } = state;
    const avg = state.times.reduce((a, b) => a + b, 0) / state.times.length;
    const percent = Math.round((state.score / QUESTIONS_PER_ROUND) * 100);

    const key = `best:${mode.promptId}:${mode.answerId}:${level.id}${hidingOptions() ? ":hidden" : ""}${settings.noTimer ? ":untimed" : ""}`;
    const best = store.get(key, null);
    const isBest = !best || state.score > best.score || (state.score === best.score && avg < best.avg);
    if (isBest) store.set(key, { score: state.score, avg });

    $("results-title").textContent = percent === 100 ? "完璧! Perfect" : percent >= 80 ? "すごい! Great job" : percent >= 50 ? "いいね! Good" : "がんばって! Keep going";
    $("results-stats").textContent =
      `${state.score}/${QUESTIONS_PER_ROUND} correct (${percent}%) · best streak ${state.bestStreak} · avg ${fmtSecs(avg)} per question`;
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
          m.yours ? el("span", { className: "missed-yours", lang: "ja", textContent: `You answered: ${m.yours}` }) : "",
        ])
      )
    );
    showScreen("results");
  }

  $("start").addEventListener("click", startQuiz);
  $("again").addEventListener("click", startQuiz);
  $("to-menu").addEventListener("click", showMenu);

  ctx.game = { start: () => showStep(0) };
});
