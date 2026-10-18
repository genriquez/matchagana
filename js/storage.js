// localStorage with a key prefix and JSON values, exported as ctx.storage:
//
//   const store = ctx.storage.createStore("matchagana:");
//   store.get("settings", {});   // the fallback is returned if missing or unreadable
//   store.set("settings", value);
//
// Every access is wrapped in try/catch, since localStorage can be missing or
// throw (private windows, blocked site data, full quota). Failed writes are
// silently dropped.

grab().run((ctx) => {
  function createStore(prefix) {
    return {
      get(key, fallback) {
        try {
          const v = localStorage.getItem(prefix + key);
          return v == null ? fallback : JSON.parse(v);
        } catch {
          return fallback;
        }
      },
      set(key, value) {
        try {
          localStorage.setItem(prefix + key, JSON.stringify(value));
        } catch {}
      },
    };
  }

  ctx.storage = { createStore };
});
