# P3 calibration packet review - 2026-09-24

The independent packet review is complete, but the paid judge could not reach Fireworks, so agreement against the correctness Cohen's kappa threshold of 0.70 is **not measured**.
This is an AI review requested by the user, not the human calibration required by `docs/EVAL_REBUILD.md` section 2.
It does not close Phase 2c or authorize treating the automated judge as calibrated.

## Frozen review

- Packet: `eval/grading/p3-calib-2026-09-24/warm/`.
- Scores: all 32 rows completed in `scores.csv`; `invalid_citations` remains blank as requested.
- Scores SHA256: `f2eb8e3c41f58e4f0684c49258fabd1156d34222b684cf287639bb56e4cc0ad2`.
- Correctness: 11 answers scored 0; 17 scored 1; 4 scored 2.
- Ungrounded claims: 29 across 15 answers.

The reviewer read the eight sheets and checked claims against each answer's own context file, without displaying or inspecting `KEY.json`.
Scores were frozen before the judge dry run or paid attempts.
The existing judge command subsequently loaded the key internally to select the packet's arms.
Labels were not compared across fixtures.
No captured transcript, packet, context, rubric, prompt, or key was edited.

Correctness follows the packet rubric, including mandatory zeros for prohibited claims and refusals where substantive answers were expected.
Where the rubric itself requires a refusal plus explanatory content, a correct refusal with missing explanatory points receives partial credit.
Grounding is limited to the supplied context, as requested, even if a statement is otherwise correct.
Repeated claims are counted once; quoted claims are included; user-supplied numbers are excluded.
Under the user's strict numeric rule, the added hypothetical 8.0 mg/L example and its calculated 6.59 mg/L result were counted, as was the calculated +/-21 microSiemens/cm tolerance.
Those three counts describe absent example/calculated numbers, not arithmetic errors or fabricated observed readings.
The notes identify the particular claims behind every nonzero count.
No unsupported claim was identified as an operator range supplied by the system prompt.

## Review conclusions

Most answers are incomplete against their rubrics, even when their stated numbers are grounded.
Only 4 of 32 satisfy every required point.
The sample pools two blinded systems and was selected for calibration, so its combined mean of 0.78125/2 is descriptive only and is not an arm-level release result.

The most consequential errors are incorrect application of source material:

- `crossdoc-how-steady-before-i-write-it-down`, turn 1 A: generalizes a turbidity-specific 10 percent rule to all parameters.
- `definitional-eh-versus-the-millivolts-we-log`, turn 1 A: equates the probe's raw ORP value with Eh without the reference-electrode correction.
- `refusal-how-long-can-it-stay-in`, turns 1 A and 2 A: converts datasheet recalibration/lifetime figures into deployment and whole-record retention assurances.
- `followup-mixing-the-clarity-bottle`, turn 2 A: gives the correct rubric's 4 C and 24-hour storage limits despite lacking those claims in its own supplied context, and adds an unsupported 30-minute trigger.

These cases show why correctness and grounding must remain separate dimensions.
They also make it premature to trust aggregate judge scores without completing the comparison and resolving material disagreements.
The frozen scores should not be changed merely to improve agreement.

## Judge attempts and budget

The dry run selected all eight fixtures and planned 91 calls: correctness and grounding for all 32 answers, plus citation checks where applicable.
`--calibration` enabled final/default reasoning with `accounts/fireworks/models/deepseek-v4-flash-0731`.
Both paid attempts failed all 91 tasks with connection errors and produced no ledger verdicts.
The script nevertheless exited with status 0 and wrote an empty `warm.json` summary; that file is not a completed evaluation.
The failure count and absence of ledger records, rather than exit status alone, establish that the judge did not run successfully.

The resumed diagnostics confirmed `getaddrinfo EAI_AGAIN api.fireworks.ai` using the WSL resolver.
Queries to public DNS resolvers returned `ECONNREFUSED`, and a direct DNS-over-HTTPS connection also failed after network approval.
No credentials were printed or sent by those unauthenticated diagnostics.
No live device calls were made; `SENSOR_TOOL` and `REPORT_TOOL` were explicitly false.

