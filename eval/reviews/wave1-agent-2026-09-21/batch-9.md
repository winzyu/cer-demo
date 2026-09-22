# Batch 9 - refusals and procedural obligations

Reviewed inline by the parent after `/root/batch2` hit its usage limit before submitting a complete report.
Preliminary worker findings were independently checked against source text; they are not counted as a second completed review.
ALK/T/SC/ORP/TBY/MP/FIELD abbreviate the corresponding USGS alkalinity, temperature, specific-conductance, ORP, turbidity, multiparameter and field-measurement PDFs.
EPA = `epa-sop-field-instrument-calibration-2010.pdf`; PROMPT = `src/prompt/systemPrompt.ts`.
Absence verdicts below mean supported by bounded corpus checks, not proof against every possible paraphrase or external source.

## refusal-buffering-capacity-not-measured - KEEP

- T1 MC1-2 supported by the deployment metric list at PROMPT:219-226 and ALK:56-66's acidimetric sample titration definition; the pod metrics do not establish titration-derived capacity.
- T1 MC3-4 supported: ALK:56-66 explicitly distinguishes alkalinity/ANC and filtered/unfiltered sample titration.
- T1 MC5 supported within search limits: all ALK conductivity occurrences concern method/handling/recording, while ALK:1294-1329 calculates capacity from acid volume, concentration and sample volume.
- T1 MC6 supported as an application-scoped alternative, not a source of missing alkalinity: PROMPT's pH capability does not establish a value or access to live readings in this offline test.
- T1 MN1/MN2/MN4/MN5 supported by the same measurement-versus-titration distinction; MN3 supported because ALK:1316-1320 identifies near-4.5 as a titration equivalence point, not an ambient pH alarm.
- T2 MC1-2 supported within bounded absence checks of ALK and SC; no pH/conductivity-only capacity estimator was found.
- T2 MC3 supported as a distinction about computation: ALK:368-371 uses conductivity below 100 to select Gran titration, and 575/609/650/682 uses it for procedural choices; ALK:595/671 also records it, so “only” should not deny recordkeeping.
- T2 MC4-5 supported: ALK:1294-1329 requires titrant/sample information; 1340 onward computes species using already-known alkalinity plus pH, not pH alone.
- T2 MN1/MN2/MN4 supported against unsupported conversion/estimation; MN3 supported against treating external contents as loaded evidence; MN5 supported because SC's general major-solute-estimation discussion does not provide this conversion.

Follow-up coherence and the substantive refusal are sound.
The empty source/citation lists encode unanswerability of the requested value, but not the positive explanatory material the rubric requires; this creates the shared gold-context blocker below.
KEEP is a source-validity verdict, not approval to grade this fixture under the unrepaired context/refusal contract.
Optionally narrow “conductivity only” to its role in the calculation, and avoid promising live record access with tools disabled.

## refusal-how-long-can-it-stay-in - EDIT

- T1 MC1 supported within searches: no maximum deployment lifetime establishing data validity was found.
- T1 MC2 contradicted as universal: T:660-674 gives ongoing verification for deployed sensors, EPA:162-164 covers continuous sondes, and TBY:2045-2067 covers continuous-monitor drift/fouling checks.
- T1 MC3 supported for TBY:1793-1797's explicit deferral, but overbroad if it asserts all deployed-sensor guidance is out of scope.
- T1 MC4 supported: TBY:930-933 gives roughly 2-4-week cleaning and more frequent cleaning with fouling.
- T1 MC5 supported because that passage describes cleaning, not deployment validity; MC6 supported as a bounded conclusion that deployment-specific validity must come from unavailable guidance/plan evidence.
- T1 MN1-5 supported against converting maintenance/recalibration intervals into a universal deployment lifetime or inventing one.
- T1 MN6 ambiguous/overbroad: a complete deployment-validity protocol is absent, but EPA/T/TBY do contain continuous-monitoring procedures.
- T1 MN7 supported: TBY:1795-1797 cites external guidance whose full contents are not loaded.
- T2 MC1-3 supported narrowly: no rule was found allocating how much of a month to retain, specifying drift per day/week, or retrospectively correcting the continuous record; EPA's qualification rule must not be denied.
- T2 MC4-5 supported: TBY:2060-2070 computes before/after-cleaning percent bias without supplying a numeric record-acceptance cutoff.
- T2 MC6 supported: EPA:162-164 and 583-612 give deployment/recovery checks, project criteria and fallback defaults.
- T2 MC7-8 supported as a distinction between instrument checking/data qualification and invented month-allocation rules; EPA:590-601 says failing data are qualified, not automatically discarded.
- T2 MN1 ambiguous if it forbids calling the EPA criteria drift criteria: EPA:584-593 explicitly measures drift during the measurement period and calls the comparison drift or post-calibration criteria.
- T2 MN2/MN4/MN6/MN7 supported against invented fouling cutoffs, month tolerances, unseen QAPP contents or invented retention allocations.
- T2 MN3 ambiguous if it rejects the actual source-supported use of pre/post-calibration differences to evaluate drift, rather than an invented per-day limit.
- T2 MN5 supported against an invented attributed qualification scheme, not against EPA's real qualification instruction.

