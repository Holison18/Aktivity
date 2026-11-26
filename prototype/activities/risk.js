const THREATS = [
  ["t1", "Phishing email that steals your login", "Do you click links in emails without checking the sender?", "Turn on multi-factor authentication on all accounts"],
  ["t2", "Lost or stolen laptop, phone or pendrive holding work files", "Do you carry work files on unencrypted devices?", "Enable full-disk encryption"],
  ["t3", "One password reused across accounts", "Do you reuse the same password on several sites?", "Use a password manager with unique passwords"],
  ["t4", "Plugging in an unknown USB drive", "Do you plug in USB drives from other people without scanning?", "Scan all removable media and refuse unknown drives"],
  ["t5", "Logging in over public Wi-Fi", "Do you log in to important accounts on public Wi-Fi?", "Use a VPN or mobile data for logins"],
  ["t6", "Skipping software updates", "Do you postpone system or app updates for weeks?", "Turn on automatic updates"],
  ["t7", "No backup of important files", "Do you keep important files in only one place?", "Schedule automatic 3-2-1 backups"],
  ["t8", "Unlocked screen in a shared space", "Do you leave your computer unlocked when you step away?", "Set auto-lock to 1 minute and lock manually when leaving"]
].map(([id, threat, habit, change]) => ({ id, threat, habit, change }));

const HABITS = ["Never", "Sometimes", "Often"];
const ok = n => Number.isInteger(n) && n >= 1 && n <= 5;
const words = s => String(s || "").trim().split(/\s+/).filter(Boolean).length;

module.exports = {
  id: "risk",
  week: 1,
  title: "Rate Your Risks",
  minutes: 20,
  maxScore: 12,
  questions() {
    return { threats: THREATS };
  },
  score(index, answers) {
    const r = (answers && answers.ratings) || {};
    let score = 0;
    const rows = [];
    for (const t of THREATS) {
      const x = r[t.id] || {};
      const L = Number(x.L), I = Number(x.I);
      const complete = HABITS.includes(x.habit) && ok(L) && ok(I);
      if (complete) { score += 1; rows.push({ id: t.id, threat: t.threat, change: t.change, risk: L * I }); }
    }
    const rated = rows.length;
    const top = rows.slice().sort((a, b) => b.risk - a.risk);
    const best = top.length ? top[0].risk : null;
    const topIds = top.filter(x => x.risk === best).map(x => x.id);
    const choice = answers && answers.choice;
    const choiceOk = rated === 8 && topIds.includes(choice);
    if (choiceOk) score += 3;
    const wordsOk = words(answers && answers.justification) >= 15;
    if (wordsOk) score += 1;
    const chosen = THREATS.find(t => t.id === choice);
    return {
      score, max: 12,
      feedback: {
        rated,
        top3: top.slice(0, 3).map(x => ({ threat: x.threat, risk: x.risk })),
        chosen: chosen ? chosen.change : null,
        choiceMatchesTopRisk: choiceOk,
        justificationOk: wordsOk
      }
    };
  },
  describe(answers) {
    const r = (answers && answers.ratings) || {};
    const lines = THREATS.map(t => {
      const x = r[t.id] || {};
      return t.id + " habit=" + (x.habit || "-") + " L=" + (x.L || "-") + " I=" + (x.I || "-");
    });
    const chosen = THREATS.find(t => t.id === (answers && answers.choice));
    lines.push("Chosen change: " + (chosen ? chosen.change : "-"));
    lines.push("Justification: " + ((answers && answers.justification) || "-"));
    return lines.join("\n");
  }
};