The approximately $0.45 estimate is within the recorded R4 $20 ceiling, with approximately $7.44 previously recorded as spent.
The failed attempts recorded zero tokens and $0.0000 of estimated judge spend; this is not a provider billing reconciliation.
There are no paired verdicts, so neither exact agreement nor kappa can be reported.

## Resume when network access is available

Run from `.claude/worktrees/wave1-corrections`:

```bash
SENSOR_TOOL=false REPORT_TOOL=false npm run judge -- --run=p3-calib-2026-09-24 --calibration
SENSOR_TOOL=false REPORT_TOOL=false npm run judge -- --run=p3-calib-2026-09-24 --calibrate
```

The judge resumes from its ledger and skips completed matching verdicts.
Confirm zero failed tasks and 32 matched correctness/grounding pairs before interpreting agreement.
Report correctness kappa against 0.70, exact agreement, grounding-count agreement, and material disagreements.
Citation agreement is unavailable because the review intentionally leaves that column blank.
The CLI labels the reference scores "human"; for this packet, explicitly identify them as the frozen AI review.

## Sheet moved for a human re-grade - 2026-09-24

The user chose to grade the packet themselves, so these AI scores moved to `eval/grading/p3-calib-2026-09-24/warm/scores-ai-review.csv` (same SHA256 as above) and `scores.csv` is blank again, byte-identical to the sheet `30eb285` generated.
Commit `7cdd366` describes these scores as the user's grades; they are this AI review.
`judge --calibrate` reads `scores.csv`, so kappa is reported against the human re-grade; the AI review stays available for comparison.

## Human calibration result - 2026-09-24

Network access returned (an unauthenticated request to `api.fireworks.ai` answered HTTP 401), and the judge ran against the user's own sheet.
`scores.csv` is the user's grading (`ea380f6`), with ungrounded counts later reconciled to this review (`d17ade6`); correctness was not changed.
This review was amended in `d17ade6`: its reviewer withdrew the strict count of example and calculated numbers above, so `deepmanual-brackish-do-correction` turn 1 A drops from 2 ungrounded claims to 0 and the new SHA256 is `f58502d277165cf6da8b585a7778a5bf61420e002ac8db177a424a2062f8e1e1` (27 claims across 14 answers).

`--calibration` judged 91/91 calls with 0 failures for about $0.3574, and `--calibrate` matched 32 pairs per graded dimension.
Correctness Cohen's kappa against the user is **0.561, below the 0.70 bar**: exact 23/32, within one 32/32.
Ungrounded any/none agreement is 25/32 (count kappa 0.231); since the two sheets carry identical ungrounded counts, that figure is the same against this review.
As a secondary result, the judge agrees with this review on correctness at kappa 0.786 (28/32 exact), and the user agrees with this review at 0.659 (25/32 exact).
The disagreement patterns and the decision they leave are in `docs/EVAL_REBUILD.md`, "Calibration packet (2c)".

R4 spend is now about $7.80 of the $20 ceiling ($7.44 before this run).
The empty `warm.json` from the failed attempts was overwritten by this run.
The judge's exit status 0 when every call failed was fixed in `e662fa0`: it now exits 1 whenever any call fails.

## Prompt fix and re-judge - 2026-09-25

The user approved targeted correctness-prompt fixes and a correctness-only re-judge after an adjudication of the nine disputed rows (`docs/EVAL_REBUILD.md`, "Calibration packet (2c)").
The re-judge (`49e28ae`) sent 32 calls with 0 failures for about $0.1206.
Correctness kappa against the user's grades as submitted is now 0.659, still below 0.70; against the adjudicated reference it is 0.802.
Against this review the judge now agrees at 0.895 on correctness.
R4 spend is now about $7.92 of the $20 ceiling.

