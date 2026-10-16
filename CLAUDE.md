# Kana Quiz

A static webpage for learning Japanese: quizzes that match kana, words and kanji to romaji and English. Plain HTML/CSS/vanilla JS with no build step and no dependencies (only the Noto Sans JP font from Google Fonts, with system fonts as fallback). Open `index.html` directly (works from `file://`) or serve the folder from any static host.

## Status (2026-10-16)
- **Never run.** The dev container has no browser, Node or Python, so none of the code has been executed or syntax-checked. The user is expected to test in their own browser; treat bug reports from them as the first real feedback.
- **History:** this started as a flip-card memory game. The user dropped it in favor of the current quiz. No flip-card code remains.

## Files
- `index.html`: three screens toggled with `hidden`: `#menu`, `#quiz`, `#results`. Loads `data.js`, then `game.js`, as classic scripts (not ES modules, so `file://` keeps working).
- `data.js`: all content, as globals.
  - `KANA_GROUPS` + `KANA_ROWS` + `YOON_BASES` build `KANA`: `{ hira, kata, romaji, group }`. Covers the basic rows, the voiced rows (が/ざ/だ/ば/ぱ) and the combined sounds (きゃ etc., group `yoon`).
  - `WORD_THEMES` + `WORDS`: `{ kana, romaji, english, kanji|null, theme }`. About 108 words in 12 themes. Kanji modes only use words that have `kanji`.
  - `KANA_LOOKALIKES`, `KANJI_LOOKALIKES`: strings of characters that are easy to confuse, used to pick tricky wrong options.
- `game.js`: the whole app, in one IIFE (immediately invoked function). Sections, in order:
  1. Helpers: `$`, `el`, `shuffle`, `store` (localStorage under the `kana-quiz:` prefix, wrapped in try/catch), `levenshtein`.
  2. Kana modifier tables (`DAK`, `HAN`, `SMALL`) and `applyModifier`, used by the on-screen keyboard.
  3. Similarity scoring: `kanaSimilarity` (looks alike + sounds alike + romaji edit distance) and `wordSimilarity` (weighted by the mode's `focus`: `reading` | `meaning` | `kanji`).
  4. `MODES`: each has `{ id, group, label, sample, source, type: "choice"|"typing", prompt, answer, scripts|focus }`. Also `LEVELS`, `INPUTS` and `SOURCES` (pool, filter groups, the full-entry text shown after answering, and the similarity function).
  5. Settings (saved in `store` under the `settings` key) and the menu.
  6. The quiz: `startQuiz`, `buildOptions`, `renderQuestion`, timer (requestAnimationFrame countdown), `answer`, `next`, and key handling.
  7. On-screen kana keyboard.
  8. Results screen and saved best scores.
- `style.css`: color tokens with a dark version via `prefers-color-scheme`. Text on the prompt and options is sized with container query units (`cqw`) and capped with `min(…, rem)`.

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
- **Best scores** are saved per mode + level (+ input method for typing modes) under keys like `best:<mode>:<level>[:<input>]`. Hidden-options rounds add `:hidden` to the key.

## User preferences (from past sessions)
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
