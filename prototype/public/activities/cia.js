ACTIVITIES.cia = {
  render(ctx) {
    const { pillars, cards } = ctx.data.questions;
    const order = cards.slice().sort(() => Math.random() - 0.5);
    const place = {}, verdict = {};
    let selected = null, locked = false, result = null;
    const root = ctx.root;
    const colors = { C: "var(--c)", I: "var(--i)", A: "var(--a)" };

    function collect() {
      const p = {};
      for (const id of Object.keys(place)) p[id] = { pillar: place[id], helps: verdict[id] === undefined ? null : verdict[id] };
      return { placements: p };
    }

    function cardEl(c) {
      const placed = place[c.id];
      const fb = result && result.feedback.find(f => f.id === c.id);
      const el = h("div", { class: "card" + (selected === c.id ? " sel" : "") + (fb ? (fb.okPillar && fb.okHelps ? " ok" : " no") : ""), draggable: !locked });
      el.addEventListener("dragstart", e => { e.dataTransfer.setData("text/plain", c.id); });
      const pick = h("div", { class: "pick", role: "button", tabindex: locked ? null : "0", "aria-pressed": selected === c.id ? "true" : "false" }, c.text);
      const toggle = () => { if (locked) return; selected = selected === c.id ? null : c.id; draw(); const n = root.querySelector('[data-id="' + c.id + '"] .pick'); if (n) n.focus(); };
      pick.addEventListener("click", toggle);
      pick.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggle(); } });
      el.dataset.id = c.id;
      el.append(pick);
      if (placed) {
        const seg = h("div", { class: "seg", role: "group", "aria-label": "Helps or harms " + pillars[placed].name },
          [[true, "help", "Helps " + pillars[placed].name], [false, "harm", "Harms " + pillars[placed].name]].map(([val, cls, label]) =>
            h("button", { type: "button", class: cls, disabled: locked, "aria-pressed": verdict[c.id] === val ? "true" : "false", onclick: () => { verdict[c.id] = val; draw(); } }, label)));
        el.append(seg);
      }
      if (fb) {
        el.append(h("div", { class: "fb" },
          h("b", { class: fb.okPillar && fb.okHelps ? "ok" : "no" }, fb.okPillar && fb.okHelps ? "Correct. " : "Check this one. "),
          !fb.okPillar ? "Belongs under " + pillars[fb.pillar].name + ". " : "",
          !fb.okHelps ? "It " + (fb.helps ? "helps" : "harms") + " " + pillars[fb.pillar].name + ". " : "",
          fb.why));
      }
      return el;
    }

    function drop(node, bay) {
      node.addEventListener("dragover", e => { if (!locked) { e.preventDefault(); node.classList.add("over"); } });
      node.addEventListener("dragleave", () => node.classList.remove("over"));
      node.addEventListener("drop", e => { e.preventDefault(); node.classList.remove("over"); put(e.dataTransfer.getData("text/plain"), bay); });
      node.addEventListener("click", e => { if (selected && !e.target.closest(".card")) put(selected, bay); });
    }
    function put(id, bay) {
      if (locked || !order.find(c => c.id === id)) return;
      if (bay) place[id] = bay; else { delete place[id]; delete verdict[id]; }
      selected = null; draw();
    }

    function draw() {
      const loose = order.filter(c => !place[c.id]);
      const pool = h("div", { class: "pool" }, loose.length ? loose.map(cardEl) : h("span", { class: "muted small" }, "All cards placed."));
      drop(pool, null);
      const bays = h("div", { class: "bays" }, Object.keys(pillars).map(k => {
        const mine = order.filter(c => place[c.id] === k);
        const b = h("div", { class: "bay" + (selected ? " target" : ""), style: "--col:" + colors[k] },
          h("h3", {}, pillars[k].name), h("p", { class: "d" }, pillars[k].def),
          selected && !locked ? h("button", { type: "button", class: "btn alt place", style: "margin-bottom:8px", onclick: () => put(selected, k) }, "Place selected card here") : null,
          mine.map(cardEl));
        drop(b, k);
        return b;
      }));
      const placedN = Object.keys(place).length, judgedN = Object.keys(verdict).filter(id => place[id]).length;
      const btn = h("button", { class: "btn", disabled: locked || placedN < 15 || judgedN < 15, onclick: submit }, "Submit");
      fill(root, 
        result ? resultBar(ctx, result, result.auto) : null,
        locked ? null : h("p", { class: "muted small" }, "Drag each card into a bay, or tap a card and then tap a bay. Then choose whether the action helps or harms that pillar."),
        h("p", { class: "small" }, "Placed " + placedN + " of 15. Judged " + judgedN + " of 15."),
        pool, bays,
        locked ? null : h("p", { style: "margin-top:16px" }, btn));
    }

    async function submit() {
      try { result = await ctx.submit(collect()); locked = true; selected = null; draw(); }
      catch (e) { root.prepend(h("div", { class: "err" }, e.message)); }
    }
    draw();
    return {
      collect,
      showResult(r, auto) { result = { ...r, auto }; locked = true; selected = null; draw(); }
    };
  }
};
