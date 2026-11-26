# Aktivity

Weekly in-class security activities. Students open a web page, enter their index number, complete the week's activities and see their scores at once. You download the scores as an Excel file.

## Run it
1. Install Node.js 18 or newer.
2. In this folder run `npm install` once, then `npm start`.
3. The terminal prints the student address (for example `http://192.168.1.20:3000`) and the admin password.
4. Students on the same Wi-Fi open the student address. You open `/admin` on the same address.

Set your own admin password with `ADMIN_PASSWORD=yourpassword npm start`. Without it, a random password is created on first run and saved in `data/config.json`.

If students cannot reach the page, the Wi-Fi may isolate devices from each other. Use a phone hotspot, or host the folder on any Node host (Render, Railway, a VPS). Keep `data/` on a persistent disk.

## Class window
Activities open only on Fridays 08:00 to 10:00 (Accra time, which equals UTC). The server clock decides. A countdown shows in the header and the page submits automatically at 10:00. Outside the window students can only see their own scores.

Admin page controls: force the session open (for testing or a make-up session), extend the end time in 10 minute steps, set a class code (show it on the board), choose the week. Change the day or times in `data/config.json` (`classDay` 0 to 6 with Sunday as 0, `start`, `end`).

## Scoring
- Best of 2 attempts counts (change `maxAttempts` in `data/config.json`).
- Answer keys stay on the server.
- The Excel file has three sheets: Summary (best score per activity and total), Attempts, Answers.

## Add a new week
1. Create `activities/<id>.js` with `id`, `week`, `title`, `minutes`, `maxScore`, `questions(index)`, `score(index, answers)`, `describe(answers)`. Copy `activities/risk.js` as a starting point.
2. Create `public/activities/<id>.js` that sets `ACTIVITIES.<id> = { render(ctx) { ... return { collect, showResult } } }`. Copy `public/activities/risk.js`.
3. Add the server file to `activities/index.js` and a `<script>` line for the client file in `public/index.html`.
4. On the admin page choose the new week.

## Data
Everything is in `data/`: `config.json` and `submissions.jsonl` (one line per attempt). Back this folder up after class.
