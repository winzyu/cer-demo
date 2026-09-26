# Rubric validity fixes (rubric v2) - 2026-09-25

User decision, 2026-09-25: of the three options in the R4 handoff, fix only the flawed rubric points the three reviews identified; no core/supplementary split.
This file records every edit, the rule behind it, and what was deliberately left alone.
The reported primary result stays 1.01 on the frozen v1 rubric; v2 scores are a secondary, versioned measurement.

## Rule, fixed before editing

A point is flawed, and changed, only if it falls in one of these four classes.

- **F1 unsupported**: the point requires a fact that is in neither the turn's gold excerpts (the `gold-context` capture's `context`) nor the tools-off system prompt.
  Fix: drop the unsupported part; keep what the excerpts support.
- **F2 duplicate**: two must-contain points in one turn test the same proposition.
  Fix: merge into one point that keeps the union of both requirements, so nothing an answer had to say is dropped.
- **F3 omission-type must-not**: a must-not item fires on something the answer leaves out ("omits", "drops", "ignores") and a must-contain point already requires that content.
  Fix: delete the must-not item; the omission still costs the 2 through the must-contain point, but no longer forces a 0.
  Must-not items that describe an off-target answer ("answers only X and never Y") describe something the answer says, and stay.
- **F4 instruction or contradiction**: a grading instruction or permission written so it reads as a requirement, or a point that contradicts another point in the same turn.
  Fix: rewrite so the permission is optional and the points agree.

Method: all 90 turns' questions and rubrics were audited, every rubric figure was checked against its turn's excerpts by script (all present, apart from question values and arithmetic), the points with the least lexical overlap with their excerpts were checked by hand, and within-turn duplicates were screened by token overlap.
The audit did not open any answer or judge verdict, but its author (Claude) had read the three reviews, which quote answers, so it is not blind.

## Edits

32 edits in 24 turns of 19 fixtures; must-contain points 423 to 412, must-not items 315 to 304.
No question text changed, so every capture stays valid; only judge verdicts need re-running.

| turn | class | edit | reason |
|---|---|---|---|
| crossdoc-temp-sensor-drift-blast-radius#1 | F1 | MC1 drops "corrected Eh"; MC4 (pH electrode slope and buffer values) and MC5 (reference-electrode potential for Eh) deleted | The excerpts name dissolved oxygen, conductivity and pH as relying on temperature; nothing on slope, buffers, Eh or ORP. Flagged by Claude and Codex. |
| followup-jumpy-temperature-trace#2 | F1, F2 | MC2 (conditional NWIS uncertainty rule) and MC3 (verify before trusting repaired data) deleted | The excerpt says only "replace cables, which may require recertification", which MC1 already requires; no uncertainty rule exists in the excerpts. Flagged by both. |
| refusal-turbidity-sensor-hardware#2 | F1 | MC5 no longer requires "the application labels turbidity in NTU" | Neither the excerpts nor the tools-off system prompt say so; the relative-index part is a system-prompt rule and stays. |
| probecal-ph-what-solutions#1 | F2 | MC1 and MC2 merged | "At least two, not one" and "single-point is not acceptable" are one proposition. Flagged by both. |
| probecal-end-of-day-check#2 | F2 | MC3 and MC5 merged | Both say the project plan's criteria govern and the EPA defaults apply only in their absence. Codex. |
| crossdoc-soft-water-ph-wont-settle#2 | F2 | MC4 deleted | MC3 already requires the 0.05 pH unit final-buffer check at calibration temperature. Codex. |
| deepmanual-brackish-do-correction#2 | F2 | MC3 deleted | MC1 already states the 2,000 µS/cm saline threshold. |
| deepmanual-ec-standard-choice#1 | F2 | MC3 and MC4 merged | "Nearest to or bracketing" stated as a rule and again as a selection. |
| probecal-ec-never-recalibrate#2 | F2 | MC2 and MC4 merged | Same pattern as the previous row. |
| crossdoc-do-calibrated-dry-deployed-brackish#2 | F2, F4 | MC7 deleted | A permission ("allows the per-location exception") that restates MC2 (the exception) and MC4 (deployment and recovery checks). |
| crossdoc-bailed-orp-jumping#2 | F3 | MN3 deleted | Omission of MC7 (record temperature, electrode and pH). |
| crossdoc-cold-water-hot-day-turbidity#2 | F3 | MN3 deleted | Omission of MC1 (qualifier). Claude. |
| crossdoc-do-calibrated-dry-deployed-brackish#1 | F3 | MN3 deleted | Omission of salinity, required by MC5, MC7 and MC8. |
| crossdoc-two-oxygen-tables-disagree#1 | F3 | MN1 deleted | Omission of the other table's value, required by MC1 and MC2. Codex rated it the one supplementary must-not. |
| deepmanual-sonde-settle-time#2 | F3 | MN3 deleted | Omission of channels, each required by MC1-MC5. |
| deepmanual-thermistor-annual-check#2 | F3 | MN3 deleted | Omission of MC4 (pre-trip check); the judges split on it. Both reviews. |
| followup-cleaning-the-salt-sensor#1 | F3 | MN4 deleted | Omission of MC3 (check the manufacturer first). Claude's lead example; Codex thought this veto more defensible, see "Severity" below. |
| followup-cleaning-the-salt-sensor#2 | F3 | MN3 deleted | Omission of MC2 (deionized-water rinse). |
| probecal-do-saturation-target#1 | F3 | MN2 deleted | Omission of barometric pressure, required by MC5 and MC6. |
| probecal-do-saturation-target#2 | F3 | MN3 deleted | Omission of the brackish half, required by MC3-MC5. |
| probecal-end-of-day-check#1 | F3 | MN2 deleted | Omission of MC2 (end-of-day check). |
| crossdoc-warm-week-oxygen-drop#1 | F3 | MN3 keeps "treats the brackish site as freshwater" and drops "skips the salinity correction entirely" | Keeps the commission, drops the omission already covered by MC5. |
| crossdoc-warm-week-oxygen-drop#1 | F4 | MC6 allows a conditional estimate labelled with its assumptions | It forbade "assigning 1 mg/L to warming" while MC3 requires the 0.99 mg/L drop as a conditional benchmark; the two points contradicted each other. Claude and Codex. |
| deepmanual-thermistor-annual-check#1 | F4 | MN1 rewritten as a plain prohibition | "Accepts two points here" read as an instruction, and pass 2 applied it backwards. Claude. |
| probecal-orp-standard-check#2 | F4 | MC2's manufacturer-guidance clause made optional | A scope condition the judge read as a required statement. Claude. |

