const PILLARS = {
  C: { name: "Confidentiality", def: "Only authorised people can see it." },
  I: { name: "Integrity", def: "It stays accurate, complete and traceable." },
  A: { name: "Availability", def: "It is there when the crew needs it." }
};

const CARDS = [
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
  ["a5", "A", true, "Keeping offline copies of critical drawings and procedures", "Crew can still work from them when the network or servers are down."]
].map(([id, p, helps, text, why]) => ({ id, p, helps, text, why }));

module.exports = {
  id: "cia",
  week: 1,
  title: "Sort the Action: C, I or A?",
  minutes: 15,
  maxScore: 30,
  questions() {
    return { pillars: PILLARS, cards: CARDS.map(c => ({ id: c.id, text: c.text })) };
  },
  score(index, answers) {
    const given = (answers && answers.placements) || {};
    let score = 0;
    const feedback = CARDS.map(c => {
      const g = given[c.id] || {};
      const okP = g.pillar === c.p;
      const okH = g.helps === c.helps;
      score += (okP ? 1 : 0) + (okH ? 1 : 0);
      return { id: c.id, text: c.text, okPillar: okP, okHelps: okH, pillar: c.p, helps: c.helps, why: c.why };
    });
    return { score, max: 30, feedback };
  },
  describe(answers) {
    const g = (answers && answers.placements) || {};
    return CARDS.map(c => {
      const x = g[c.id];
      return c.id + ": " + (x ? x.pillar + (x.helps === true ? " helps" : x.helps === false ? " harms" : " ?") : "not placed");
    }).join("; ");
  }
};
