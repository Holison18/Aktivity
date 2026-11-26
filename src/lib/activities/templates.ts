// The three prototype activities, carried over as templates (SRS 2.1).
// The admin picks a template in the activity builder and can edit everything.
import type { Template } from "./types";

const CIA_CARDS: [string, "C" | "I" | "A", boolean, string, string][] = [
  ["c1", "C", false, "Taking a company pendrive home", "Data leaves the controlled environment. A lost or shared drive exposes it to anyone."],
  ["c2", "C", true, "Locking your screen when you leave the workstation", "Passers-by cannot read production or well data from an unattended screen."],
  ["c3", "C", false, "Photographing production screens or reservoir maps with your phone", "Copies of sensitive data end up on a personal device outside company control."],
  ["c4", "C", true, "Sharing well data only with colleagues who need it for their work", "Need-to-know access keeps petroleum data within the people authorised to use it."],
  ["c5", "C", false, "Discussing production figures in the canteen or on social media", "Anyone nearby or online can hear or read figures that are not public."],
  ["i1", "I", true, "Recording meter readings exactly as displayed", "Accurate records keep production and allocation data trustworthy."],
  ["i2", "I", false, "Sharing your login so a colleague can enter data under your name", "Changes can no longer be traced to the person who made them."],
  ["i3", "I", true, "Logging every change to an alarm limit or setpoint in the change record", "A change record shows what was altered, by whom and why."],
  ["i4", "I", false, "Backdating or deleting an entry in the logbook", "The record no longer matches what happened, so decisions based on it are unsafe."],
  ["i5", "I", true, "Keeping the raw data file untouched and analysing a copy", "The original stays complete and unaltered as the reference."],
  ["a1", "A", true, "Backing up petroleum data to the approved server on schedule", "Data can be restored after a failure or deletion."],
  ["a2", "A", false, "Bypassing the redundant power or network link to the control room", "Removing redundancy makes a single fault enough to cut access to systems and data."],
  ["a3", "A", true, "Reporting a failing server immediately so the standby takes over", "Early reports keep systems running before a minor fault becomes an outage."],
  ["a4", "A", false, "Streaming videos or running large downloads on the shared satellite link", "Bandwidth is limited offshore. Heavy use can slow or block operational traffic."],
  ["a5", "A", true, "Keeping offline copies of critical drawings and procedures", "Crew can still work from them when the network or servers are down."],
];

// Card ids are opaque (k01...) so the id itself does not hint at the category.
const ciaId = (i: number) => `k${String(i + 1).padStart(2, "0")}`;

export const ciaTemplate: Template = {
  id: "cia",
  type: "sorting",
  title: "Sort the Action: C, I or A?",
  instructions:
    "Place each action under the security goal it affects most: Confidentiality, Integrity or Availability. Then say whether the action helps or harms that goal.",
  config: {
    categories: [
      { id: "C", name: "Confidentiality", description: "Only authorised people can see it." },
      { id: "I", name: "Integrity", description: "It stays accurate, complete and traceable." },
      { id: "A", name: "Availability", description: "It is there when the crew needs it." },
    ],
    judge: { prompt: "Does it help or harm?", options: [{ id: "helps", label: "Helps" }, { id: "harms", label: "Harms" }] },
    cards: CIA_CARDS.map(([, , , text], i) => ({ id: ciaId(i), text })),
    shuffle: true,
  },
  answer_key: {
    cards: Object.fromEntries(CIA_CARDS.map(([, p, helps, , why], i) => [ciaId(i), { category: p, judge: helps ? "helps" : "harms", why }])),
    points: { category: 1, judge: 1 },
  },
};