## Left alone, and why

- **Core/supplementary split**: all three reviews say it is legitimate only when labelled blind to answers, ideally by an outside practitioner, and confirmed on fresh fixtures; not possible before September 30.
- **Follow-up turns that repeat turn 1** (for example precedence-turbidity#2 MC1 and MC3, definitional-required-versus-recommended#2 MC3): the reviews class these as supplementary, not flawed.
- **Corpus-inventory points in refusal rubrics**: also supplementary in the reviews; the answer contract's partial-answer rule allows that content, so it is not a contract conflict.
- **precedence-turbidity-groundwater-background-not-pod-limit#1 MC3 and #2 MC3**: Claude and Codex rated #2 MC3 unsupported by its excerpt, but it tests the system prompt's rule that turbidity is a relative index, which the model is given; kept.
- **Compound points** (for example crossdoc-sonde-sensor-order#1 MC3): a 2 needs every point either way, so splitting cannot change a 2; left as written.
- **crossdoc-cold-water-hot-day-turbidity#1**: the question never says the bench readings are turbidity (Claude). Fixing it changes question text and needs a re-capture; left for the user.
- **Judge errors** (for example refusal-how-long-can-it-stay-in#2 scored 0, deepmanual-do-air-calibration#1 MC3 marked unmet, followup-jumpy-temperature-trace#2 scored 2): these are judge behaviour under a calibrated prompt, not rubric defects; the judge prompt is unchanged so its kappa 0.849 still applies.
- **Answers the rubric is too lenient on** (probecal-end-of-day-check#1 "calibrate once before the first day", crossdoc-conductivity-rise-with-warming#2 "at least five points"): adding must-not items keyed on errors seen in answers would be answer-driven; the judge's "0 = is wrong" already covers them. Reported as judge leniency.

## Direction and severity

Every edit either removes a requirement or a veto, or leaves the requirement set unchanged, so v2 scores can only rise or stay level on the same answers, apart from judge noise.
The rule is symmetric, but no flawed point in this set made the rubric too lenient.
Removing F3 items lowers severity for eleven safety-flavoured omissions from 0 to at most 1; the most defensible to keep as a veto is followup-cleaning-the-salt-sensor#1 MN4 (acid on electrodes without the manufacturer check), which the user may restore as a deliberate exception.

## Fingerprint

`sha256sum *.json | sha256sum` in `eval/fixtures-wave1/`: v1 `b0b647f4ba6a54a3f812a508ef5f450f6d1e43e183858cf6d203ee2a8ea1f148`, v2 `144dd7f16a3e565d49a9dbac35f49335ab3fd4590db2e75e2738daf4bd6841f0`.
Labels (`eval/retrieval-labels/`) are unchanged: they do not read rubric text.
