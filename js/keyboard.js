// On-screen hiragana keyboard for Matchagana's typing modes. Writes into a
// text input; the modifier keys (゛ ゜ 小) change the last character typed.
//
//   const kb = ctx.keyboard.create(container, { input, modify, onEnter });
//   kb.enable();       // after a new question
//   kb.disable();      // after answering
//   kb.edit("back");   // e.g. from a physical Backspace key
//
// modify(kind, ch) returns ch changed by "dak" | "han" | "small", or null.
// Key titles show each kana's romaji, taken from ctx.data.KANA.

grab("data.js").grab("css/keyboard.css").run((ctx) => {
  const ROWS = [
    "あいうえお", "かきくけこ", "さしすせそ", "たちつてと", "なにぬねの",
    "はひふへほ", "まみむめも", "や ゆ よ", "らりるれろ", "わ を ん",
  ];
  const MODS = [
    ["dak", "゛", "Dakuten: か→が"],
    ["han", "゜", "Handakuten: は→ぱ"],
    ["small", "小", "Small kana: つ→っ, や→ゃ"],
    ["ー", "ー", "Long vowel mark"],
    ["back", "⌫", "Backspace"],
    ["clear", "Clear", "Clear"],
  ];

  const el = (tag, props = {}, children = []) => {
    const node = Object.assign(document.createElement(tag), props);
    for (const c of [].concat(children)) node.append(c);
    return node;
  };

  function create(container, { input, modify, onEnter }) {
    const romajiOf = new Map(ctx.data.KANA.map((k) => [k.hira, k.romaji]));
    let disabled = false;

    const grid = el("div", { className: "kb-grid" });
    for (const row of ROWS) {
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
    const mods = el("div", { className: "kb-mods" }, MODS.map(([action, label, title]) => {
      const b = el("button", { type: "button", className: "kb-key kb-mod", lang: "ja", textContent: label, title });
      b.dataset.action = action;
      return b;
    }));
    const enter = el("button", { type: "button", className: "kb-key kb-enter primary", textContent: "Check ⏎" });
    enter.dataset.action = "enter";
    mods.append(enter);
    container.replaceChildren(grid, mods);

    function edit(action, ch) {
      const chars = [...input.value];
      if (ch) chars.push(ch);
      else if (action === "back") chars.pop();
      else if (action === "clear") chars.length = 0;
      else if (action === "ー") chars.push("ー");
      else if (chars.length) {
        const changed = modify(action, chars.at(-1));
        if (changed) chars[chars.length - 1] = changed;
      }
      input.value = chars.join("");
    }

    function setDisabled(on) {
      disabled = on;
      container.querySelectorAll("button").forEach((b) => (b.disabled = on));
    }

    container.addEventListener("click", (ev) => {
      const b = ev.target.closest("button");
      if (!b || disabled) return;
      if (b.dataset.action === "enter") onEnter();
      else edit(b.dataset.action, b.dataset.ch);
    });

    return {
      edit,
      enable: () => setDisabled(false),
      disable: () => setDisabled(true),
    };
  }

  ctx.keyboard = { create };
});