export const riskTemplate: Template = {
  id: "risk",
  type: "rating",
  title: "Rate Your Risks",
  instructions:
    "For each threat, answer the habit question honestly, then rate how likely it is to happen to you and how bad it would be, from 1 (low) to 5 (high). Risk = likelihood × impact. Then pick the one change you will make first and say why.",
  config: {
    items: [
      ["t1", "Phishing email that steals your login", "Do you click links in emails without checking the sender?", "Turn on multi-factor authentication on all accounts"],
      ["t2", "Lost or stolen laptop, phone or pendrive holding work files", "Do you carry work files on unencrypted devices?", "Enable full-disk encryption"],
      ["t3", "One password reused across accounts", "Do you reuse the same password on several sites?", "Use a password manager with unique passwords"],
      ["t4", "Plugging in an unknown USB drive", "Do you plug in USB drives from other people without scanning?", "Scan all removable media and refuse unknown drives"],
      ["t5", "Logging in over public Wi-Fi", "Do you log in to important accounts on public Wi-Fi?", "Use a VPN or mobile data for logins"],
      ["t6", "Skipping software updates", "Do you postpone system or app updates for weeks?", "Turn on automatic updates"],
      ["t7", "No backup of important files", "Do you keep important files in only one place?", "Schedule automatic 3-2-1 backups"],
      ["t8", "Unlocked screen in a shared space", "Do you leave your computer unlocked when you step away?", "Set auto-lock to 1 minute and lock manually when leaving"],
    ].map(([id, title, question, action]) => ({ id, title, question, action })),
    habitOptions: ["Never", "Sometimes", "Often"],
    scaleMax: 5,
    likelihoodLabel: "Likelihood",
    impactLabel: "Impact",
    choicePrompt: "Pick the one change you will make first. It should address your highest rated risk.",
    justification: { prompt: "Why this change first? Use at least 15 words.", minWords: 15 },
  },
  answer_key: { perCompleteItem: 1, choiceMatchesTop: 3, justification: 1, choiceRequiresAllRated: true },
};

export const passwordTemplate: Template = {
  id: "password",
  type: "calc_choice",
  title: "How Strong Is Your Password?",
  instructions:
    "Entropy H = L × log2(N) bits, where L is the length and N the number of possible characters. Average time to guess = 2^(H-1) / R. Your numbers are different from your neighbour's. Then pick the stronger password in each pair.",
  config: {
    numeric: [
      { id: "q1", text: "A password has length L = {L}, each character chosen randomly from N = {N} possible characters. Find the entropy H in bits.", unit: "bits", vars: { L: { min: 8, max: 14, step: 1 }, N: { choices: [26, 36, 52, 62, 94] } } },
      { id: "q2", text: "A random password has H = {H} bits of entropy. An attacker makes R = 10^10 guesses per second. On average, how long does it take to find it?", unit: "seconds", vars: { H: { min: 38, max: 48, step: 1 } } },
      { id: "q3", text: "A passphrase is {L} words, each chosen randomly from a list of 1296 words. Find the entropy H in bits.", unit: "bits", vars: { L: { min: 4, max: 7, step: 1 } } },
      { id: "q4", text: "Each character is chosen randomly from N = {N} possible characters. How many bits of entropy does adding one more character add?", unit: "bits", vars: { N: { choices: [26, 62, 94] } } },
    ],
    pairs: [
      { id: "p1", prompt: "Which is stronger?", a: "Kumasi2026!", b: "tqzmwbxk (8 random lowercase letters)", shuffle: true },
      { id: "p2", prompt: "Which is stronger?", a: "16 random lowercase letters", b: "8 random characters from all 94 printable characters", shuffle: true },
      { id: "p3", prompt: "Which is stronger?", a: "P@ssw0rd123", b: "Four random words from a 1,296-word list, for example plank-vivid-sugar-nudge", shuffle: true },
      { id: "p4", prompt: "Which is stronger?", a: "6 random characters from all 94 printable characters", b: "8 random lowercase letters", shuffle: true },
    ],
  },
  answer_key: {
    numeric: {
      q1: { formula: "L * log2(N)", tolerance: { abs: 0.5 }, points: 2, work: "H = L × log2(N) = {L} × log2({N})", display: "fixed:1" },
      q2: { formula: "2^(H-1) / 1e10", tolerance: { rel: 0.05 }, points: 2, work: "t = 2^(H-1) / R = 2^({H}-1) / 10^10", display: "precision:3" },
      q3: { formula: "L * log2(1296)", tolerance: { abs: 0.5 }, points: 2, work: "H = L × log2(1296) = {L} × 10.34", display: "fixed:1" },
      q4: { formula: "log2(N)", tolerance: { abs: 0.1 }, points: 2, work: "Each character adds log2(N) = log2({N})", display: "fixed:2" },
    },
    pairs: {
      p1: { correct: "b", points: 1, why: "Kumasi2026! follows a guessable pattern (place name, year, symbol) and falls in moments. The random 8 letters carry about 37.6 bits of true randomness." },
      p2: { correct: "a", points: 1, why: "16 × log2(26) is about 75.2 bits. 8 × log2(94) is about 52.4 bits. Length beats variety." },
      p3: { correct: "b", points: 1, why: "P@ssw0rd123 is a known pattern. The passphrase has about 41.4 bits and follows no pattern." },
      p4: { correct: "a", points: 1, why: "6 × log2(94) is about 39.3 bits. 8 × log2(26) is about 37.6 bits. Length does not always win when the pools differ a lot." },
    },
  },
};