Follow-up coherence is sound, but the source list is empty despite required positive EPA/TBY evidence.
Narrow the absence claim to no deployment lifetime, retrospective correction algorithm or month-retention rule in the reviewed corpus.
Accept the real continuous-monitor checks and the EPA drift terminology; do not describe the entire corpus as attended-only.

## refusal-temperature-harm-threshold - EDIT

- T1 MC1/MC3/MC4 supported within searches: no numeric fish-harm or configured temperature alarm was found; T:248-272 discusses applications/regulation without supplying such a threshold.
- T1 MC2 ambiguous/overbroad: T is a measurement method, but T:253-268 discusses biological activity, habitat assessment and thermal alterations; “no interpretation” should mean no requested numeric ecological verdict.
- T1 MN1-4 supported against importing external fish limits or confusing probe/verification temperature limits with ecological criteria.
- T1 MN5 supported against fabricating a threshold from a qualitative pattern; the notes' former source-of-truth premise is not current evidence.
- T1 MN6 supported against inventing a site/season baseline.
- T2 MC1 ambiguous if it means the corpus has no regulatory context: EPA:94-99 explicitly references methods listed in 40 CFR 136/141; defensible wording is that these sources do not provide the requested thermal water-quality criterion.
- T2 MC2 supported: EPA:94-101 defines field-instrument calibration scope.
- T2 MC3 contradicted as universal: ORP:635-658 is an interpretation section, ALK:74-77 discusses water-use/contamination/ecosystem meaning, and DO:338 onward discusses aquatic relevance.
- T2 MC4 supported as referral outside this corpus for the missing applicable criterion, not proof that a particular state criterion exists.
- T2 MC5 supported as the useful measurement-history alternative, but actual readings/timing must come from available data rather than invention.
- T2 MN1-5 supported against attributing external criteria/classifications/citations or inventing a hedged number.

The refusal and follow-up are coherent; broad justifications are factually wrong.
Replace “never say what the measurement means” with “do not supply the applicable numeric thermal-harm criterion for this site.”
Provide source evidence for the explanatory positives, and reconcile the exact-refusal contract below.

## refusal-turbidity-sensor-hardware - EDIT

