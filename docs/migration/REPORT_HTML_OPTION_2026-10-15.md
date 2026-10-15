# Report editing: is the HTML template worth building? (2026-10-15)

Recommendation note for [`POST_LAUNCH_BACKLOG.md`](POST_LAUNCH_BACKLOG.md) §6, written from code and earlier results; nothing was run, and every cost below is an estimate unless it cites a measurement.
"HTML" here means Michael's own preference among the first two ideas offered to him; the `omit` options that were built have nothing to do with HTML, they are parameters on the report tool call.
Short answer: ship idea 1, which Michael approved on 2026-10-12 with all four samples, and do not build the HTML template unless he asks for more.

## Where things stand

Michael asked (2026-10-07) to leave the turbidity disclaimers out of a report he wanted to share online, and asked whether it "can omit areas of the report".
He was offered two directions, both HTML: the model writes the whole report as HTML, or the model edits a fixed HTML template with named sections; he answered "I would say the HTML is the better idea", which does not say which of the two he meant.
Idea 1, a closed `omit` list on `generate_report` and `POST /api/v1/reports` (`src/report/omit.ts`), is on `dev`, not deployed; the server half is pushed upstream with no pull request.
It was tested on the Mirror ([`REPORT_OMIT_MIRROR_RESULTS_2026-10-10.md`](REPORT_OMIT_MIRROR_RESULTS_2026-10-10.md)): Michael's own wording picked `turbidity_notes` and `sensor_fault_notes`, every number stayed identical, and the false "new PDF is ready" claim is held by the server-written delivery line plus a forced retry.

## 1. Does idea 1 cover what Michael asked?

For the request he actually made, yes: the turbidity caveats (summary clause, Baseline cell, Section 2 footnote, analysis sentence) go, and the PDF says what was left out (sample pair `offline-S1-full.pdf` and `offline-S2-no-turbidity-notes.pdf`).
For "omit areas of the report" in general, only partly.
What it cannot do:

- Leave out anything outside four fixed groups: no dropping Recommendations, events, a parameter, the metadata table or the "Omitted" row; only Data Quality is removable as a whole section.
- Reword, shorten or add text, such as a plain-language intro for a public reader.
- Take out numbers or flags; that is by design, since a caveat-free copy that also drops values was ruled out in research item 2.
- Cover new caveats without code: every new group is a code change in `omit.ts`, `narrative.ts` and `renderPdf.ts` plus tests.
- Edit a report already made: each edit regenerates it and counts against the 5-a-day guard.
- Make a turbidity-free copy in one step when the sensor looks faulty: Data Quality can still mention turbidity unless `data_quality` is also left out.

Still unknown: which exact text Michael calls "the turbidity disclaimers" (research item 1), so the two groups match a reasonable reading of his request, not a confirmed one.

## 2. What idea 2 would add, and cost

### What it adds

- The sections and notes are declared in one template, so adding a removable section is a markup change rather than renderer code, and layout changes are CSS rather than `pdfkit` coordinates.
- The same HTML could be shown in the dashboard before download, with toggles (backlog idea 4) and no model involved; this is the strongest reason for HTML.
- Model-filled text slots could reword or add text, which is the one thing idea 1 cannot do at all.

The model choosing which sections to keep is not new: idea 1 already does that through a tool argument, and an HTML template would reuse the same group names (timeline, 2026-10-09).
So idea 2 without text slots is mostly a renderer swap; with text slots it is a policy change.

### Rendering engine on Cloud Run

cer-gilligan runs `node:24-alpine`, 1 vCPU, 1 GiB, concurrency 8, one instance (min = max = 1, `release/deploy-cer-gilligan.sh`); the in-memory corpus and embedding cache are about 9.5 MB on disk.

