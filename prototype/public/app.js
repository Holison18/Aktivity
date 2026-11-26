const ACTIVITIES = {};
const S = {
  index: sessionStorage.getItem("idx") || "",
  code: sessionStorage.getItem("code") || "",
  name: sessionStorage.getItem("name") || ""
};
let clockOffset = 0; // server time minus browser time
let current = null;  // the activity currently on screen
let timerEnd = null;
const app = () => document.getElementById("app");

function h(tag, attrs, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (k === "class") e.className = v;
    else if (k.startsWith("on")) e.addEventListener(k.slice(2), v);
    else if (v === true) e.setAttribute(k, "");
    else if (v !== false && v != null) e.setAttribute(k, v);
  }
  for (const kid of kids.flat()) if (kid != null && kid !== false) e.append(kid.nodeType ? kid : document.createTextNode(kid));
  return e;
}
function fill(el, ...nodes) { el.replaceChildren(...nodes.flat(Infinity).filter(n => n != null && n !== false)); }
function show(...nodes) { fill(app(), ...nodes); window.scrollTo(0, 0); }
const nowMs = () => Date.now() + clockOffset;
const fmtTime = ms => new Date(ms).toLocaleString("en-GB", { timeZone: "UTC", weekday: "long", hour: "2-digit", minute: "2-digit", day: "numeric", month: "short" }) + " (Accra time)";

async function api(path, opts = {}) {
  const res = await fetch(path, {
    method: opts.method || "GET",
    headers: { "Content-Type": "application/json", "x-index": S.index, "x-code": S.code, "x-name": encodeURIComponent(S.name) },
    body: opts.body ? JSON.stringify(opts.body) : undefined
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || "Request failed"), { status: res.status, data });
  if (data.now) clockOffset = data.now - Date.now();
  return data;
}

// ---- countdown ----
function setTimer(endsAt) { timerEnd = endsAt; tick(); }
function tick() {
  const t = document.getElementById("timer");
  if (!timerEnd) { t.textContent = ""; t.className = "timer"; return; }
  const left = timerEnd - nowMs();
  if (left <= 0) {
    t.textContent = "Time is up";
    t.className = "timer warn";
    if (current && !current.ctx.done) { current.ctx.autoSubmit(); }
    timerEnd = null;
    return;
  }
  const m = Math.floor(left / 60000), s = Math.floor((left % 60000) / 1000);
  t.textContent = "Time left " + m + ":" + String(s).padStart(2, "0");
  t.className = "timer" + (left < 5 * 60000 ? " warn" : "");
}
setInterval(tick, 1000);

// ---- views ----
async function start() {
  if (S.index) return home();
  login();
}

async function login(msg) {
  let st = {};
  try { st = await api("/api/status"); } catch (e) {}
  setTimer(null); current = null;
  const idx = h("input", { id: "idx", autocomplete: "off", inputmode: "text", value: S.index });
  const name = h("input", { id: "nm", autocomplete: "name", value: S.name });
  const code = h("input", { id: "cd", autocomplete: "off", value: S.code });
  const err = h("div", { class: "err" }, msg || "");
  const go = async () => {
    S.index = idx.value.trim().toUpperCase(); S.name = name.value.trim(); S.code = code.value.trim();
    sessionStorage.setItem("idx", S.index); sessionStorage.setItem("name", S.name); sessionStorage.setItem("code", S.code);
    try { await home(); } catch (e) { err.textContent = e.message; }
  };
  show(
    h("h1", {}, "Enter your index number"),
    h("p", { class: "muted" }, "Use the same index number every week so your scores stay together."),
    h("label", { for: "idx" }, "Index number"), idx,
    h("label", { for: "nm" }, "Name (optional)"), name,
    st.codeRequired ? [h("label", { for: "cd" }, "Class code (shown on the board)"), code] : null,
    err,
    h("p", {}, h("button", { class: "btn", onclick: go }, "Continue"))
  );
  idx.focus();
}

