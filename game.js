(() => {
  // ---- Modes: which two faces make up a pair --------------------------------

  const kanaInfo = (e) => `${e.hira} · ${e.kata} · ${e.romaji}`;
  const wordInfo = (e) => `${e.kanji ? e.kanji + " · " : ""}${e.kana} · ${e.romaji} · ${e.english}`;

  const face = {
    hira: (e) => ({ text: e.hira, kind: "hiragana", jp: true }),
    kata: (e) => ({ text: e.kata, kind: "katakana", jp: true }),
    romaji: (e) => ({ text: e.romaji, kind: "romaji" }),
    word: (e) => ({ text: e.kana, kind: "hiragana", jp: true }),
    kanji: (e) => ({ text: e.kanji, kind: "kanji", jp: true }),
    english: (e) => ({ text: e.english, kind: "english" }),
  };

  const MODES = [
    { id: "hira-romaji", label: "Hiragana ↔ Romaji", sample: "あ ↔ a", source: "kana", a: face.hira, b: face.romaji },
    { id: "kata-romaji", label: "Katakana ↔ Romaji", sample: "ア ↔ a", source: "kana", a: face.kata, b: face.romaji },
    { id: "hira-kata", label: "Hiragana ↔ Katakana", sample: "あ ↔ ア", source: "kana", a: face.hira, b: face.kata },
    { id: "word-romaji", label: "Words ↔ Romaji", sample: "ねこ ↔ neko", source: "words", a: face.word, b: face.romaji },
    { id: "word-english", label: "Words ↔ English", sample: "ねこ ↔ cat", source: "words", a: face.word, b: face.english },
    { id: "kanji-romaji", label: "Kanji ↔ Romaji", sample: "猫 ↔ neko", source: "kanji", a: face.kanji, b: face.romaji },
    { id: "kanji-english", label: "Kanji ↔ English", sample: "猫 ↔ cat", source: "kanji", a: face.kanji, b: face.english },
  ];

  const SOURCES = {
    kana: { items: KANA, groups: KANA_GROUPS, groupOf: (e) => e.group, info: kanaInfo },
    words: { items: WORDS, groups: WORD_THEMES, groupOf: (e) => e.theme, info: wordInfo },
    kanji: { items: WORDS.filter((w) => w.kanji), groups: WORD_THEMES, groupOf: (e) => e.theme, info: wordInfo },
  };

  const SIZES = [6, 8, 12];
  const MISMATCH_DELAY = 900;

  // ---- Persistence (best-effort) --------------------------------------------

  const store = {
    get(key, fallback) {
      try {
        const v = localStorage.getItem("kana-memory:" + key);
        return v == null ? fallback : JSON.parse(v);
      } catch {
        return fallback;
      }
    },
    set(key, value) {
      try {
        localStorage.setItem("kana-memory:" + key, JSON.stringify(value));
      } catch {}
    },
  };

  const settings = Object.assign(
    { mode: "hira-romaji", size: 8, filters: { kana: ["a", "ka", "sa"], words: ["animals", "food", "colors"], kanji: ["numbers", "nature", "body"] } },
    store.get("settings", {})
  );

  // ---- DOM helpers ----------------------------------------------------------

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

  const currentMode = () => MODES.find((m) => m.id === settings.mode) || MODES[0];

  // Items eligible for the current mode, deduped so no two dealt items share a
  // face (e.g. じ/ぢ both read "ji", はな is both "nose" and "flower").
  function pool(mode) {
    const src = SOURCES[mode.source];
    const selected = new Set(settings.filters[mode.source] || []);
    return src.items.filter((e) => selected.has(src.groupOf(e)));
  }

  function countUnique(mode, items) {
    const seenA = new Set(), seenB = new Set();
    let n = 0;
    for (const e of items) {
      const a = mode.a(e).text, b = mode.b(e).text;
      if (seenA.has(a) || seenB.has(b)) continue;
      seenA.add(a); seenB.add(b); n++;
    }
    return n;
  }

  function pickItems(mode, n) {
    const seenA = new Set(), seenB = new Set();
    const picked = [];
    for (const e of shuffle(pool(mode).slice())) {
      const a = mode.a(e).text, b = mode.b(e).text;
      if (seenA.has(a) || seenB.has(b)) continue;
      seenA.add(a); seenB.add(b);
      picked.push(e);
      if (picked.length === n) break;
    }
    return picked;
  }

  // ---- Menu -----------------------------------------------------------------

  function renderMenu() {
    const modeList = $("mode-list");
    modeList.replaceChildren(
      ...MODES.map((m) =>
        el("label", { className: "mode" }, [
          el("input", { type: "radio", name: "mode", value: m.id, checked: m.id === settings.mode }),
          el("span", { className: "mode-body" }, [
            el("span", { className: "mode-label", textContent: m.label }),
            el("span", { className: "mode-sample", lang: "ja", textContent: m.sample }),
          ]),
        ])
      )
    );

    $("size-list").replaceChildren(
      ...SIZES.map((s) =>
        el("label", { className: "chip" }, [
          el("input", { type: "radio", name: "size", value: s, checked: s === settings.size }),
          el("span", { textContent: `${s} pairs` }),
        ])
      )
    );

    renderFilters();
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
    const n = countUnique(mode, pool(mode));
    const pairs = Math.min(n, settings.size);
    $("start").disabled = n < 2;
    $("available").textContent =
      n < 2 ? "Select more content to play." :
      n < settings.size ? `Only ${n} distinct items selected — board will have ${pairs} pairs.` :
      `${n} items available.`;
  }

  function saveSettings() {
    store.set("settings", settings);
  }

  $("mode-list").addEventListener("change", (ev) => {
    settings.mode = ev.target.value;
    saveSettings();
    renderFilters();
  });
  $("size-list").addEventListener("change", (ev) => {
    settings.size = Number(ev.target.value);
    saveSettings();
    updateAvailable();
  });
  $("filter-list").addEventListener("change", () => {
    const source = currentMode().source;
    settings.filters[source] = [...$("filter-list").querySelectorAll("input:checked")].map((i) => i.value);
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

  // ---- Game -----------------------------------------------------------------

  const state = { game: 0, cards: [], open: [], matched: 0, pairs: 0, moves: 0, locked: false, startedAt: 0, timer: 0 };

  function startGame() {
    const mode = currentMode();
    const info = SOURCES[mode.source].info;
    const items = pickItems(mode, settings.size);

    state.game++;
    state.cards = shuffle(
      items.flatMap((e, pairId) => {
        const hint = info(e);
        return [mode.a(e), mode.b(e)].map((f) => ({ ...f, pairId, hint }));
      })
    );
    state.open = [];
    state.matched = 0;
    state.pairs = items.length;
    state.moves = 0;
    state.locked = false;
    stopTimer();
    state.startedAt = 0;

    renderBoard();
    $("hud-mode").textContent = mode.label;
    updateHud();
    $("menu").hidden = true;
    $("game").hidden = false;
  }

  function renderBoard() {
    const board = $("board");
    board.dataset.count = state.cards.length;
    board.replaceChildren(
      ...state.cards.map((c, i) => {
        const len = [...c.text].length;
        const sizeClass = c.jp ? (len <= 1 ? "xl" : len <= 2 ? "lg" : len <= 3 ? "md" : "sm") : (len <= 4 ? "lg" : len <= 8 ? "md" : "sm");
        const btn = el("button", { type: "button", className: "card" }, [
          el("span", { className: "inner" }, [
            el("span", { className: "side back", lang: "ja", textContent: "か" }),
            el("span", { className: `side front kind-${c.kind}` }, [
              el("span", { className: "tag", textContent: c.kind }),
              el("span", { className: `face ${c.jp ? "jp" : "latin"} ${sizeClass}`, lang: c.jp ? "ja" : "en", textContent: c.text }),
              el("span", { className: "hint", lang: "ja", textContent: c.hint }),
            ]),
          ]),
        ]);
        btn.dataset.index = i;
        btn.setAttribute("aria-label", "Hidden card");
        c.node = btn;
        return btn;
      })
    );
  }

  function flip(card, up) {
    card.node.classList.toggle("flipped", up);
    card.node.setAttribute("aria-label", up ? `${card.kind}: ${card.text}` : "Hidden card");
  }

  $("board").addEventListener("click", (ev) => {
    const btn = ev.target.closest(".card");
    if (!btn || state.locked) return;
    const card = state.cards[Number(btn.dataset.index)];
    if (card.matched || state.open.includes(card)) return;

    if (!state.startedAt) startTimer();
    flip(card, true);
    state.open.push(card);
    if (state.open.length < 2) return;

    state.moves++;
    const [a, b] = state.open;
    if (a.pairId === b.pairId) {
      for (const c of state.open) {
        c.matched = true;
        c.node.classList.add("matched");
      }
      state.open = [];
      state.matched++;
      updateHud();
      if (state.matched === state.pairs) win();
    } else {
      state.locked = true;
      a.node.classList.add("miss");
      b.node.classList.add("miss");
      updateHud();
      const game = state.game;
      setTimeout(() => {
        if (game !== state.game) return;
        for (const c of state.open) {
          c.node.classList.remove("miss");
          flip(c, false);
        }
        state.open = [];
        state.locked = false;
      }, MISMATCH_DELAY);
    }
  });

  function elapsed() {
    return state.startedAt ? Math.floor((Date.now() - state.startedAt) / 1000) : 0;
  }
  const fmt = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

  function startTimer() {
    state.startedAt = Date.now();
    state.timer = setInterval(() => ($("hud-time").textContent = fmt(elapsed())), 500);
  }
  function stopTimer() {
    clearInterval(state.timer);
    state.timer = 0;
  }

  function updateHud() {
    $("hud-moves").textContent = state.moves;
    $("hud-pairs").textContent = `${state.matched}/${state.pairs}`;
    $("hud-time").textContent = fmt(elapsed());
  }

  function win() {
    const secs = elapsed();
    stopTimer();
    const key = `best:${settings.mode}:${state.pairs}`;
    const best = store.get(key, null);
    const isBest = !best || state.moves < best.moves || (state.moves === best.moves && secs < best.secs);
    if (isBest) store.set(key, { moves: state.moves, secs });

    $("win-stats").textContent = `${state.pairs} pairs in ${state.moves} moves, ${fmt(secs)}.`;
    $("win-best").textContent = isBest
      ? "New best for this mode and board size!"
      : `Best: ${best.moves} moves, ${fmt(best.secs)}.`;
    setTimeout(() => $("win").showModal(), 500);
  }

  function showMenu() {
    stopTimer();
    $("game").hidden = true;
    $("menu").hidden = false;
  }

  $("start").addEventListener("click", startGame);
  $("restart").addEventListener("click", startGame);
  $("back").addEventListener("click", showMenu);
  $("win-again").addEventListener("click", () => { $("win").close(); startGame(); });
  $("win-menu").addEventListener("click", () => { $("win").close(); showMenu(); });

  renderMenu();
})();
