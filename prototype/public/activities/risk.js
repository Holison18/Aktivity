ACTIVITIES.risk = {
  render(ctx) {
    const threats = ctx.data.questions.threats;
    const root = ctx.root;
    const rating = {}; // id -> {habit, L, I}
    let choice = "", justification = "", locked = false, result = null;
    threats.forEach(t => (rating[t.id] = { habit: "", L: "", I: "" }));

    const band = r => (r <= 4 ? "Low" : r <= 9 ? "Moderate" : r <= 15 ? "High" : "Critical");
    const bandCls = r => (r <= 4 ? "lowc" : r <= 9 ? "modc" : r <= 15 ? "highc" : "critc");
    const riskOf = id => (rating[id].L && rating[id].I ? Number(rating[id].L) * Number(rating[id].I) : null);
    const words = s => s.trim().split(/\s+/).filter(Boolean).length;

    function collect() {
      const ratings = {};
      for (const t of threats) {
        const x = rating[t.id];
        ratings[t.id] = { habit: x.habit, L: Number(x.L) || null, I: Number(x.I) || null };
      }
      return { ratings, choice, justification };
    }

    function select(options, value, onchange, label, disabled) {
      const s = h("select", { "aria-label": label, disabled }, h("option", { value: "" }, "Choose"),
        options.map(o => h("option", { value: o[0], selected: String(o[0]) === String(value) }, o[1])));
      s.addEventListener("change", () => onchange(s.value));
      return s;
    }

    function matrix() {
      const cell = (L, I) => {
        const ids = threats.map((t, n) => [t, n + 1]).filter(([t]) => riskOf(t.id) !== null && Number(rating[t.id].L) === L && Number(rating[t.id].I) === I).map(([, n]) => n);
        return h("td", { class: bandCls(L * I) }, ids.join(", "));
      };
      const rows = [5, 4, 3, 2, 1].map(L => h("tr", {}, h("th", {}, "L" + L), [1, 2, 3, 4, 5].map(I => cell(L, I))));
      return h("div", { class: "overflow" }, h("table", { class: "matrix" },
        rows, h("tr", {}, h("th", {}, ""), [1, 2, 3, 4, 5].map(i => h("th", {}, "I" + i)))));
    }

    function draw() {
      const complete = threats.every(t => rating[t.id].habit && rating[t.id].L && rating[t.id].I);
      const canSubmit = !locked && complete && choice && words(justification) >= 15;
      const fbTop = result && result.feedback.top3;
      fill(root, 
        result ? resultBar(ctx, result, result.auto) : null,
        result ? h("div", { class: "notice small" },
          h("div", {}, "Your top risks: " + (fbTop.length ? fbTop.map(x => x.threat + " (" + x.risk + ")").join("; ") : "none rated")),
          h("div", {}, result.feedback.choiceMatchesTopRisk ? "Your chosen change targets your highest rated risk." : "Your chosen change does not target your highest rated risk."),
          h("div", {}, result.feedback.justificationOk ? "Justification length accepted." : "The justification needs at least 15 words.")) : null,
        locked ? null : h("p", { class: "muted small" }, "For each threat, say how often you do the habit, then rate likelihood this year (1 very unlikely, 5 almost certain) and impact given your own habits (1 minor, 5 severe). Risk is likelihood times impact."),
        threats.map((t, n) => {
          const r = riskOf(t.id);
          return h("div", { class: "threat" },
            h("div", { class: "t" }, (n + 1) + ". " + t.threat),
            h("div", { class: "muted small" }, t.habit),
            h("div", { class: "grid" },
              h("div", {}, h("label", {}, "My habit"), select(["Never", "Sometimes", "Often"].map(x => [x, x]), rating[t.id].habit, v => { rating[t.id].habit = v; draw(); }, "Habit " + (n + 1), locked)),
              h("div", {}, h("label", {}, "Likelihood (1 to 5)"), select([1, 2, 3, 4, 5].map(x => [x, x]), rating[t.id].L, v => { rating[t.id].L = v; draw(); }, "Likelihood " + (n + 1), locked)),
              h("div", {}, h("label", {}, "Impact (1 to 5)"), select([1, 2, 3, 4, 5].map(x => [x, x]), rating[t.id].I, v => { rating[t.id].I = v; draw(); }, "Impact " + (n + 1), locked))),
            r !== null ? h("div", { class: "risk" }, "Risk " + r + " (" + band(r) + ")") : null);
        }),
        h("h2", {}, "Risk matrix"),
        h("p", { class: "muted small" }, "Numbers are the threats above. Rows are likelihood, columns are impact."),
        matrix(),
        h("h2", {}, "Which single change would reduce your total risk the most?"),
        h("div", {}, threats.map(t => h("label", { class: "opt" },
          h("input", { type: "radio", name: "choice", value: t.id, checked: choice === t.id, disabled: locked, onchange: () => { choice = t.id; draw(); } }),
          h("span", {}, t.change)))),
        h("label", { for: "just" }, "Why this change? (at least 15 words, " + words(justification) + " so far)"),
        h("textarea", { id: "just", rows: 4, disabled: locked, oninput: e => { justification = e.target.value; const b = root.querySelector("#sub"); const ok = !locked && threats.every(t => rating[t.id].habit && rating[t.id].L && rating[t.id].I) && choice && words(justification) >= 15; if (b) b.disabled = !ok; root.querySelector("label[for=just]").textContent = "Why this change? (at least 15 words, " + words(justification) + " so far)"; } }, justification),
        locked ? null : h("p", { style: "margin-top:16px" }, h("button", { id: "sub", class: "btn", disabled: !canSubmit, onclick: submit }, "Submit")));
    }

    async function submit() {
      try { result = await ctx.submit(collect()); locked = true; draw(); }
      catch (e) { root.prepend(h("div", { class: "err" }, e.message)); }
    }
    draw();
    return { collect, showResult(r, auto) { result = { ...r, auto }; locked = true; draw(); } };
  }
};
