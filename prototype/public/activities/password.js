ACTIVITIES.password = {
  render(ctx) {
    const { calc, pairs } = ctx.data.questions;
    const root = ctx.root;
    const ans = { calc: {}, pairs: {} };
    let locked = false;
    const feedbackBox = h("div");
    const inputs = [];

    // ---- local calculator: the password never leaves this page ----
    const COMMON = ["password", "passw0rd", "qwerty", "abc123", "letmein", "welcome", "admin", "iloveyou", "monkey", "dragon", "football", "master", "login", "secret", "princess", "sunshine", "shadow", "ghana", "kumasi", "accra", "knust", "kente", "akwaaba", "tema", "takoradi", "tamale", "kofi", "kwame", "ama", "akua", "yaw", "nana", "jesus", "blessed", "god", "january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december", "welcome", "student", "engineer", "petroleum", "oil", "fpso"];
  const WALKS = ["qwerty", "asdf", "zxcv", "qazwsx", "1234", "4321", "0000", "1111", "abcd"];
    const LEET = { "@": "a", "0": "o", "1": "l", "3": "e", "$": "s", "5": "s", "7": "t", "!": "i", "4": "a" };

    function patterns(pw) {
      const found = [];
      const lower = pw.toLowerCase();
      const plain = lower.replace(/[@0134$57!]/g, c => LEET[c] || c);
      if (/(19[5-9]\d|20[0-3]\d)/.test(pw)) found.push("a year");
      if (WALKS.some(w => lower.includes(w))) found.push("a keyboard or number sequence");
      if (/^(.)\1+$/.test(pw)) found.push("a repeated character");
      const hit = COMMON.find(w => w.length >= 3 && (lower.includes(w) || plain.includes(w)));
      if (hit) found.push("a common word or name (" + hit + ")");
      return found;
    }
    function human(sec) {
      if (sec < 1) return "less than a second";
      if (sec < 60) return sec.toFixed(1) + " seconds";
      if (sec < 3600) return (sec / 60).toFixed(1) + " minutes";
      if (sec < 86400) return (sec / 3600).toFixed(1) + " hours";
      if (sec < 31557600) return (sec / 86400).toFixed(1) + " days";
      const y = sec / 31557600;
      if (y < 1e6) return Math.round(y).toLocaleString("en-US") + " years";
      const e = Math.floor(Math.log10(y));
      return (y / Math.pow(10, e)).toFixed(1) + " x 10^" + e + " years";
    }
    const out = h("div");
    const pw = h("input", { id: "pw", type: "text", autocomplete: "off", spellcheck: "false", "aria-label": "Test password" });
    function analyse() {
      const v = pw.value;
      if (!v) { fill(out, h("p", { class: "muted small" }, "Type something to see the numbers.")); return; }
      let N = 0;
      if (/[a-z]/.test(v)) N += 26;
      if (/[A-Z]/.test(v)) N += 26;
      if (/[0-9]/.test(v)) N += 10;
      if (/[^A-Za-z0-9]/.test(v)) N += 32;
      const L = v.length, H = L * Math.log2(N);
      const avg = R => Math.pow(2, H - 1) / R;
      const p = patterns(v);
      fill(out, 
        h("dl", { class: "stat" },
          h("dt", {}, "Length L"), h("dd", {}, String(L)),
          h("dt", {}, "Character pool N"), h("dd", {}, String(N)),
          h("dt", {}, "Entropy H = L x log2(N)"), h("dd", {}, H.toFixed(1) + " bits"),
          h("dt", {}, "Average time, online attack (10^4 per second)"), h("dd", {}, human(avg(1e4))),
          h("dt", {}, "Average time, offline GPU attack (10^10 per second)"), h("dd", {}, human(avg(1e10)))),
        h("div", { class: "meter" }, h("div", { style: "width:" + Math.min(100, (H / 100) * 100) + "%" })),
        p.length ? h("div", { class: "notice" }, "The formula overestimates this password. It contains " + p.join(", ") + ". Attackers guess patterns first. Treat it as weak.") : null);
    }
    pw.addEventListener("input", analyse);
    analyse();

    // ---- graded parts ----
    function numInput(q) {
      const i = h("input", { type: "text", inputmode: "decimal", id: q.id, autocomplete: "off", "aria-label": q.text });
      i.addEventListener("input", () => { ans.calc[q.id] = i.value.replace(",", "."); });
      inputs.push(i);
      return i;
    }
    const calcEls = calc.map((q, n) => h("div", { class: "q", id: "box-" + q.id },
      h("label", { for: q.id }, (n + 1) + ". " + q.text), h("div", { class: "row" }, numInput(q), h("span", { class: "muted small" }, q.unit))));
    const pairEls = pairs.map((p, n) => h("div", { class: "q", id: "box-" + p.id },
      h("div", {}, "Pair " + (n + 1) + ". Which is harder to crack?"),
      p.options.map(o => h("label", { class: "opt" },
        h("input", { type: "radio", name: p.id, value: o.id, onchange: () => { ans.pairs[p.id] = o.id; } }), h("span", {}, o.text)))));

    const submitBtn = h("button", { class: "btn", onclick: submit }, "Submit");
    const resultBox = h("div");

    root.append(
      h("p", {}, "If an attacker must guess a password by trying every combination, its strength depends on the number of possible passwords. A password of length L, each character chosen randomly from N possible characters, has N^L possibilities. We express that in bits of entropy:"),
      h("div", { class: "formula" }, "H = L x log2(N)        t_avg = 2^H / (2R) = N^L / (2R)"),
      h("p", { class: "small" }, "H is entropy in bits. L is length in characters or words. N is the size of the set each is chosen from. R is guesses per second. Offline attacks on stolen password files with graphics cards can reach about 10^10 guesses per second against weak storage. On average the answer is found halfway through, hence the 2."),
      h("p", { class: "small" }, "Every extra bit of entropy doubles the attacker's work. Adding length multiplies the possibilities much faster than adding character types. The formula only holds for randomly chosen passwords. \"Kumasi2026!\" looks complex but is among the first things attackers try, because they guess words, names, years and common patterns first."),
      h("h2", {}, "Try it (not scored)"),
      h("div", { class: "notice small" }, "Do not type a password you really use. Everything is calculated in your browser. Nothing you type here is sent or saved."),
      h("label", { for: "pw" }, "Test password"), pw, out,
      h("h2", {}, "Part 1. Calculations (2 points each)"),
      ...calcEls,
      h("h2", {}, "Part 2. Which is harder to crack? (1 point each)"),
      ...pairEls,
      feedbackBox, resultBox,
      h("p", { id: "subrow" }, submitBtn));

    async function submit() {
      try {
        const r = await ctx.submit({ calc: ans.calc, pairs: ans.pairs });
        showResult(r);
      } catch (e) { resultBox.replaceChildren(h("div", { class: "err" }, e.message)); }
    }
    function showResult(r, auto) {
      locked = true;
      root.querySelectorAll("input[type=radio], .q input").forEach(i => (i.disabled = true));
      pw.value = ""; analyse(); // clear the test password
      document.getElementById("subrow").remove();
      r.feedback.calc.forEach(c => {
        const box = document.getElementById("box-" + c.id);
        box.append(h("div", { class: "fb" }, h("b", { class: c.ok ? "ok" : "no" }, c.ok ? "Correct. " : "Not quite. "), "Answer: " + c.key + ". " + c.work));
      });
      r.feedback.pairs.forEach(p => {
        const box = document.getElementById("box-" + p.id);
        box.append(h("div", { class: "fb" }, h("b", { class: p.ok ? "ok" : "no" }, p.ok ? "Correct. " : "Not quite. "), p.why));
      });
      resultBox.replaceChildren(resultBar(ctx, r, auto));
      resultBox.scrollIntoView({ block: "center" });
    }
    return { collect: () => ({ calc: ans.calc, pairs: ans.pairs }), showResult };
  }
};
