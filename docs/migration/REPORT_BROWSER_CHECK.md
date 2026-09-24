# Report download - browser check

A manual check of the Gilligan report button on the local dashboard, written 2026-09-22 for the user to run.
Everything behind the button is verified by tests and a live API run (`SPECS.md` §10.7); this covers only what a browser shows.
Allow about 20 minutes.

## Costs and live access

Each chat question is one paid model call, a few cents.
Each report download reads production pod data with your own login token; it is read-only.
Nothing here writes to production.

## 1. Before starting

1. In both upstream checkouts, confirm the branch and the malware scan:

   ```bash
   cd ~/code/clean-earth-rovers/repo/clean-earth-rovers-server
   git branch --show-current        # must print: local
   grep -rlE ' {200,}' --exclude-dir=node_modules --exclude-dir=.git .   # must print nothing
   cd ../user-dashboard
   git branch --show-current        # must print: local
   grep -rlE ' {200,}' --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=.next .   # must print nothing
   ```

   If either check fails, stop: do not start the dashboard.
2. Confirm `clean-earth-rovers-server/.env` still has the five lines under "Serving Gilligan locally" in [`LOCAL_STACK.md`](LOCAL_STACK.md).
3. Confirm cer-demo is on `dev` (the report work merged there on 2026-09-22) and that its `.env` sets `REPORT_TOOL=true`.

## 2. Start the three services

Use three terminals.

```bash
# 1. cer-rag on :8010 - a report allowance of 3 per day, so the limit can be tested
cd ~/code/clean-earth-rovers/repo/cer-demo
PORT=8010 QUERY_QUOTA=true QUERY_QUOTA_REPORTS=3 QUERY_QUOTA_WINDOW=1d npm run dev

# 2. upstream server on :5001
cd ~/code/clean-earth-rovers/repo/clean-earth-rovers-server
npm run dev

# 3. dashboard on :3000
cd ~/code/clean-earth-rovers/repo/user-dashboard
yarn dev -p 3000
```

Wait for `Listening on http://localhost:8010`, `Listening: http://localhost:5001` and the Next.js ready line.
The cer-rag startup log should say `REPORT_TOOL is ON` and `reports=3`.

## 3. The checks

Open `http://localhost:3000`, log in as usual, and go to the Gilligan page.
Keep the browser's developer tools open on the Network tab.

| # | do | expect |
|---|---|---|
| 1 | Pick **Marina Park** in the pod picker and ask: `Give me a water quality report for the last 7 days` | An answer without being asked which pod. |
| 2 | Read the answer | It states a status and an event count, gives the period as `YYYY-MM-DD to YYYY-MM-DD` with this year, and contains no link or file path. |
| 3 | Look under the answer | A **Download report - Marina Park (PDF)** button. |
| 4 | Click it | The label changes to `Preparing report...`, then a file named `cer-report-marina-park-<start>-to-<end>.pdf` saves. The label returns to normal. |
| 5 | Open the PDF | At least two pages (event detail grows with the number of events); the header period matches the period in the answer. |
| 6 | In Network, select the `report` request | `POST /api/v1/gilligan/report`, status 200, `content-type: application/pdf`. No token appears in any request URL. |
| 7 | Reload the page and open the same chat from the history list | The button is still under that answer, and a click still downloads. |
| 8 | Click the button until it stops working (the allowance is 3, and step 4 and 7 used 2) | The label reads `Report limit reached - try again later`; the rest of the page still works, and a new question still gets an answer. |
| 9 | In Network, select the refused `report` request | Status 429 with a `retry-after` header. |
| 10 | On any answer with sources, click a citation number | The sources list opens; no raw `†"quote"` text is visible anywhere. |

Step 10 is the separate citation-chip check that was also waiting on a browser.
cer-rag keeps the report counter in memory, so restarting it resets the allowance.

## 4. Stop and report back

Stop the three services with Ctrl-C.
For each failed step, note the step number and what you saw; a screenshot of the answer and the button is enough for steps 1 to 4.
If the answer asked which pod despite step 1, include the question text exactly as typed.

## Automated run, 2026-09-23

Steps 1-10 were run in headless Chromium (Playwright, kept outside the repositories), logged in by placing the device token in the page's `localStorage` as the login page does.
Spend: 7 chat questions and 5 read-only report builds; nothing was written to production.

- Steps 1, 3, 4, 6, 7, 8, 9 and 10 pass.
- Step 2 passes on content, but the model writes the period's hyphens as U+2011, the recorded `report_period` defect; it looks identical on screen.
- Step 4's file name was `cer-report.pdf` until the server exposed `Content-Disposition` to cross-origin script; it now saves as `cer-report-marina-park-<start>-to-<end>.pdf`.
- Step 5: the Marina Park report for 2026-09-16 to 2026-09-23 had three pages, the third holding event detail.

The run also found page defects that the checklist does not cover; they are fixed and listed in [`GILLIGAN_R3_PORT.md`](GILLIGAN_R3_PORT.md) under "Browser pass, 2026-09-23".