export const shortAnswerTemplate: Template = {
  id: "short_answer_sample",
  type: "short_answer",
  title: "Quick Check: Fill-in & Short Answer",
  instructions: "Answer each question concisely in the space provided.",
  config: {
    questions: [
      {
        id: "q1",
        prompt: "What security goal ensures that only authorised people can read sensitive data?",
        placeholder: "One word",
        multiline: false,
        hint: "Starts with C",
        minWords: 0,
      },
      {
        id: "q2",
        prompt: "Name one defence that stops a stolen password from working on its own.",
        placeholder: "e.g. MFA or multi-factor authentication",
        multiline: false,
        hint: "",
        minWords: 0,
      },
      {
        id: "q3",
        prompt: "In at least 12 words, explain why reusing one password across accounts is risky.",
        placeholder: "Write your explanation here…",
        multiline: true,
        hint: "Mention what happens if one site is breached.",
        minWords: 12,
      },
    ],
  },
  answer_key: {
    questions: {
      q1: {
        mode: "exact",
        accepted: ["Confidentiality"],
        caseSensitive: false,
        points: 1,
        why: "Confidentiality keeps information accessible only to authorised people.",
      },
      q2: {
        mode: "keywords",
        keywords: ["mfa", "multi-factor", "multifactor", "2fa", "two-factor"],
        match: "any",
        minWords: 0,
        points: 2,
        why: "Multi-factor authentication (MFA / 2FA) requires a second factor in addition to the password.",
      },
      q3: {
        mode: "min_words",
        minWords: 12,
        points: 2,
        why: "If one account is compromised, attackers can try the same password on every other service you use.",
      },
    },
  },
};

export const TEMPLATES: Template[] = [ciaTemplate, riskTemplate, passwordTemplate, shortAnswerTemplate];

/** Blank starting points for each type, used by "Start from blank" in the builder. */
export const BLANKS: Record<string, Template> = {
  sorting: {
    id: "blank-sorting", type: "sorting", title: "New sorting activity", instructions: "Place each card in the right category.",
    config: { categories: [{ id: "x", name: "Category X", description: "" }, { id: "y", name: "Category Y", description: "" }], judge: null, cards: [{ id: "k01", text: "First card" }], shuffle: true },
    answer_key: { cards: { k01: { category: "x", why: "" } }, points: { category: 1, judge: 1 } },
  },
  rating: {
    id: "blank-rating", type: "rating", title: "New rating activity", instructions: "Rate each item.",
    config: { items: [{ id: "t1", title: "First item", question: "", action: "First action" }, { id: "t2", title: "Second item", question: "", action: "Second action" }], habitOptions: [], scaleMax: 5, likelihoodLabel: "Likelihood", impactLabel: "Impact", choicePrompt: "Pick the change you will make first.", justification: null },
    answer_key: { perCompleteItem: 1, choiceMatchesTop: 3, justification: 1, choiceRequiresAllRated: true },
  },
  calc_choice: {
    id: "blank-calc", type: "calc_choice", title: "New calculation activity", instructions: "Answer each question.",
    config: { numeric: [{ id: "q1", text: "What is {A} + {B}?", unit: "", vars: { A: { min: 1, max: 9, step: 1 }, B: { min: 1, max: 9, step: 1 } } }], pairs: [] },
    answer_key: { numeric: { q1: { formula: "A + B", tolerance: { abs: 0 }, points: 1, work: "{A} + {B}", display: "fixed:0" } }, pairs: {} },
  },
  short_answer: {
    id: "blank-short-answer", type: "short_answer", title: "New short answer activity", instructions: "Fill in your answer for each question.",
    config: {
      questions: [
        { id: "q1", prompt: "Fill in the blank: The three security goals are Confidentiality, Integrity, and ____.", placeholder: "Your answer", multiline: false, hint: "", minWords: 0 },
      ],
    },
    answer_key: {
      questions: {
        q1: { mode: "exact", accepted: ["Availability"], caseSensitive: false, points: 1, why: "" },
      },
    },
  },
};
