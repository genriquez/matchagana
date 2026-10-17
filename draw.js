// Handwriting input for Matchagana: a drawing pad, and a matcher that scores a
// drawing against a known character. Only the finished shape is compared, so
// stroke order and stroke count don't matter.
//
// Matching: both the drawing and the reference glyph (rendered with the page's
// Japanese font) are scaled to fit the same 64×64 grid, then compared with a
// two-way chamfer distance: how far each inked pixel is from the other image's
// nearest ink. Comparing against the *nearest* ink makes it tolerant of line
// thickness differences between a finger and the font.
// On easier levels each stroke may first be shifted a few grid px on its own
// toward where it fits the glyph best (see bestOffsets), forgiving misplaced strokes.

const Draw = (() => {
  const GRID = 64;
  const FIT = 0.75;       // share of the grid the character's longer side fills
  const LINE = 3;         // stroke width (grid px) when rasterizing a drawing
  const MAX_DIST = 6;     // mean distance (grid px) that scores 0
  const MAX_INK_RATIO = 2; // drawings with much more ink than the glyph (scribbles) are penalized
  const JP_FONT = '"Noto Sans JP", "Hiragino Sans", "Hiragino Kaku Gothic ProN", "Yu Gothic", "Meiryo", sans-serif';
  const REF_COLOR = "rgb(200, 64, 47)";

  // ---- Drawing pad -----------------------------------------------------------

  function createPad(canvas) {
    const ctx = canvas.getContext("2d");
    let strokes = [];
    let current = null;

    const lineWidth = () => Math.max(6, canvas.clientWidth / 26);

    function resize() {
      const dpr = window.devicePixelRatio || 1;
      const w = canvas.clientWidth, h = canvas.clientHeight;
      if (!w || !h) return;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      redraw();
    }

    function strokeStyle() {
      ctx.strokeStyle = getComputedStyle(canvas).color;
      ctx.lineWidth = lineWidth();
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
    }

    function redraw() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      strokeStyle();
      for (const s of strokes) tracePath(ctx, s.map(([x, y]) => [x, y]));
    }

    const point = (ev) => {
      const r = canvas.getBoundingClientRect();
      return [ev.clientX - r.left, ev.clientY - r.top];
    };

    canvas.addEventListener("pointerdown", (ev) => {
      if (canvas.dataset.disabled) return;
      ev.preventDefault();
      canvas.setPointerCapture(ev.pointerId);
      current = [point(ev)];
      strokes.push(current);
      strokeStyle();
      tracePath(ctx, current);
    });
    canvas.addEventListener("pointermove", (ev) => {
      if (!current) return;
      const p = point(ev);
      const last = current[current.length - 1];
      current.push(p);
      strokeStyle();
      ctx.beginPath();
      ctx.moveTo(last[0], last[1]);
      ctx.lineTo(p[0], p[1]);
      ctx.stroke();
    });
    const end = () => { current = null; };
    canvas.addEventListener("pointerup", end);
    canvas.addEventListener("pointercancel", end);
    window.addEventListener("resize", resize);

    return {
      resize,
      get strokes() { return strokes; },
      isEmpty: () => strokes.length === 0,
      undo() { strokes.pop(); redraw(); },
      clear() { strokes = []; current = null; redraw(); },
      setDisabled(off) {
        if (off) canvas.dataset.disabled = "1";
        else delete canvas.dataset.disabled;
      },
    };
  }

  function tracePath(ctx, pts) {
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    if (pts.length === 1) ctx.lineTo(pts[0][0] + 0.1, pts[0][1]);
    for (const [x, y] of pts.slice(1)) ctx.lineTo(x, y);
    ctx.stroke();
  }

  // Strokes rescaled so their bounding box fits FIT of an S×S square, centered.
  function fitStrokes(strokes, S) {
    const pts = strokes.flat();
    const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
    const minX = Math.min(...xs), minY = Math.min(...ys);
    const w = Math.max(...xs) - minX, h = Math.max(...ys) - minY;
    const scale = (S * FIT) / Math.max(w, h, 1);
    const ox = (S - w * scale) / 2, oy = (S - h * scale) / 2;
    return strokes.map((s) => s.map(([x, y]) => [ox + (x - minX) * scale, oy + (y - minY) * scale]));
  }

  // Trace already-positioned strokes, each optionally moved by offsets[i] = [dx, dy].
  function traceStrokes(ctx, strokes, lineWidth, color, offsets = null) {
    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    strokes.forEach((s, i) => {
      const [dx, dy] = offsets ? offsets[i] : [0, 0];
      tracePath(ctx, s.map(([x, y]) => [x + dx, y + dy]));
    });
  }

  function drawStrokesFitted(ctx, strokes, S, lineWidth, color) {
    if (!strokes.flat().length) return;
    traceStrokes(ctx, fitStrokes(strokes, S), lineWidth, color);
  }

  // ---- Reference glyphs ------------------------------------------------------

  const glyphCache = new Map();
  const gridCache = new Map();

  async function ensureFont(text) {
    try {
      await document.fonts.load(`200px ${JP_FONT}`, text);
    } catch {}
  }

  // Render a character large and find its inked bounding box.
  function glyphBox(ch) {
    if (glyphCache.has(ch)) return glyphCache.get(ch);
    const size = 256;
    const c = document.createElement("canvas");
    c.width = c.height = size;
    const g = c.getContext("2d", { willReadFrequently: true });
    g.fillStyle = REF_COLOR;
    g.font = `400 200px ${JP_FONT}`;
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText(ch, size / 2, size / 2);
    const data = g.getImageData(0, 0, size, size).data;
    let minX = size, minY = size, maxX = -1, maxY = -1;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        if (data[(y * size + x) * 4 + 3] > 64) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }
    const box = maxX < 0 ? null : { canvas: c, x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
    glyphCache.set(ch, box);
    return box;
  }

  function drawGlyphFitted(ctx, ch, S) {
    const b = glyphBox(ch);
    if (!b) return;
    const scale = (S * FIT) / Math.max(b.w, b.h);
    const w = b.w * scale, h = b.h * scale;
    ctx.drawImage(b.canvas, b.x, b.y, b.w, b.h, (S - w) / 2, (S - h) / 2, w, h);
  }

  // ---- Rasterize + compare ---------------------------------------------------

  function rasterize(paint) {
    const c = document.createElement("canvas");
    c.width = c.height = GRID;
    const g = c.getContext("2d", { willReadFrequently: true });
    paint(g);
    const data = g.getImageData(0, 0, GRID, GRID).data;
    const bin = new Uint8Array(GRID * GRID);
    let ink = 0;
    for (let i = 0; i < bin.length; i++) {
      if (data[i * 4 + 3] > 64) {
        bin[i] = 1;
        ink++;
      }
    }
    return { bin, ink };
  }

  const refGrid = (ch) => {
    if (!gridCache.has(ch)) gridCache.set(ch, rasterize((g) => drawGlyphFitted(g, ch, GRID)));
    return gridCache.get(ch);
  };

  // Chamfer (3-4) distance transform: distance from every cell to the nearest ink, ×3.
  function distanceMap(bin) {
    const N = GRID, INF = 1e9;
    const d = new Float32Array(N * N);
    for (let i = 0; i < d.length; i++) d[i] = bin[i] ? 0 : INF;
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
        const i = y * N + x;
        let v = d[i];
        if (x > 0) v = Math.min(v, d[i - 1] + 3);
        if (y > 0) {
          v = Math.min(v, d[i - N] + 3);
          if (x > 0) v = Math.min(v, d[i - N - 1] + 4);
          if (x < N - 1) v = Math.min(v, d[i - N + 1] + 4);
        }
        d[i] = v;
      }
    }
    for (let y = N - 1; y >= 0; y--) {
      for (let x = N - 1; x >= 0; x--) {
        const i = y * N + x;
        let v = d[i];
        if (x < N - 1) v = Math.min(v, d[i + 1] + 3);
        if (y < N - 1) {
          v = Math.min(v, d[i + N] + 3);
          if (x < N - 1) v = Math.min(v, d[i + N + 1] + 4);
          if (x > 0) v = Math.min(v, d[i + N - 1] + 4);
        }
        d[i] = v;
      }
    }
    return d;
  }

  function meanDistance(fromBin, toMap) {
    let sum = 0, n = 0;
    for (let i = 0; i < fromBin.length; i++) {
      if (fromBin[i]) {
        sum += toMap[i];
        n++;
      }
    }
    return n ? sum / n / 3 : Infinity;
  }

  const userGridCache = new WeakMap();
  function userGrid(strokes) {
    if (!userGridCache.has(strokes)) {
      userGridCache.set(strokes, rasterize((g) => drawStrokesFitted(g, strokes, GRID, LINE, "#000")));
    }
    return userGridCache.get(strokes);
  }

  const refMapCache = new Map();
  const refMap = (ch) => {
    if (!refMapCache.has(ch)) refMapCache.set(ch, distanceMap(refGrid(ch).bin));
    return refMapCache.get(ch);
  };

  // For each stroke on its own, find the shift (up to maxShift grid px each way)
  // that brings its ink closest to the reference glyph. Small shifts are
  // preferred when the fit is about equal, so tidy drawings stay put.
  function bestOffsets(gridStrokes, map, maxShift) {
    const step = maxShift > 3 ? 2 : 1;
    const OUTSIDE = 30;
    return gridStrokes.map((s) => {
      const { bin } = rasterize((g) => traceStrokes(g, [s], LINE, "#000"));
      const xs = [], ys = [];
      for (let i = 0; i < bin.length; i++) {
        if (bin[i]) {
          xs.push(i % GRID);
          ys.push((i / GRID) | 0);
        }
      }
      if (!xs.length) return [0, 0];
      const cost = (dx, dy) => {
        let sum = 0;
        for (let k = 0; k < xs.length; k++) {
          const x = xs[k] + dx, y = ys[k] + dy;
          sum += x < 0 || y < 0 || x >= GRID || y >= GRID ? OUTSIDE : map[y * GRID + x] / 3;
        }
        return sum / xs.length + (Math.abs(dx) + Math.abs(dy)) * 0.02;
      };
      let best = [0, 0], bestCost = cost(0, 0);
      for (let dy = -maxShift; dy <= maxShift; dy += step) {
        for (let dx = -maxShift; dx <= maxShift; dx += step) {
          const c = cost(dx, dy);
          if (c < bestCost) {
            bestCost = c;
            best = [dx, dy];
          }
        }
      }
      return best;
    });
  }

  // Score 0–1 for how well `strokes` match character `ch`. With maxShift > 0,
  // each stroke may first be nudged up to that many grid px (of 64) toward
  // where it fits best, which forgives slightly misplaced strokes.
  async function match(strokes, ch, maxShift = 0) {
    if (!strokes || !strokes.length) return 0;
    await ensureFont(ch);
    const ref = refGrid(ch);
    if (!ref.ink) return 0; // glyph couldn't be rendered (no Japanese font)
    let user;
    if (maxShift > 0) {
      const gridStrokes = fitStrokes(strokes, GRID);
      const offsets = bestOffsets(gridStrokes, refMap(ch), maxShift);
      user = rasterize((g) => traceStrokes(g, gridStrokes, LINE, "#000", offsets));
    } else {
      user = userGrid(strokes);
    }
    if (!user.ink) return 0;
    const userToRef = meanDistance(user.bin, refMap(ch));
    const refToUser = meanDistance(ref.bin, distanceMap(user.bin));
    let score = Math.min(1, Math.max(0, 1 - Math.max(userToRef, refToUser) / MAX_DIST));
    const inkRatio = user.ink / ref.ink;
    if (inkRatio > MAX_INK_RATIO) score *= MAX_INK_RATIO / inkRatio;
    return score;
  }

  // A small canvas showing the drawing, optionally over a faint reference glyph,
  // both fitted the same way the matcher sees them.
  function thumbnail(strokes, ch = null, size = 56) {
    const c = document.createElement("canvas");
    const dpr = window.devicePixelRatio || 1;
    c.width = c.height = Math.round(size * dpr);
    c.style.width = c.style.height = size + "px";
    c.className = "draw-thumb";
    const g = c.getContext("2d");
    g.scale(dpr, dpr);
    if (ch) {
      g.globalAlpha = 0.35;
      drawGlyphFitted(g, ch, size);
      g.globalAlpha = 1;
    }
    const color = getComputedStyle(document.body).color;
    drawStrokesFitted(g, strokes, size, Math.max(2, size / 22), color);
    return c;
  }

  return { createPad, match, thumbnail, ensureFont };
})();
