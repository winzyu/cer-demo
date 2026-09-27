# Rubric strictness review: Claude

Reviewer: Claude (Anthropic), Opus 5.5, 2026-09-25.
Inputs: `PROMPT.md`, `SAMPLE.md` (all 16 turns, with excerpts) and `ALL_TURNS.md` (all 90 turns, read in full).
Same-family disclosure: the rubrics, the packet and this review all come from Claude.
I tried to offset that by checking every sampled rubric point against the excerpts rather than against the rubric's own framing, and by listing the evidence that cuts against relaxing the rubric as prominently as the evidence for it.
I read the answers before classifying the points, so my classifications are not blind; section 5 explains why that matters.

## 1. Verdict

Mixed, with medium confidence.
The rubric is over-specified for a scale where a 2 requires every point: in the sample, 27 of the 39 points the judge marked unmet are supplementary or flawed, and turns with 6 or more points never score 2.
But the model also has real gaps: about a dozen of the 90 answers contain substantive errors, and it regularly drops procedural requirements that matter in the field.
A core-only rescoring would probably land a little above 1.30, but my estimate rests on labels I made after seeing the answers, so it cannot count as a pass.

## 2. Per-turn table

C/S/F = core / supplementary / flawed `must_contain` points.
"Judge" is pass 1 / pass 2.
"Rubric" is my score under the rubric as written.
"Operator" is my score for the question as an operator would ask it.

| Turn | Points | C/S/F | Judge | Rubric | Operator | Reason |
|---|---:|:-:|:-:|:-:|:-:|---|
| crossdoc-cold-water-hot-day-turbidity#2 | 5 | 2/3/0 | 1/1 | 1 | 2 | Answers both questions correctly, with quotes; storage limits and time sensitivity were not asked. |
| crossdoc-sonde-sensor-order#1 | 7 | 3/2/2 | 1/1 | 1 | 2 | Correct order and a vague but correct rationale; point 3 is compound and point 5 repeats point 4 for one pair. |
| crossdoc-temp-sensor-drift-blast-radius#1 | 6 | 1/3/2 | 1/1 | 1 | 2 | Names the right channels; mechanisms are elaboration, and points 4-5 rely on facts absent from the gold excerpts; the quote was altered (see below). |
| crossdoc-two-oxygen-tables-disagree#1 | 6 | 2/3/1 | 1/0 | 0 | 0 | Says "use EPA" unconditionally, with an uncited claim about what the SOP directs; misses the point that 0.03 mg/L sits well inside ±0.2. |
| crossdoc-warm-week-oxygen-drop#1 | 6 | 3/1/2 | 0/0 | 0 | 0 | Read the 700 mmHg column as 760 (9.27 instead of 10.08), so the answer's temperature effect is 0.24 mg/L where the table gives about 1 mg/L; skips salinity at a brackish site. |
| deepmanual-diluting-clarity-standards#2 | 2 | 2/0/0 | 0/0 | 1 | 1 | Never mentions flocculation, the rule the excerpt gives; but it ends by advising discard, so the must_not reading that forces 0 is arguable. |
| deepmanual-do-air-calibration#1 | 5 | 4/1/0 | 1/1 | 1 | 1 | Misses the on-site barometer rule and the no-contact rule, both of which change the calibration; both judge passes wrongly marked the 10-15 minute point unmet. |
| deepmanual-do-saturation-ceiling#1 | 3 | 1/2/0 | 2/2 | 2 | 2 | Correct. |
| deepmanual-thermistor-annual-check#1 | 5 | 2/3/0 | 1/0 | 1 | 2 | Gives exactly what was asked (two points, 6 and 10 C); pass 2 applied must_not 1 backwards. |
| definitional-eh-versus-the-millivolts-we-log#1 | 4 | 3/1/0 | 0/0 | 0 | 0 | States the probe's mV is Eh, the exact confusion the question asks about. |
| definitional-eh-versus-the-millivolts-we-log#2 | 3 | 2/1/0 | 2/2 | 2 | 2 | Correct. |
| definitional-required-versus-recommended#2 | 3 | 2/1/0 | 1/1 | 1 | 2 | Answers the question exactly; the missing point is about recommended procedures, which turn 1 already covered. |
| precedence-turbidity-groundwater-background-not-pod-limit#2 | 5 | 3/1/1 | 1/1 | 1 | 1 | Declines correctly but opens with the refusal sentence, never says why 19 is not a criterion, and offers content it then does not give. |
| probecal-ec-never-recalibrate#1 | 5 | 4/1/0 | 2/2 | 2 | 2 | Correct; "(or periodically)" and no explicit "at the field site" make the 2 slightly lenient. |
| probecal-ph-what-solutions#1 | 5 | 3/1/1 | 1/1 | 1 | 2 | Thorough and correct; only buffer expiry is missing; point 2 restates point 1. |
| probecal-ph-what-solutions#2 | 4 | 3/1/0 | 1/1 | 1 | 2 | Right buffer pair, ±10 C and temperature-dependent buffer pH; "start with pH 7" was not asked and turn 1 already said it. |

