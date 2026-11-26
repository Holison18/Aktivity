const express = require("express");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const ExcelJS = require("exceljs");
const ACTIVITIES = require("./activities");

const PORT = process.env.PORT || 3000;
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "data");
const CONFIG_FILE = path.join(DATA_DIR, "config.json");
const SUBS_FILE = path.join(DATA_DIR, "submissions.jsonl");
fs.mkdirSync(DATA_DIR, { recursive: true });

// ---- config (Ghana is UTC+0 all year, so UTC times are Accra times) ----
const DEFAULTS = {
  week: 1,
  classDay: 5, // Friday
  start: "08:00",
  end: "10:00",
  extendMinutes: 0,
  forceOpen: false, // admin switch for testing or make-up sessions
  maxAttempts: 2,
  classCode: "",
  adminPassword: ""
};
let cfg = { ...DEFAULTS };
try { cfg = { ...DEFAULTS, ...JSON.parse(fs.readFileSync(CONFIG_FILE, "utf8")) }; } catch (e) {}
if (process.env.ADMIN_PASSWORD) cfg.adminPassword = process.env.ADMIN_PASSWORD;
if (!cfg.adminPassword) cfg.adminPassword = crypto.randomBytes(4).toString("hex");
const saveCfg = () => fs.writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2));
saveCfg();

// ---- submissions (append-only file, kept in memory too) ----
let subs = [];
try {
  subs = fs.readFileSync(SUBS_FILE, "utf8").split("\n").filter(Boolean).map(l => JSON.parse(l));
} catch (e) {}
const addSub = s => { subs.push(s); fs.appendFileSync(SUBS_FILE, JSON.stringify(s) + "\n"); };

// ---- session window ----
function windowInfo(now) {
  if (cfg.forceOpen) return { state: "open", endsAt: null, forced: true };
  const [sh, sm] = cfg.start.split(":").map(Number);
  const [eh, em] = cfg.end.split(":").map(Number);
  const d = new Date(now);
  for (let add = 0; add <= 7; add++) {
    const day = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + add));
    if (day.getUTCDay() !== Number(cfg.classDay)) continue;
    const y = day.getUTCFullYear(), m = day.getUTCMonth(), dd = day.getUTCDate();
    const start = Date.UTC(y, m, dd, sh, sm);
    const end = Date.UTC(y, m, dd, eh, em) + cfg.extendMinutes * 60000;
    if (add === 0) {
      if (now < start) return { state: "closed", opensAt: start };
      if (now <= end) return { state: "open", endsAt: end };
      return { state: "closed", opensAt: start + 7 * 864e5, endedAt: end };
    }
    return { state: "closed", opensAt: start };
  }
  return { state: "closed", opensAt: null };
}
const GRACE_MS = 20000; // lets an auto-submit at 10:00:00 arrive
function submitAllowed(now) {
  const w = windowInfo(now);
  return w.state === "open" || (w.endedAt && now <= w.endedAt + GRACE_MS);
}

// ---- helpers ----
const cleanIndex = s => String(s || "").trim().toUpperCase();
const validIndex = s => /^[A-Z0-9]{5,12}$/.test(s);
const weekActs = () => ACTIVITIES.filter(a => a.week === Number(cfg.week));
const mine = index => subs.filter(s => s.index === index);
const best = (index, id) => Math.max(0, ...mine(index).filter(s => s.activity === id).map(s => s.score));

const app = express();
app.use(express.json({ limit: "200kb" }));
app.get("/favicon.ico", (req, res) => res.status(204).end());
app.get("/admin", (req, res) => res.sendFile(path.join(__dirname, "public", "admin.html")));
app.use(express.static(path.join(__dirname, "public")));

app.get("/api/status", (req, res) => {
  res.json({ codeRequired: !!cfg.classCode, week: cfg.week, window: windowInfo(Date.now()), now: Date.now() });
});

