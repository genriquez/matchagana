# Matchagana

Also written Match-a-gana: a play on "match" + "kana" (hiragana/katakana) and the Japanese word matcha (抹茶). Use the name Matchagana throughout the code, page and docs.

A static webpage for learning Japanese: quizzes that match kana, words and kanji to romaji and English. Plain HTML/CSS/vanilla JS with no build step and no dependencies (only the Noto Sans JP font from Google Fonts, with system fonts as fallback). Open `index.html` directly (works from `file://`) or serve the folder from any static host.

## Status (2026-10-16)
- **Never run.** The dev container has no browser, Node or Python, so none of the code has been executed or syntax-checked. The user is expected to test in their own browser; treat bug reports from them as the first real feedback.
- **History:** this started as a flip-card memory game. The user dropped it in favor of the current quiz. No flip-card code remains.

## Files
- `index.html`: three screens toggled with `hidden`: `#menu`, `#quiz`, `#results`. Links `style.css` and loads only `js/grab.js`, then calls `grab("game.js").start((ctx) => ctx.game.start())`; every other script and stylesheet is loaded through grab. All scripts are classic scripts (not ES modules, so `file://` keeps working).
- `data.js`: all content, exported as `ctx.data` (`KANA_GROUPS`, `KANA`, `WORD_THEMES`, `WORDS`, `KANA_LOOKALIKES`, `KANJI_LOOKALIKES`). No dependencies (`grab().run(…)`).
  - `KANA_GROUPS` + `KANA_ROWS` + `YOON_BASES` build `KANA`: `{ hira, kata, romaji, group }`. Covers the basic rows, the voiced rows (が/ざ/だ/ば/ぱ) and the combined sounds (きゃ etc., group `yoon`).
  - `WORD_THEMES` + `WORDS`: `{ kana, romaji, english, kanji|null, theme }`. About 108 words in 12 themes. Kanji modes only use words that have `kanji`.
  - `KANA_LOOKALIKES`, `KANJI_LOOKALIKES`: strings of characters that are easy to confuse, used to pick tricky wrong options.
