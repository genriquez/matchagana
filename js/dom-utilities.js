// Generic DOM helpers, exported as ctx.dom:
//
//   $("menu")                                  // document.getElementById
//   el("button", { type: "button", textContent: "OK" }, [child, "text"])
//
// el() assigns props onto the new element (so className, textContent,
// title… work as properties) and appends the children, which may be a single
// node or string, or an array of them.

grab().run((ctx) => {
  const $ = (id) => document.getElementById(id);
  const el = (tag, props = {}, children = []) => {
    const node = Object.assign(document.createElement(tag), props);
    for (const c of [].concat(children)) node.append(c);
    return node;
  };

  ctx.dom = { $, el };
});
