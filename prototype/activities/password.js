const { seeded } = require("./util");

const WORDLIST_SIZE = 1296;
const LOG2_WORDS = Math.log2(WORDLIST_SIZE);

function params(index) {
  const r = seeded(String(index) + "|pw1");
  const pick = a => a[Math.floor(r() * a.length)];
  return {
    q1: { L: 8 + Math.floor(r() * 7), N: pick([26, 36, 52, 62, 94]) },
    q2: { H: 38 + Math.floor(r() * 11) },
    q3: { L: 4 + Math.floor(r() * 4) },
    q4: { N: pick([26, 62, 94]) }
  };
}

function answers(p) {
  return {
    q1: p.q1.L * Math.log2(p.q1.N),
    q2: Math.pow(2, p.q2.H - 1) / 1e10,
    q3: p.q3.L * LOG2_WORDS,
    q4: Math.log2(p.q4.N)
  };
}

const PAIRS = [
  { id: "p1", a: "Kumasi2026!", b: "tqzmwbxk (8 random lowercase letters)", correct: "b",
    why: "Kumasi2026! follows a guessable pattern (place name, year, symbol) and falls in moments. The random 8 letters carry about 37.6 bits of true randomness." },
  { id: "p2", a: "16 random lowercase letters", b: "8 random characters from all 94 printable characters", correct: "a",
    why: "16 x log2(26) is about 75.2 bits. 8 x log2(94) is about 52.4 bits. Length beats variety." },
  { id: "p3", a: "P@ssw0rd123", b: "Four random words from a 1,296-word list, for example plank-vivid-sugar-nudge", correct: "b",
    why: "P@ssw0rd123 is a known pattern. The passphrase has about 41.4 bits and follows no pattern." },
  { id: "p4", a: "6 random characters from all 94 printable characters", b: "8 random lowercase letters", correct: "a",
    why: "6 x log2(94) is about 39.3 bits. 8 x log2(26) is about 37.6 bits. Length does not always win when the pools differ a lot." }
];

function pairOrder(index) {
  const r = seeded(String(index) + "|pw2");
  return PAIRS.map(() => r() < 0.5);
}

const within = (given, truth, tol) => Number.isFinite(given) && Math.abs(given - truth) <= tol;
const withinPct = (given, truth, pct) => Number.isFinite(given) && Math.abs(given - truth) <= truth * pct;

module.exports = {
  id: "password",
  week: 1,
  title: "How Strong Is Your Password?",
  minutes: 20,
  maxScore: 12,
  questions(index) {
    const p = params(index);
    const flip = pairOrder(index);
    return {
      wordlistSize: WORDLIST_SIZE,
      calc: [
        { id: "q1", text: "A password has length L = " + p.q1.L + ", each character chosen randomly from N = " + p.q1.N + " possible characters. Find the entropy H in bits.", unit: "bits" },
        { id: "q2", text: "A random password has H = " + p.q2.H + " bits of entropy. An attacker makes R = 10^10 guesses per second. On average, how long does it take to find it?", unit: "seconds" },
        { id: "q3", text: "A passphrase is " + p.q3.L + " words, each chosen randomly from a list of " + WORDLIST_SIZE + " words. Find the entropy H in bits.", unit: "bits" },
        { id: "q4", text: "Each character is chosen randomly from N = " + p.q4.N + " possible characters. How many bits of entropy does adding one more character add?", unit: "bits" }
      ],
      pairs: PAIRS.map((x, i) => {
        const opts = [{ id: "a", text: x.a }, { id: "b", text: x.b }];
        return { id: x.id, options: flip[i] ? opts.reverse() : opts };
      })
    };
  },
  score(index, ans) {
    const p = params(index);
    const key = answers(p);
    const g = (ans && ans.calc) || {};
    const pg = (ans && ans.pairs) || {};
    const num = v => (v === "" || v == null ? NaN : Number(v));
    const calc = [
      { id: "q1", ok: within(num(g.q1), key.q1, 0.5), key: key.q1.toFixed(1) + " bits", work: "H = L x log2(N) = " + p.q1.L + " x log2(" + p.q1.N + ")" },
      { id: "q2", ok: withinPct(num(g.q2), key.q2, 0.05), key: key.q2.toPrecision(3) + " seconds", work: "t = 2^(H-1) / R = 2^" + (p.q2.H - 1) + " / 10^10" },
      { id: "q3", ok: within(num(g.q3), key.q3, 0.5), key: key.q3.toFixed(1) + " bits", work: "H = L x log2(1296) = " + p.q3.L + " x 10.34" },
      { id: "q4", ok: within(num(g.q4), key.q4, 0.1), key: key.q4.toFixed(2) + " bits", work: "Each character adds log2(N) = log2(" + p.q4.N + ")" }
    ];
    const pairs = PAIRS.map(x => ({ id: x.id, ok: pg[x.id] === x.correct, why: x.why }));
    const score = calc.filter(c => c.ok).length * 2 + pairs.filter(x => x.ok).length;
    return { score, max: 12, feedback: { calc, pairs } };
  },
  describe(ans) {
    const g = (ans && ans.calc) || {};
    const pg = (ans && ans.pairs) || {};
    return "Calc: " + ["q1", "q2", "q3", "q4"].map(k => k + "=" + (g[k] ?? "-")).join(", ") +
      "; Pairs: " + PAIRS.map(x => x.id + "=" + (pg[x.id] || "-")).join(", ");
  }
};