- `draw.js`: handwriting support, exported as `ctx.draw` (no dependencies): `createPad(canvas)` (records strokes with pointer events), `match(strokes, ch)` (0–1 shape score) and `thumbnail(strokes, ch?, size)`. No recognizer and no library: the drawing and the expected character, drawn in the page font, are both scaled to fit a 64×64 grid and compared with a two-way chamfer distance (how far each inked pixel is from the other image's nearest ink). Drawings with far more ink than the character (scribbles) are penalized. Tuning constants (`MAX_DIST`, `LINE`, `MAX_INK_RATIO`) are at the top of the file.
- `game.js`: the whole app, in one `grab(…).run(ctx => …)` callback that grabs `data.js`, `js/dom-utilities.js`, `js/utilities.js`, `js/storage.js`, `draw.js` and `js/keyboard.js`. It starts by taking the names it uses from `ctx` (`KANA`, `WORDS`, …, `$`, `el`, `shuffle`, …, `Draw`, `Keyboard`) and creating `store` (`createStore("matchagana:")`), and ends by exporting `ctx.game = { start }` (renders the menu). Sections, in order:
  1. (Helpers moved out: DOM helpers to `js/dom-utilities.js`, generic ones to `js/utilities.js`, localStorage to `js/storage.js`.)
  2. Kana modifier tables (`DAK`, `HAN`, `SMALL`) and `applyModifier`, passed to the on-screen keyboard as its `modify` function; the tables are also used by the similarity code.
  3. Similarity scoring: `kanaSimilarity` (looks alike + sounds alike + romaji edit distance) and `wordSimilarity` (weighted by the mode's `focus`: `reading` | `meaning` | `kanji`).
  4. `MODES`: each has `{ id, group, label, sample, source, type: "choice"|"typing", prompt, answer, scripts|focus }`. Also `LEVELS`, `INPUTS` and `SOURCES` (pool, filter groups, the full-entry text shown after answering, and the similarity function).
  5. Settings (saved in `store` under the `settings` key) and the menu.
  6. The quiz: `startQuiz`, `buildOptions`, `renderQuestion`, timer (requestAnimationFrame countdown), `answer`, `next`, and key handling.
  7. Creates the on-screen kana keyboard (`Keyboard.create`, see `js/keyboard.js`).
  8. Results screen and saved best scores.
- `js/dom-utilities.js`: generic DOM helpers, exported as `ctx.dom` (no dependencies): `$(id)` (`getElementById`) and `el(tag, props, children)` (creates an element, assigns `props` onto it, appends the children). Generic helpers go here; anything that knows about this page's elements stays in its component.
- `js/utilities.js`: generic helpers with no knowledge of the app, exported as `ctx.utils` (no dependencies): `shuffle` (in place), `levenshtein`, `groupLookup(groups)` (returns a "do a and b share a group?" check, used for the lookalike lists), `fmtSecs(ms)` and `pct(score)`.
- `js/storage.js`: `ctx.storage.createStore(prefix)` returns `{ get(key, fallback), set(key, value) }` over localStorage with JSON values, every access wrapped in try/catch. `game.js` uses the `matchagana:` prefix.
- `js/keyboard.js`: on-screen hiragana keyboard, exported as `ctx.keyboard` (same pattern as `ctx.draw`); grabs `data.js`, `js/dom-utilities.js` and `css/keyboard.css`. `ctx.keyboard.create(container, { input, modify, onEnter })` builds the keys once and returns `{ enable, disable, edit }`; it writes into `input`, and the modifier keys call `modify(kind, ch)` on the last character. It keeps its own disabled flag instead of reading quiz state. Reads `ctx.data.KANA` for the romaji key titles.
- `js/grab.js`: small dependency loader using plain `<script>` tags (global `grab`). The page calls `grab("js/x.js").start(fn)` once; each grabbed script calls `grab(...).grab(...).run(ctx => …)` at its top level and exports on the shared `ctx`. All files load first (deduplicated by URL), then the `run` callbacks are called in dependency order, then the `start` callback; after that `grab()` throws. Paths ending in `.css` just get a `<link>` added to `<head>` (deduplicated, in grab order, not waited for and not part of the dependency order). Uses `document.currentScript` to know which script called `run`. Usage and rules are in the header comment. Paths are relative to the page. `grab()` with no path is for scripts with no dependencies.
- `style.css`: color tokens with a dark version via `prefers-color-scheme`. Text on the prompt and options is sized with container query units (`cqw`) and capped with `min(…, rem)`.
- `css/keyboard.css`: styles for the on-screen keyboard (`.keyboard`, `.kb-*`), including its reduced-motion override. Grabbed by `js/keyboard.js`, so its `<link>` is added after the page's `style.css`, which matters since it relies on the tokens and base button styles there. A first test of splitting the CSS by component; the rest stays in `style.css` for now.

## How the quiz works
- **Rounds:** 20 questions (`QUESTIONS_PER_ROUND`), drawn without repeats. If the pool has fewer than 20 items it is reshuffled and reused.
- **Difficulty (`LEVELS`):** each level sets the number of options (4/6/9/12), the time limit for multiple choice and for typing, and `share`, the fraction of wrong options taken from the most similar items.
- **Never two correct options:** `buildOptions` drops any item with the same prompt text as the question (e.g. はな = nose and flower, じ/ぢ = "ji") and any option whose answer text is already shown.
- **Checking typed answers:** `acceptedAnswers` accepts the answer of every pool item that shares the prompt text.
  - Romaji answers are normalized: lowercase, spaces/hyphens/apostrophes removed, macrons expanded (ō → ou, ū → uu, ā → aa).
  - Kana answers must match exactly.
- **Typing modes** answer with `settings.input`: `"kana"` (read-only field filled by the on-screen keyboard) or `"romaji"` (plain text field).
- **Wrong answers** show what the player answered, written in the other scripts (`describeAnswer`): a picked kana shows its romaji (ツ (tsu)); a picked romaji shows its kana; picked kanji or English show the reading and meaning. Typed kana is converted with `kanaToRomaji` and looked up in `WORDS`, so typing いぬ shows "(inu = 犬 · dog)". The missed list on the results screen shows the same.
- **Hide options** (`settings.hideOptions`, multiple-choice modes only): options stay hidden until the player clicks Show or presses Space or Enter. There is no timer before that; afterwards the timer is the level's shorter `revealTime` (5/6/3.5/2 s, so even Easy gets a time limit). Answer time is still measured from when the question appeared.
- **Options** (menu, any mode): `settings.noTimer` turns off every time limit at every level, including the reveal and drawing timers (`startTimer` treats it as 0 s). `settings.holdCorrect` (writing modes only) stays on correct drawings until Next is pressed, instead of moving on after `CORRECT_DELAY_DRAW`.
- **Best scores** are saved per mode + level (+ input method for typing modes) under keys like `best:<mode>:<level>[:<input>]`. Hidden-options rounds add `:hidden` to the key. Untimed rounds add `:untimed`.

- **Writing modes** (`type: "draw"`; romaji → write hiragana or katakana, English or reading → write kanji): one canvas, with Next character (Space) to save a character and Check (Enter) to judge. The answer length isn't revealed. Every character must reach the level's `drawPass` score (0.50/0.58/0.65/0.72); on Hard and Expert (`drawStrict`) it must also score higher against the correct character than against its lookalikes and its voiced/unvoiced twins (`lookalikesOf`). On Easy and Medium, `drawShift` (6 and 3 grid px out of 64) lets each stroke be shifted on its own toward its best fit before scoring (`bestOffsets` in `draw.js`); Hard and Expert use 0. The timer is `typeTime` × answer length. After answering, the correct answer appears in a box the same size as the pad, right beside it (`#draw-answer`; it stacks below on narrow screens). Feedback shows each drawing over the faint correct character with its match percentage. **The thresholds are untested guesses and will likely need tuning.** Matching needs a Japanese font (Noto Sans JP from Google Fonts, or a system one); offline without one, the expected characters can't be drawn and every answer fails.

## User preferences (from past sessions)
- Handwriting only checks the drawing against the known answer (no recognition), and stroke order doesn't matter; only the finished shape is judged. For multi-character answers, use one canvas with "Next character" rather than one box per character, so the length isn't given away.
- Text on the prompt and options should be **very large**. The user asked for "way bigger" once already.
- Romaji answers use a plain text field. **No automatic romaji-to-kana conversion** for now: the user said "no need to autoconvert for now".
- The menu is free choice: no unlocking or forced progression.
- Romaji spells long vowels out (`kyou`, `satou`) instead of using macrons.

## Adding content
- **Words:** add a row to `WORDS` in `data.js` (`[kana, romaji, english, kanji|null, theme]`). A new theme also needs an entry in `WORD_THEMES`. The menu picks both up automatically.
- **Modes:** add an entry to `MODES`. Multiple-choice modes need `prompt`/`answer` built from the `F` helpers; kana modes need `scripts`, word/kanji modes need `focus`.
- **Lookalikes:** append character groups to `KANA_LOOKALIKES` / `KANJI_LOOKALIKES`.

## Possible next steps (not requested yet)
- Automatic romaji-to-kana conversion in the text field.
- A katakana on-screen keyboard and katakana word modes (`DAK`/`HAN` already include katakana).
- More words and kanji. A review mode built from the missed items.