// student middleware: index number (and class code when set)
function student(req, res, next) {
  const index = cleanIndex(req.get("x-index"));
  if (!validIndex(index)) return res.status(400).json({ error: "Enter a valid index number (5 to 12 letters or digits)." });
  if (cfg.classCode && String(req.get("x-code") || "").trim().toLowerCase() !== cfg.classCode.toLowerCase())
    return res.status(401).json({ error: "Wrong class code." });
  req.index = index;
  try { req.name = decodeURIComponent(req.get("x-name") || "").slice(0, 80); } catch (e) { req.name = ""; }
  next();
}

app.get("/api/student/home", student, (req, res) => {
  const now = Date.now();
  const list = a => ({
    id: a.id, title: a.title, minutes: a.minutes, maxScore: a.maxScore,
    attemptsUsed: mine(req.index).filter(s => s.activity === a.id).length,
    best: mine(req.index).some(s => s.activity === a.id) ? best(req.index, a.id) : null
  });
  res.json({
    week: cfg.week, maxAttempts: cfg.maxAttempts, window: windowInfo(now), now,
    activities: weekActs().map(list),
    earlier: ACTIVITIES.filter(a => a.week !== Number(cfg.week)).map(list).filter(a => a.attemptsUsed > 0)
  });
});

app.get("/api/student/activity/:id", student, (req, res) => {
  const a = ACTIVITIES.find(x => x.id === req.params.id && x.week === Number(cfg.week));
  if (!a) return res.status(404).json({ error: "Activity not found." });
  const now = Date.now();
  const w = windowInfo(now);
  if (w.state !== "open") return res.status(403).json({ error: "This session is closed.", window: w });
  const used = mine(req.index).filter(s => s.activity === a.id).length;
  if (used >= cfg.maxAttempts) return res.status(403).json({ error: "No attempts left for this activity." });
  res.json({
    id: a.id, title: a.title, endsAt: w.endsAt, now,
    attemptsLeft: cfg.maxAttempts - used, questions: a.questions(req.index)
  });
});

app.post("/api/student/submit/:id", student, (req, res) => {
  const a = ACTIVITIES.find(x => x.id === req.params.id && x.week === Number(cfg.week));
  if (!a) return res.status(404).json({ error: "Activity not found." });
  const now = Date.now();
  if (!submitAllowed(now)) return res.status(403).json({ error: "The session has ended. Your answers were not recorded." });
  const used = mine(req.index).filter(s => s.activity === a.id).length;
  if (used >= cfg.maxAttempts) return res.status(403).json({ error: "No attempts left for this activity." });
  const answers = req.body && req.body.answers;
  const r = a.score(req.index, answers);
  const name = req.name || (mine(req.index).find(s => s.name) || {}).name || "";
  addSub({
    t: new Date(now).toISOString(), index: req.index, name, activity: a.id, week: a.week,
    attempt: used + 1, score: r.score, max: r.max, auto: !!(req.body && req.body.auto),
    answers, desc: a.describe(answers)
  });
  res.json({ ...r, attempt: used + 1, attemptsLeft: cfg.maxAttempts - used - 1 });
});

// ---- admin ----
function admin(req, res, next) {
  if (req.get("x-admin") !== cfg.adminPassword) return res.status(401).json({ error: "Wrong admin password." });
  next();
}

function table(week) {
  const acts = ACTIVITIES.filter(a => a.week === week);
  const students = {};
  for (const s of subs.filter(x => x.week === week)) {
    const st = (students[s.index] = students[s.index] || { index: s.index, name: "", best: {} });
    if (s.name) st.name = s.name;
    st.best[s.activity] = Math.max(st.best[s.activity] || 0, s.score);
  }
  const max = acts.reduce((n, a) => n + a.maxScore, 0);
  const rows = Object.values(students).map(st => {
    const total = acts.reduce((n, a) => n + (st.best[a.id] || 0), 0);
    return { ...st, total, pct: max ? Math.round((total / max) * 1000) / 10 : 0 };
  }).sort((a, b) => a.index.localeCompare(b.index));
  return { acts, rows, max };
}