Sample means: judge pass 1 1.00, my rubric score 1.00, my operator score 1.44.
The sample is stratified (3/10/3 against a population of 10/69/11), so these means are not population estimates; section 5 reweights them.

Notes the table cannot hold:

- **Rubric-as-written agreement.** My rubric scores match judge pass 1 on 14 of 16 turns; I differ on the two-tables answer (0, not 1) and on diluting (1, not 0).
- **An unflagged misquote.** In temp-sensor-drift#1 the model's quote adds "and ORP" to the EPA sentence; the source sentence names only pH, DO and specific conductance.
  ORP does appear in the next section of the same excerpt, so the claim survives but the quotation is fabricated.
  Neither judge pass noticed, because correctness does not score citation fidelity.
- **Points not supported by the gold excerpts.** temp-sensor-drift#1 points 4 (electrode slope) and 5 (reference-electrode potential for Eh) have no support in the ten excerpts.
  precedence-turbidity#2 point 3 ("relative, qualitative indicator") is not in its single excerpt either.
  This fits the disclosure that rubrics were written from extracted claims rather than chunk text.
- **Unreasonable must_not items.**
  thermistor-annual-check#1 must_not 1 packs an instruction ("accepts two points here") into a prohibition, and pass 2 read it as a violation.
  cold-water#2 must_not 3 and similar "omits X" items turn an omission into an automatic 0 (see pattern 5).
  warm-week#1 point 6 forbids assigning about 1 mg/L to warming, yet a conditional estimate ("if saturation was similar, expect about 1 mg/L before salinity correction") is what a competent expert would give, so I rate it flawed.
  The other sampled must_not items look reasonable.

## 3. Point-level totals (sample)

| Class | Points | Share |
|---|---:|---:|
| Core | 40 | 54% |
| Supplementary | 25 | 34% |
| Flawed | 9 | 12% |
| Total | 74 | |

Of the 39 points the pass-1 judge marked unmet, I rate 12 core, 19 supplementary and 8 flawed.
One of the 19 (do-air-calibration point 3) was actually met.
The 12 core misses fall in 8 turns; the other 5 turns the judge scored 1 have no core miss at all.

## 4. Patterns across all 90 turns

1. **Rubric size predicts the score.**
   Pass-1 mean by number of `must_contain` points: 3 points 1.35 (7 of 17 scored 2), 4 points 0.96, 5 points 1.04, 6 points 0.83, 7 points 0.83, 8 points 0.75.
   None of the 22 turns with 6 or more points scored 2.
   Answer length does not explain this: median length is 78 words for turns scored 2 and 95 for turns scored 1.