- T1 MC1-2 supported within searches: the 14-file corpus has EC/ORP/DO/pH vendor sheets but no identified fleet turbidity sensor's manufacturer depth/pressure rating.
- T1 MC3 contradicted literally: TBY is the dedicated chapter, but FIELD:429-438, MP:385-388 and EPA §5.6 also provide turbidity information.
- T1 MC4-5 supported: TBY:1795-1797,2169 onward refers instrument-specific guidance to manufacturers; an unidentified depth rating cannot be derived from method ranges.
- T1 MN1-5 supported against sibling-sensor substitution, invented hardware ratings, generic-method-as-hardware assertions, averaging unrelated ratings, or inventing a datasheet.
- T2 MC1 supported for the two named nephelometric examples, ambiguous if exhaustive: TBY:418-423 and table 6.7-4 also include ratio/backscatter/attenuation/multibeam units.
- T2 MC2 supported for environmental interchangeability, qualified by TBY:424-427's equivalence on calibration standards.
- T2 MC3 supported: TBY:2085-2097 maps design/model/mode to units and codes.
- T2 MC4 supported within searches: no loaded source identifies this fleet's turbidity make/model.
- T2 MC5 supported for identifying optical-standard units from corpus alone, but contradicted as an answer about the application's displayed unit: PROMPT:219-221 explicitly says “turbidity (in NTU).”
- T2 MC6 supported: FIELD:437-439 and TBY:2085-2097 refer to an external spreadsheet not in the corpus.
- T2 MC7 supported for FIELD's general prevalence statement, ambiguous as evidence that this fleet's unit is probably FNU, and conflicts with the NTU application declaration.
- T2 MN1 ambiguous/overrestrictive: it must allow the explicitly application-declared NTU label without claiming known optical design or calibration.
- T2 MN2 supported against a universal conversion; MN3 supported against invented identity/codes; MN4 supported against deciding hardware from word frequency.

T1-to-T2 coherence is sound, but T2 must distinguish the application's label from unknown physical optical design and calibration.
Grade an answer that says the application labels the uncalibrated index NTU while hardware-standard equivalence remains unverified.
Alternatively make the question explicitly about a separate unidentified instrument and remove deployment-specific assumptions.
Replace “only turbidity source” with “dedicated turbidity chapter”; add positive source locators rather than treating the entire conversation as evidence-free.

## definitional-required-versus-recommended - KEEP

- T1 MC1 supported: SC:170-180 and FIELD:148-158 explain established USGS policy, technical review, following requirements and documenting/assuring departures.
- T1 MC2-3 supported: SC:182-191 and FIELD:160-169 recognize acceptable alternatives and require documented reasons.
- T1 MN1-2 supported by those distinct obligations; MN3 supported against inventing a third category or scoring system.
- T2 MC1-2 supported: SC:178-180 requires both documentation and independent quality assurance for departures.
- T2 MC3 supported: SC:188-191 applies the same expectation to recommended-procedure departures.
- T2 MN1 supported because a log entry alone omits assurance; MN2 supported against inventing a form/approval hierarchy; MN3 supported because justified departures are explicitly contemplated.

SC/FIELD support both complete answers and the source/citation entries; MP is supplementary.
Follow-up coherence is sound.
Attribute these as USGS protocol meanings rather than claiming every operator is legally bound by them.
The notes' predicted tie despite slice exclusion is an evaluation-design hypothesis, not a source-grounding result established by this review.

## Shared refusal context and response-contract blocker

All four refusal fixtures have empty `answerable_from` despite mandatory positive facts about specific documents.
`scripts/resolveRetrievalLabels.ts:154-156` explicitly assigns refusal fixtures no relevant chunks even when claims resolve.
`src/retrieval/adapters/GoldContextAdapter.ts:59-62` converts empty relevant labels into empty context.
PROMPT:227-233 then prescribes the exact refusal plus one sentence when relevant context is absent.
The fixtures require much longer substantive corpus explanations, and several turns also set `requires_refusal: true`.
This is a statically verified mismatch; no paid capture was performed.
Before using these fixtures to measure answer correctness, distinguish an unanswerable requested value from answerable explanatory context, generate per-turn labels for those positives, and decide how partial answers and refusal are represented.
This review does not change the generator, prompt, labels or fixtures.

## Checks and limits

Parent searched all 14 source texts in binary-safe mode for alkalinity/ANC/conductivity relationships, deployment/continuous monitoring/drift/fouling, fish/aquatic/thermal harm, hardware ratings, turbidity designs and procedural obligation terms.
Relevant ALK formulas and all conductivity occurrences, T deployed-sensor verification, TBY maintenance/bias/deployment/reporting passages, EPA calibration/qualification, ORP interpretation and SC/FIELD obligation definitions were inspected.
Absence claims remain scoped to the supplied corpus; no external spreadsheet, manufacturer identity, regulations or live pod state was consulted.