async function home() {
  setTimer(null); current = null;
  let d;
  try { d = await api("/api/student/home"); }
  catch (e) { if (e.status === 400 || e.status === 401) { S.index = ""; sessionStorage.removeItem("idx"); return login(e.message); } throw e; }
  const w = d.window;
  const status = w.state === "open"
    ? (w.endsAt ? "Session open. Ends at " + new Date(w.endsAt).toLocaleTimeString("en-GB", { timeZone: "UTC", hour: "2-digit", minute: "2-digit" }) + "." : "Session open.")
    : "Session closed." + (w.opensAt ? " Next session: " + fmtTime(w.opensAt) + "." : "");
  if (w.state === "open" && w.endsAt) setTimer(w.endsAt);
  const row = a => h("div", { class: "item" },
    h("div", {}, h("div", {}, a.title), h("div", { class: "meta" }, "About " + a.minutes + " min. Attempts used " + a.attemptsUsed + " of " + d.maxAttempts)),
    h("div", { class: "row" },
      a.best != null ? h("span", { class: "score-pill" }, a.best + " / " + a.maxScore) : null,
      (w.state === "open" && a.attemptsUsed < d.maxAttempts)
        ? h("button", { class: "btn", onclick: () => openActivity(a.id) }, a.attemptsUsed ? "Try again" : "Start") : null));
  show(
    h("div", { class: "row", style: "justify-content:space-between" },
      h("h1", {}, "Week " + d.week),
      h("span", { class: "muted small" }, S.index + " ", h("a", { href: "#", onclick: e => { e.preventDefault(); sessionStorage.clear(); S.index = S.code = S.name = ""; login(); } }, "Not you?"))),
    h("div", { class: "notice" }, status),
    h("div", { class: "list" }, d.activities.map(row)),
    d.earlier.length ? [h("h2", {}, "Earlier weeks"), h("div", { class: "list" }, d.earlier.map(a => h("div", { class: "item" }, h("div", {}, a.title), h("span", { class: "score-pill" }, a.best + " / " + a.maxScore))))] : null
  );
}

async function openActivity(id) {
  let d;
  try { d = await api("/api/student/activity/" + id); }
  catch (e) { return home(); }
  const impl = ACTIVITIES[id];
  const ctx = {
    id, data: d, done: false, root: h("div"),
    async submit(answers, auto) {
      ctx.done = true;
      try {
        const r = await api("/api/student/submit/" + id, { method: "POST", body: { answers, auto: !!auto } });
        setTimer(null);
        return r;
      } catch (e) { ctx.done = false; throw e; }
    },
    async autoSubmit() {
      const answers = current.api.collect();
      try { const r = await ctx.submit(answers, true); current.api.showResult(r, true); }
      catch (e) { ctx.root.prepend(h("div", { class: "err" }, e.message)); }
    },
    reload: () => openActivity(id),
    home
  };
  current = { ctx };
  current.api = impl.render(ctx);
  setTimer(d.endsAt);
  show(
    h("p", {}, h("a", { href: "#", onclick: e => { e.preventDefault(); if (ctx.done || confirm("Leave this activity? Your answers will not be saved.")) home(); } }, "Back")),
    h("h1", {}, d.title),
    ctx.root
  );
}

// shared helper: result banner with navigation
function resultBar(ctx, r, auto) {
  return h("div", { class: "notice" },
    h("div", { class: "score-pill" }, "Score: " + r.score + " / " + r.max),
    auto ? h("div", { class: "small muted" }, "Submitted automatically when time ran out.") : null,
    h("div", { class: "row", style: "margin-top:8px" },
      r.attemptsLeft > 0 && !auto ? h("button", { class: "btn alt", onclick: ctx.reload }, "Try again (" + r.attemptsLeft + " left)") : null,
      h("button", { class: "btn", onclick: ctx.home }, "Back to activities")));
}