2. **Correct refusals are capped at 1.**
   The refusal fixtures carry 4-8 points each, most of them claims about the corpus (for example refusal-turbidity-sensor-hardware#1 point 3 "identifies USGS A6.7 as the dedicated turbidity method chapter", #2 points 5-7).
   Seven of the eight refusal answers refuse correctly, and all seven score 1 or 0.
   refusal-how-long-can-it-stay-in#2 scored 0 on both passes as "a refusal when the rubric expected a real answer", which conflicts with the fixture's own purpose; the scale's 0 definition ("refuses when content was expected") and the refusal rubrics pull against each other.
   precedence-do-hypoxia#2 and precedence-turbidity#2 show the same tension in the other direction: the model falls back on the refusal sentence where an explanation was wanted.
3. **Follow-up turns are penalised for not repeating turn 1.**
   probecal-do-saturation-target#2 loses the droplet check that was step 8 of its own turn-1 answer.
   definitional-required-versus-recommended#2 point 3, precedence-turbidity#2 point 1 and probecal-ph-what-solutions#2 point 2 are the same pattern.
4. **Hedge and escape clauses make points non-atomic.**
   67 of the 423 `must_contain` points contain clauses such as "without", "does not", "allows" or "rather than", and 35 contain semicolons; cross-document (23) and refusal (14) have the most.
   They read like patches added to handle edge cases, and they make a point hard to "make": probecal-orp-standard-check#2 fails an excellent answer on "follows manufacturer guidance for sealed or incompatible hardware", and followup-jumpy-temperature-trace#2 point 2 (the "conditional NWIS uncertainty rule") is hard to parse at all.
5. **Omission-type must_not items turn an omission into a 0.**
   Ten must_not items are of the form "omits X", "drops X" or "ignores X".
   followup-cleaning-the-salt-sensor#1 is a strong, correct answer scored 0/0 for not saying "check the manufacturer first"; deepmanual-thermistor-annual-check#2 was scored 0 on pass 1 for the same reason.
6. **Rationale and adjacent-fact points.**
   Many unmet points are a reason or a neighbouring fact the question did not ask for: deepmanual-ec-standard-choice#1 (why above 200 µS/cm), probecal-sonde-calibration-order#1 (ionic-strength rationale), deepmanual-zobell-check#1 and probecal-orp-standard-check#1 (430 mV at 25 C, when the answer correctly points to the temperature table), probecal-ph-slope-acceptance#1 (response time), definitional-what-per-centimetre-means#2 (the 1971 changeover).
7. **Against relaxing: the rubric often catches real omissions.**
   deepmanual-do-air-calibration#1 (on-site barometer), probecal-do-saturation-target#1 (leave the chamber loose), crossdoc-do-calibrated-dry-deployed-brackish#2 (deployment and recovery checks for continuously deployed sondes, which is what pods are), probecal-buffer-handling#2 (buffers stored in a truck need protection from heat and freezing).
   The model habitually answers only the literal question and stops, so some of what the rubric counts as omission is a genuine quality gap.
8. **Real errors that no rubric change touches.**
   crossdoc-warm-week-oxygen-drop#1 (misread table), definitional-eh-versus-the-millivolts-we-log#1 (Eh equals ORP), crossdoc-two-oxygen-tables-disagree#1 and #2 (#2 misstates the EPA chart as 730-760 mmHg and 40 C; it covers 690-760 mmHg and 45 C), probecal-end-of-day-check#1 ("calibrate once before the first day" under an SOP that requires daily calibration), crossdoc-conductivity-rise-with-warming#2 ("at least five" verification points; the manual says at least two and at most five), crossdoc-temp-sensor-drift-blast-radius#2 (daily temperature calibration and adjustment), crossdoc-bailed-orp-jumping#2 (the ZoBell 15-30 minute figure applied to field readings), deepmanual-diluting-clarity-standards#1 (opens "Yes, dilute" for bought standards), definitional-what-per-centimetre-means#1 (muddled cell-constant explanation), definitional-what-a-bare-tu-label-tells-us#1 (unsupported "interpret qualitatively" claim), probecal-end-of-day-check#2 (refuses the USGS half, for which the rubric expects the A6.4 ±0.05 pH figure; I could not check that turn's excerpts).
9. **Judge errors run both ways.**
   Too harsh: thermistor-annual-check#1 pass 2, crossdoc-soft-water-ph-wont-settle#2 (fails a correct answer for omitting "at calibration temperature"), deepmanual-do-air-calibration#1 (met point marked unmet), deepmanual-turbidity-rounding#1 pass 1 (no table name), probecal-end-of-day-check#2 ("up to" read as not "plus or minus"), refusal-how-long-can-it-stay-in#2, precedence-do-hypoxia#2 pass 2.
   Too lenient: followup-jumpy-temperature-trace#2 (2 for one sentence that makes none of points 2-3), crossdoc-two-oxygen-tables-disagree#2 (factual error scored 1), crossdoc-conductivity-rise-with-warming#2 (the "at least five" error passes unremarked), the misquote above.
   Net effect on the mean looks small, but it adds per-turn noise; the two passes disagree on 6 of 90 turns.
10. **Citation compliance is unmeasured.**
    26 answers that do not refuse carry no citation marker at all, despite the answer prompt, and one quotation is altered.
    That is a product risk that correctness scoring does not see.
11. **Question ambiguity is rare but present.**
    crossdoc-cold-water-hot-day-turbidity#1 never says the bench readings are turbidity; the model reasonably answered about temperature and the rubric assumes turbidity.

## 5. Goalpost analysis

### What separates a correction from goalpost moving

A correction is principled when all of these hold:

- the rule for what counts as core is written down before anyone rescoring can see answers or scores, and it is derived from the question and the excerpts, not from what the model tends to omit;
- it is applied to every turn, including changes that lower scores (lenient 2s, errors the judge missed, core points the rubric lacks);
- fixes for validity (unsupported, compound, duplicate or instruction-like points) are separated from the core/supplementary split and justified point by point;
- the pre-registered metric stays the reported primary result, and anything new is labelled secondary, with its own bar fixed before it is computed.

It becomes goalpost moving when the split is judged by whether it gets the number over 1.30, when the person labelling has seen the scores, or when the new metric replaces the old one in the headline.

### Is 1.30 still meaningful?

As a test, yes: it was fixed before the numbers existed, it was run, and it failed (1.01 on both passes).
As a measure of answer quality it is weak, because the strictness of a 2 was set later by the rubric author through the number of points per turn (4.7 on average, all required).
The packet does not say what rubric shape the 1.30 bar was calibrated against; if the July rubrics had fewer points per turn, that would show the bar and the instrument drifted apart.
Neither fact licenses a new bar chosen after seeing results; it licenses reporting the failure together with the instrument caveat.

### If a split is justified: rule, raters, blinding

Rule, fixed in writing before labelling:

- **Core**: without it, the question as asked is not answered, or an operator acting on the answer could take a wrong or unsafe action or file a wrong record.
- **Supplementary**: correct and useful but not needed for that, including rationale when the question did not ask why, source or table attribution, facts already stated in an earlier turn, and neighbouring requirements the question did not touch.
- **Flawed**: not supported by the gold excerpts, compound (more than one checkable claim), a duplicate of another point, or a grading instruction phrased as a claim.
- Safety tie-break: when unsure between core and supplementary, choose core.

Procedure:

1. Build a labelling sheet per turn with the question, the earlier turn (question only), the gold excerpts and the rubric points, with no answers, judge notes or scores.
2. Two raters label every point: one external field practitioner who has not seen this evaluation, plus the project owner or a model from a fourth family.
   The owner has already seen answers, so the owner's labels should be tie-breaks, not primary labels.
3. Report agreement (Cohen's kappa) before resolving disagreements; if kappa is below about 0.6, the rule is not reproducible and the split should not be used.
4. Freeze the labels (commit and hash) before any rescoring.
5. Rejudge with the existing judge prompt plus a core-only instruction, and rejudge the unchanged rubric in the same run, so judge drift is measured.
6. Pre-register the secondary bar now, before step 5 (for example core-only mean ≥ 1.30 overall and ≥ 1.00 per class, or a per-point core coverage rate).
7. Validate on fresh fixtures whose authors label core points at writing time, and treat that as the confirmatory test.

### What the split would probably show

Reweighting my sample to the population strata, a core-only score comes out at about 1.4 (1.35-1.5 depending on two borderline turns), and my operator score at about 1.5.
With only 10 sampled turns in the largest stratum, the 90% range runs from roughly 1.1 to 1.7.
So a split would likely, not certainly, clear 1.30, and the answer would depend on the core rule, which is exactly why the rule must be fixed and applied blind.
Cross-document (0.83 now) is the class most likely to stay below 1.00 per class.

### What to report under each option

- **Keep the rubric**: "Gold-context correctness 1.01 on both judge passes against a pre-registered bar of 1.30: fail. Caveat: a 2 requires every one of 4.7 points on average; no turn with 6 or more points scored 2."
- **Add a core/supplementary split**: report the line above first and unchanged; then "Secondary, not pre-registered in July: core-only correctness X against a bar of Y fixed on date Z, before rescoring; labels by raters blind to answers, kappa K; N points reclassified; M turns went down."
- **Fresh fixtures**: "Confirmatory test on new fixtures with core points labelled at authoring: X against bar Y." Only this outcome should be described as the system passing.
- In every option, report the error count (pattern 8) and citation compliance (pattern 10) next to the mean, so a reader does not take a relaxed mean as evidence that the answers are safe.

## 6. Other explanations, ranked

1. **Rubric granularity with an all-or-nothing 2**: the largest contributor.
   Evidence: the score gradient by point count, 27 of 39 unmet sample points being supplementary or flawed, and 5 of the 10 sampled turns scored 1 having no core miss.
   It also weakens the "prompt lever exhausted" reading, because a ceiling in the metric would flatten prompt gains too.
2. **Model answer habits**: a large and real contributor.
   gpt-oss-120b at default effort answers the literal question tersely (26 words for the thermistor answer, 22 for required-versus-recommended#2, 37 for sonde order), omits rationale, drops adjacent procedural requirements, skips citations in 26 answers and falls back on the refusal sentence in precedence follow-ups.
   Some of this is a product defect, not rubric strictness; the high-effort capture should test it.
3. **Genuine model errors**: about 12 of 90 turns, many of them now scored 1 rather than 0.
   These cap the achievable mean whatever the rubric, and several involve reading numeric tables from the PDF text.
4. **Fixture design for refusal and precedence classes**: moderate.
   Refusal rubrics require an inventory of the corpus that a correct refusal rarely gives, and the scale's own 0 definition penalises refusing.
5. **Excerpt quality (fixture difficulty)**: small to moderate.
   The USGS solubility table arrives one value per line, which is how warm-week#1 read the 700 mmHg column as 760; the EPA excerpts have OCR noise.
6. **Judge strictness**: small net effect on the mean, errors in both directions (pattern 9), but enough noise that differences under about 0.1 are not interpretable.
7. **Question ambiguity**: small; one clear case in 90 turns.
8. **Answer prompt**: probably small, but the plateau evidence is confounded by the metric ceiling, so I would not call it exhausted.

## 7. What I would do next

- Report 1.01 as a failed pre-registered test with the granularity caveat, and do not re-baseline 1.30.
- Repair the rubric's validity problems (unsupported, compound and duplicate points, omission-type must_not items, the refusal-class conflict with the 0 definition) as a separate, logged change applied to all 90 turns whichever way it moves scores; then rejudge.
- Run the blind core/supplementary labelling in section 5 with an external practitioner, pre-register the secondary bar before rescoring, and confirm on fresh fixtures.
- Track substantive errors and citation fidelity (including altered quotes) as their own metrics, since they are the operator risk and are unaffected by strictness.
- Use the high-effort capture to separate answer habit from capability: if completeness on core points rises sharply, the gap is behaviour, not rubric.

## 8. Limits

- I share a model family with the rubric author and the packet author, and I read the answers before classifying points, so my core/supplementary labels are the unblinded kind section 5 warns against.
- I checked excerpt support only for the 16 sampled turns; `ALL_TURNS.md` has no excerpts, so my pattern claims about support elsewhere are unverified.
- I am not a field hydrologist, and my operator scores come from one rater.
- I did not see the judge prompt, the July pre-registration context or the rubric history, so I cannot tell whether the hedge clauses were added after earlier judge disagreements.
- The sample has 10 turns in the stratum that decides the question, so every population estimate here has a wide interval.
- What would change my mind: blind raters labelling most unmet points as core (then the rubric is sound and the model is short); a practitioner's operator-view scores near 1.0; or a core-only score on fresh fixtures below 1.30.
