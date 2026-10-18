// grab.js: a tiny dependency loader built on plain <script> tags (no XHR, so
// no CORS issues and it works from file://).
//
// The page loads grab.js and starts the main script:
//
//   <script src="js/grab.js"></script>
//   <script>grab("js/game.js").start(ctx => ctx.game.start());</script>
//
// Each grabbed script declares its dependencies at its top level and puts all
// of its code inside run(). Exports go on the shared ctx object:
//
//   grab("js/data.js").grab("js/draw.js").grab("css/game.css").run(ctx => {
//     ctx.game = { start() { /* uses ctx.data, ctx.draw */ } };
//   });
//
// It works in two phases:
//   1. Loading: start() loads its scripts. Each script's grab(...).run(fn)
//      records its dependencies and callback and loads the files it names.
//      Each file is loaded once, however many scripts grab it.
//   2. Running: once every script has loaded, the run() callbacks are called
//      once, dependencies first, then the start() callback. After that,
//      grab() throws.
//
// Stylesheets (paths ending in .css) just get a <link> added to <head> when
// run() or start() is called. Nothing waits for them, and they aren't part of
// the dependency order. Links are added in the order they're grabbed, so a
// stylesheet that builds on another (e.g. style.css) should be grabbed after
// it or linked in the page.
//
// Rules:
//   - grab(...).run() must be called at the top level of a grabbed script
//     (document.currentScript is null inside callbacks and timers).
//   - start() is called once, from the page.
//   - Callbacks are synchronous, and a script's top-level code can't use
//     other scripts' exports, since nothing has run yet.
//   - A script with no dependencies uses grab().run(fn).
//   - Paths are relative to the page, not to the calling script.
//   - Circular dependencies throw an error naming the script where the loop
//     was found.
(function () {
  const ctx = {};
  const entries = new Map();   // absolute URL -> { deps: [], runs: [] }
  const owners = new Map();    // <script> element -> its entry
  const styles = new Set();    // absolute URLs of stylesheets already linked
  const failed = [];
  let inflight = 0;
  let root = null;
  let ran = false;

  const isStyle = url => new URL(url).pathname.endsWith(".css");

  function loadStyle(url) {
    if (styles.has(url)) return;
    styles.add(url);
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = url;
    document.head.append(link);
  }

  function loadScript(url) {
    if (entries.has(url)) return;
    const entry = { deps: [], runs: [] };
    const script = document.createElement("script");
    script.src = url;
    // load fires after the script has run, so its own grab() calls have
    // already been counted and inflight can't reach 0 too early.
    script.onload = script.onerror = e => {
      if (e.type === "error") failed.push(url);
      if (--inflight === 0) execute();
    };
    entries.set(url, entry);
    owners.set(script, entry);
    inflight++;
    document.head.append(script);
  }

  // Links the stylesheets, loads the scripts and returns the script URLs.
  function load(urls) {
    urls.filter(isStyle).forEach(loadStyle);
    const scripts = urls.filter(url => !isStyle(url));
    scripts.forEach(loadScript);
    return scripts;
  }

  function execute() {
    ran = true;
    if (failed.length) throw new Error("grab: failed to load " + failed.join(", "));
    const state = new Map();   // url -> "visiting" | "done"
    const visit = url => {
      if (state.get(url) === "done") return;
      if (state.get(url) === "visiting") throw new Error("grab: circular dependency at " + url);
      state.set(url, "visiting");
      const entry = entries.get(url);
      entry.deps.forEach(visit);
      entry.runs.forEach(fn => fn(ctx));
      state.set(url, "done");
    };
    root.deps.forEach(visit);
    root.fn(ctx);
  }

  window.grab = function (path) {
    if (ran) throw new Error("grab: no grab() allowed after start() has run");
    const owner = owners.get(document.currentScript);
    const urls = [];
    const chain = {
      grab(p) {
        urls.push(new URL(p, document.baseURI).href);
        return chain;
      },
      run(fn) {
        if (!owner) throw new Error("grab: run() must be called at the top level of a grabbed script");
        owner.deps.push(...load(urls));
        owner.runs.push(fn);
      },
      start(fn) {
        if (owner) throw new Error("grab: start() belongs in the page, not in a grabbed script");
        if (root) throw new Error("grab: start() can only be called once");
        root = { deps: load(urls), fn };
        // Only stylesheets: no script load will call execute().
        if (!inflight) execute();
      },
    };
    // grab() with no path: a script with no dependencies, grab().run(fn).
    return path === undefined ? chain : chain.grab(path);
  };
})();