| engine | image added | memory per render | start and render time | notes |
|---|---|---|---|---|
| Headless Chromium (`puppeteer-core` with Alpine's `chromium` and fonts) | about 250-450 MB (estimate) | about 150-300 MB for the browser plus 50-100 MB per open page (estimate) | browser launch about 1-2 s on 1 vCPU if not kept warm, render about 0.5-2 s for a 3-page report (estimate) | eight concurrent requests could exceed 1 GiB, so plan on 2 GiB, roughly a few dollars a month more on the one always-on instance (estimate); layout can shift with Chromium or font updates, so the PDF is less reproducible than today |
| Separate Gotenberg service (Chromium in its own Cloud Run service) | none in cer-gilligan; its own image about 1 GB or more (estimate) | isolated from chat | several seconds on its own cold start unless it also keeps an instance warm | a second service to deploy, secure and pay for |
| WeasyPrint | about 100-150 MB with Python and its libraries (estimate) | well under Chromium | sub-second to a few seconds | adds Python to a Node image; narrower CSS support than a browser |
| wkhtmltopdf | - | - | - | archived upstream in 2023; not an option |
| `pdfmake` or `@react-pdf/renderer` (not HTML) | a few MB | small | sub-second | named, declarative sections in pure JS without a browser, but no dashboard preview from the same source |

Container cold start barely matters today because one instance is always on, so the real costs are image size at deploy, memory headroom under concurrency, and reproducibility.
On top of the engine, `renderPdf.ts` (810 lines) and its 37-case `reportRenderPdf` suite would be rewritten.

### Model cost per report

Measured for idea 1: reports add no model cost; a second edit that the model first skips costs one forced retry, about 24,000 tokens, about $0.004 at the Mirror test's rates.
Idea 2 choosing sections only: no extra call, the same as idea 1.
Idea 2 filling text slots: one extra call of perhaps 8,000-15,000 input and 500-1,500 output tokens, roughly $0.002-0.004 a report on `glm-5p3-flash` at the Mirror results' rates (estimate).
The backlog's 3-15 cents a report was never measured and looks like a larger model writing the whole report (idea 3); on the current model even idea 3 is likely under a cent (estimate).
Money is not the cost that matters; correctness is: a model-written slot can misstate a number or restore a removed caveat in its own words, so every slot needs a deterministic check against the report's figures.

### Does it reverse the zero-AI-calls decision?

Section choice through a closed list does not: the report text stays fixed code, as in idea 1.
Any model-written text in the PDF does reverse it, and the user's rule is that AI in reports needs good justification and Michael's agreement (timeline, 2026-10-09); no section has been found that needs it.

## 3. What should wait for the flagging rework

The rework (`task/flagging-share-window`, handoff `docs/migration/FLAGGING_REWORK_HANDOFF_2026-10-13.md` on that branch) changes 7 report files, about 680 lines added, and is awaiting Michael's review.
It changes statuses (Action Required only for a current flag, so the customer's 30-day report becomes Watch), events (from flagged windows, "Anomaly, cause unclear"), and adds summary bullets and analysis sentences for edge stretches and "very unusual" readings ending "a calibration check would confirm them".
Those calibration sentences are caveats no `omit` group covers, so a "clean copy" made after the rework will still carry them.

Should wait for the rework:

- Any new `omit` group, such as one for the unusual-reading calibration notes, because their wording and conditions are not settled until Michael reviews the rework.
- Any template or layout redesign, HTML or not, because the rework is still changing what the sections say.
- Fresh samples: the four Michael approved in `report-omit-samples/` predate the rework, so regenerate them after it lands (free, offline) and show him the new calibration wording.

Need not wait: deploying idea 1 itself, since the rework keeps the `omit` checks in `narrative.ts` and only adds text around them; whichever lands second resolves a small merge in `narrative.ts`.

## 4. Recommendation

Ship idea 1 with the next deploy, and do not build the HTML template now.
Its value over idea 1 is rewording and a dashboard preview, neither of which Michael has asked for; its costs are a browser in the image or a second service, a rewritten renderer, and, if it writes text, reversing the zero-AI-calls decision.
Michael has already been told what each group removes (2026-10-12); still tell him plainly that the model chooses which notes to leave out but never writes report text.
After the flagging rework lands, decide with him whether the new calibration notes need their own group.
Revisit idea 2, or idea 4 (the dashboard with toggles), only if his answer shows a need for rewording or for removing whole sections beyond Data Quality.

Michael approved all four samples ("yes these look good!", 2026-10-12), so the open question is narrower and can wait for real use after the release:

> Is there anything else in the report you would want to remove or reword before sharing it?

"Nothing" closes §6 on idea 1; "remove more" means new groups; "reword" is the only answer that justifies HTML text slots and revisiting the zero-AI-calls decision.
