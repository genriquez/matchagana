// Generic helpers with no knowledge of the app, exported as ctx.utils:
//
//   shuffle(arr)          // shuffles arr in place (Fisher-Yates) and returns it
//   levenshtein(a, b)     // edit distance between two strings
//   groupLookup(groups)   // returns (a, b) => true if a and b share a group;
//                         // groups is a list of iterables, e.g. ["シツ", "ソン"]
//   fmtSecs(ms)           // 1234 → "1.2 s"
//   pct(score)            // 0.734 → "73%"

grab().run((ctx) => {
  const shuffle = (arr) => {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
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

  const fmtSecs = (ms) => (ms / 1000).toFixed(1) + " s";
  const pct = (score) => `${Math.round(score * 100)}%`;

  ctx.utils = { shuffle, levenshtein, groupLookup, fmtSecs, pct };
});