app.get("/api/admin/state", admin, (req, res) => {
  const week = Number(req.query.week || cfg.week);
  const t = table(week);
  res.json({
    config: { week: cfg.week, extendMinutes: cfg.extendMinutes, forceOpen: cfg.forceOpen, maxAttempts: cfg.maxAttempts, classCode: cfg.classCode, start: cfg.start, end: cfg.end },
    window: windowInfo(Date.now()), now: Date.now(),
    weeks: [...new Set(ACTIVITIES.map(a => a.week))],
    view: { week, acts: t.acts.map(a => ({ id: a.id, title: a.title, maxScore: a.maxScore })), rows: t.rows, max: t.max }
  });
});

app.post("/api/admin/config", admin, (req, res) => {
  const b = req.body || {};
  if (b.week != null) cfg.week = Number(b.week);
  if (b.extendMinutes != null) cfg.extendMinutes = Math.max(0, Math.min(180, Number(b.extendMinutes) || 0));
  if (b.forceOpen != null) cfg.forceOpen = !!b.forceOpen;
  if (b.maxAttempts != null) cfg.maxAttempts = Math.max(1, Math.min(10, Number(b.maxAttempts) || 1));
  if (b.classCode != null) cfg.classCode = String(b.classCode).trim().slice(0, 20);
  saveCfg();
  res.json({ ok: true });
});

app.get("/api/admin/export", admin, async (req, res) => {
  const week = Number(req.query.week || cfg.week);
  const { acts, rows, max } = table(week);
  const wb = new ExcelJS.Workbook();

  const s1 = wb.addWorksheet("Summary");
  s1.columns = [
    { header: "Index number", key: "index", width: 16 },
    { header: "Name", key: "name", width: 28 },
    ...acts.map(a => ({ header: a.title + " (/" + a.maxScore + ")", key: a.id, width: 26 })),
    { header: "Total (/" + max + ")", key: "total", width: 14 },
    { header: "Percent", key: "pct", width: 10 }
  ];
  rows.forEach(r => s1.addRow({ index: r.index, name: r.name, ...r.best, total: r.total, pct: r.pct }));

  const s2 = wb.addWorksheet("Attempts");
  s2.columns = [
    { header: "Index number", key: "index", width: 16 }, { header: "Name", key: "name", width: 28 },
    { header: "Activity", key: "activity", width: 28 }, { header: "Attempt", key: "attempt", width: 9 },
    { header: "Score", key: "score", width: 9 }, { header: "Max", key: "max", width: 9 },
    { header: "Time (UTC)", key: "t", width: 26 }, { header: "Auto-submitted at deadline", key: "auto", width: 24 }
  ];
  const weekSubs = subs.filter(s => s.week === week);
  weekSubs.forEach(s => s2.addRow({ ...s, activity: (ACTIVITIES.find(a => a.id === s.activity) || {}).title || s.activity, auto: s.auto ? "yes" : "" }));

  const s3 = wb.addWorksheet("Answers");
  s3.columns = [
    { header: "Index number", key: "index", width: 16 }, { header: "Activity", key: "activity", width: 28 },
    { header: "Attempt", key: "attempt", width: 9 }, { header: "Answers", key: "desc", width: 100 }
  ];
  weekSubs.forEach(s => s3.addRow({ index: s.index, activity: s.activity, attempt: s.attempt, desc: s.desc }));
  s3.getColumn("desc").alignment = { wrapText: true, vertical: "top" };

  [s1, s2, s3].forEach(ws => { ws.getRow(1).font = { bold: true }; ws.views = [{ state: "frozen", ySplit: 1 }]; });

  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", 'attachment; filename="scores_week' + week + "_" + new Date().toISOString().slice(0, 10) + '.xlsx"');
  await wb.xlsx.write(res);
  res.end();
});

app.listen(PORT, "0.0.0.0", () => {
  const nets = Object.values(require("os").networkInterfaces()).flat().filter(n => n.family === "IPv4" && !n.internal);
  console.log("\nAktivity is running.");
  console.log("Students open:  " + nets.map(n => "http://" + n.address + ":" + PORT).join("   ") || "http://localhost:" + PORT);
  console.log("Admin page:     /admin   password: " + cfg.adminPassword);
  console.log("Session window: day " + cfg.classDay + " " + cfg.start + "-" + cfg.end + " UTC (Accra time). Admin can force it open for testing.\n");
});
