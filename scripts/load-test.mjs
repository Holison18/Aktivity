// AC-8 over HTTP: 150 registrations + logins within 2 minutes against a running deployment.
// Usage: node scripts/load-test.mjs https://your-site.example /w/<token> CLASSCODE [lat lng]
// Use a test week: it registers 150 throwaway students (index numbers 8xxxxxx).
const [base, path, code, lat = "5.6037", lng = "-0.187"] = process.argv.slice(2);
if (!base || !path || !code) {
  console.error("Usage: node scripts/load-test.mjs BASE_URL /w/TOKEN CLASSCODE [lat lng]");
  process.exit(1);
}
const token = path.split("/").pop();
const origin = new URL(base).origin;
const position = { lat: Number(lat), lng: Number(lng), accuracy: 15 };
const N = Number(process.env.N || 150);
const post = (body) =>
  fetch(`${origin}/api/s/login`, { method: "POST", headers: { "content-type": "application/json", origin }, body: JSON.stringify(body) });

const timings = [];
const t0 = Date.now();
const results = await Promise.all(
  Array.from({ length: N }, async (_, i) => {
    const index = `8${String(i).padStart(3, "0")}${String(Math.floor(Math.random() * 1000)).padStart(3, "0")}`;
    const s = Date.now();
    try {
      const a = await post({ token, index, position });
      const ja = await a.json();
      if (ja.status !== "register" && ja.status !== "ok") return `lookup ${a.status} ${ja.message ?? ""}`;
      const b = await post({ token, index, position, register: { indexConfirm: index, name: `Load Test${i}`, classCode: code } });
      timings.push(Date.now() - s);
      return b.status === 200 ? "ok" : `register ${b.status} ${(await b.json()).message ?? ""}`;
    } catch (e) {
      return `network ${e.message}`;
    }
  }),
);
const elapsed = (Date.now() - t0) / 1000;
const bad = results.filter((r) => r !== "ok");
timings.sort((a, b) => a - b);
const p = (q) => timings[Math.min(timings.length - 1, Math.floor(q * timings.length))] ?? 0;
console.log(`${N - bad.length}/${N} succeeded in ${elapsed.toFixed(1)} s. Per student (2 requests): p50 ${p(0.5)} ms, p95 ${p(0.95)} ms.`);
if (bad.length) console.log("Failures:", bad.slice(0, 10));
console.log(bad.length === 0 && elapsed < 120 ? "AC-8 PASS" : "AC-8 FAIL");
process.exit(bad.length === 0 && elapsed < 120 ? 0 : 1);
