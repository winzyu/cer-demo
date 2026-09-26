# codex-review-packet

Independent review of the packet at `eb7e69a49e511508251d24d66b60ed65608fd636`, dated 2026-09-25.
Reviewed [PROMPT.md](PROMPT.md), all 16 sampled turns and their supplied excerpts in [SAMPLE.md](SAMPLE.md), and the questions, rubrics, answers and verdicts for all 90 turns in [ALL_TURNS.md](ALL_TURNS.md).
Source references below identify the turn and its numbered excerpt in SAMPLE; references to unsampled turns identify entries in ALL_TURNS.

## 1. Verdict

**Mixed, with medium confidence:** the rubric often makes supplementary explanation a condition of full credit, contains several evidence or wording defects, and is applied inconsistently, but the answers also contain consequential mistakes and omissions that a principled revision should continue to penalize.
The original evaluation fails its registered gates; a corrected instrument is justified, but its results would be a separately versioned, exploratory analysis until validated on fresh, blinded material.

## 2. Per-turn table

`C`, `S` and `F` mean core, supplementary and flawed under the packet's definitions.
Counts in this table cover the original numbered `must_contain` entries, not a newly atomized set of claims.
The detailed audit below classifies every `must_contain` and `must_not` entry.
Some entries combine claims of different importance; I explain those cases rather than silently changing the denominator.

The judge column gives pass 1 / pass 2.
My rubric score retains the published requirements, including requirements I consider defective, and accepts genuine semantic equivalence rather than demanding repeated wording.
My operator score uses 2 for a correct, sufficiently complete response to the actual question, 1 for useful but incomplete or qualified guidance, and 0 for a materially wrong decision or answer to the central question.
It is my assessment of the written answer, not a grade supplied by a practicing operator.

| Turn key | MC points | C / S / F | Judge | My rubric score | My operator score | Reason |
|---|---:|---:|---|---:|---:|---|
| crossdoc-cold-water-hot-day-turbidity#2 | 5 | 2 / 3 / 0 | 1 / 1 | 1 | 2 | Answers reporting and collection; storage instructions concern an additional contingency. |
| crossdoc-sonde-sensor-order#1 | 7 | 3 / 4 / 0 | 1 / 1 | 1 | 1 | Gives the usual sequence but omits its consequential two-point DO exception. |
| crossdoc-temp-sensor-drift-blast-radius#1 | 6 | 1 / 3 / 2 | 1 / 1 | 1 | 1 | Overstates the pod configuration; two demanded mechanisms lack supporting excerpts. |
| crossdoc-two-oxygen-tables-disagree#1 | 6 | 1 / 5 / 0 | 1 / 0 | 1 | 1 | Gives a useful EPA-specific principle but assumes the governing protocol. |
| crossdoc-warm-week-oxygen-drop#1 | 6 | 4 / 2 / 0 | 0 / 0 | 0 | 0 | Misreads table columns and presents an unsupported causal remainder. |
| deepmanual-diluting-clarity-standards#2 | 2 | 2 / 0 / 0 | 0 / 0 | 0 | 1 | Conditional discard advice helps, but the proposed reuse test omits flocculation. |
| deepmanual-do-air-calibration#1 | 5 | 5 / 0 / 0 | 1 / 1 | 1 | 1 | Omits no-contact and pressure-source safeguards in a requested setup procedure. |
| deepmanual-do-saturation-ceiling#1 | 3 | 2 / 1 / 0 | 2 / 2 | 2 | 2 | Correct, attributed answer to the specified table lookup. |
| deepmanual-thermistor-annual-check#1 | 5 | 2 / 3 / 0 | 1 / 0 | 1 | 2 | Provides the manual's valid two-point example for the stated range. |
| definitional-eh-versus-the-millivolts-we-log#1 | 4 | 3 / 1 / 0 | 0 / 0 | 0 | 0 | Incorrectly equates the probe's raw voltage with hydrogen-referenced Eh. |
| definitional-eh-versus-the-millivolts-we-log#2 | 3 | 2 / 1 / 0 | 2 / 2 | 2 | 2 | Correctly explains absence from the routine stabilization table. |
| definitional-required-versus-recommended#2 | 3 | 2 / 1 / 0 | 1 / 1 | 1 | 2 | Fully answers whether logging a required-procedure departure is sufficient. |
| precedence-turbidity-groundwater-background-not-pod-limit#2 | 5 | 3 / 1 / 1 | 1 / 1 | 1 | 1 | Safely declines a threshold but fails to explain why 19 is not one. |
| probecal-ec-never-recalibrate#1 | 5 | 4 / 1 / 0 | 2 / 2 | 1 | 1 | No explicit on-site verification; “or periodically” weakens the required cadence. |
| probecal-ph-what-solutions#1 | 5 | 4 / 0 / 1 | 1 / 1 | 1 | 1 | Sound buffer selection, but expiry is omitted; the one-point ban duplicates the minimum. |
| probecal-ph-what-solutions#2 | 4 | 3 / 1 / 0 | 1 / 1 | 1 | 1 | Correct pair and temperature window; does not ensure the adjusted buffer value is used. |

### Point-by-point audit

`MC` and `MN` refer to the original numbered must-contain and must-not entries.
For MN entries, classification evaluates the prohibition and whether it deserves its automatic-zero role.
A safety prohibition may legitimately restate an MC requirement to specify its severity; that is different from counting the same positive proposition twice as separate coverage.

#### crossdoc-cold-water-hot-day-turbidity#2

| Point | Class | Assessment |
|---|---|---|
| MC1 | C | The qualifier and estimated-subsample comment directly answer what must accompany the report; excerpt [2] supports both. |
| MC2 | S | Enumerating the other affected parameters is useful context, but is not necessary to answer the intended turbidity reporting question. |
| MC3 | C | The question explicitly asks about collecting from the flow-cell outlet; excerpt [7] prohibits it. |
| MC4 | S | Excerpt [5] supports all storage conditions, but the question does not say measurement will be delayed or off-site. |
| MC5 | S | On-site measurement is a useful recommendation from [5], but the operator asks what to do if reporting a bench result becomes necessary. |
| MN1 | C | Authorizing the explicitly prohibited outlet sample would give the wrong collection instruction. |
| MN2 | C | Invented storage limits would misdirect handling if the answer elects to give that advice. |
| MN3 | C | The reporting qualifier is the direct subject of the question, so omitting it can defeat the central reporting decision. |

Both judges correctly assign 1 under the written rubric.
For the operator question I assign 2 because the answer supplies the qualifier and a separate collection point, and includes the manual's explicit prohibition.
“Not recommended” is weaker than the source's wording, but the quotation and final instruction resolve the direction; I would tighten that wording without treating the answer as permission to use the outlet.
The fixture is ambiguous: neither user question actually names turbidity, and the earlier answer discusses temperature.
The per-parameter reporting and collection instructions should be evaluated against that ambiguity, rather than assuming the fixture filename is visible to the operator or model.

#### crossdoc-sonde-sensor-order#1

| Point | Class | Assessment |
|---|---|---|
| MC1 | C | Whether order matters and temperature comes first is part of the requested sequence; [6] supports it. |
| MC2 | C | Conductivity before pH is an actionable contamination precaution, supported by [4] and [6]. |
| MC3 | C | Completing the relevant sequence and handling two-point DO last are necessary qualifications; [3] supplies the exception. |
| MC4 | S | The ionic-strength explanation is valuable, but a correct sequence with a contamination explanation can answer the question without this terminology. |
| MC5 | S | The specific pH-buffer mechanism elaborates the already required ordering decision and general contamination rationale. |
| MC6 | S | Triple rinsing is required when performing calibration, but this question asks about sequence rather than requesting a complete calibration recipe. |
| MC7 | S | Pre-field-use cadence is true and useful, but is not what determines the order in this question. |
| MN1 | C | Calling the order arbitrary directly contradicts the requested procedural guidance. |
| MN2 | C | Putting pH first creates the carryover problem the sources identify. |
| MN3 | C | Fabricating an actionable rinse count or procedural step is unacceptable; an actual supported alternative must not be called invented. |
| MN4 | C | General guidance does not displace parameter-specific instructions, explicitly stated in [6]. |

MC3 is not atomic: optional sensor families are supplementary for a pod without those sensors, while the sodium-sulfite exception changes the relevant procedure.
My core classification reflects the consequential part of that bundle, not a requirement to recite sensors the operator does not have.
Both judges' score of 1 is appropriate, but their notes exaggerate the omission: the answer explicitly supplies pH, DO, ORP and turbidity in order.
It lacks the tail and exception, not the whole remaining sequence.
The operator score stays 1 because an unqualified general order could mislead a novice performing a two-point DO calibration.

#### crossdoc-temp-sensor-drift-blast-radius#1

| Point | Class | Assessment |
|---|---|---|
| MC1 | C | The affected channels and the condition that they actually rely on this sensor are the central answer; the EPA general discussion in [1] supports conditional dependence. |
| MC2 | S | The conductivity calculation explains why that channel matters but is more detail than needed to identify the affected channels. |
| MC3 | S | The DO signal-to-concentration mechanism is supported by [7], but is explanatory detail beyond the channel-identification question. |
| MC4 | F | The supplied pH excerpt [9] discusses buffer checks and temperature sensing but does not supply the requested electrode-slope explanation. |
| MC5 | F | These ten excerpts contain no A6.5 reference-electrode correction passage establishing the requested corrected-Eh versus raw-ORP mechanism. |
| MC6 | S | Physical separation of the sensors is supported by [9], but does not determine whether a channel uses this temperature input. |
| MN1 | C | Denying all effects on channels that use the sensor would answer the central question incorrectly. |
| MN2 | C | No channel-specific numerical error can be inferred from the stated temperature error alone. |
| MN3 | C | Operating ranges do not establish compensation dependence and would not answer the question. |

The MC4 and MC5 classifications concern support in this turn's excerpts, not a claim that these scientific mechanisms are false.
The needed pH-slope passage appears elsewhere in SAMPLE, in `probecal-ph-what-solutions#1` excerpt [1], and the Eh correction appears in `definitional-eh-versus-the-millivolts-we-log#1` excerpts [6]-[7].
Their presence elsewhere in the packet does not mean this answer model received them for the drift turn.
MC1's broad conditional channel list is defensible, but its more specific corrected-Eh terminology also needs the evidence repair identified for MC5.

Both rubric scores of 1 remain defensible, but the judges overlook a central qualification failure.
The answer assumes automatic correction and a separate, unaffected turbidity instrument for this pod from a protocol's scope statement.
Its quotation of [1] also inserts ORP into the sentence listing automatically corrected readings; the actual scope sentence lists pH, DO and specific conductance, while a later paragraph discusses probes that rely on temperature, including ORP.
That is a grounding defect independent of rubric verbosity.
The operator score is 1 because identifying potentially affected channels is useful, but the answer does not establish the actual pod configuration or distinguish raw ORP from calculated Eh.

#### crossdoc-two-oxygen-tables-disagree#1

| Point | Class | Assessment |
|---|---|---|
| MC1 | S | The USGS numerical value is useful to illustrate the difference, but protocol selection can be answered correctly without repeating it. |
| MC2 | S | The EPA numerical value has the same supplementary role. |
| MC3 | S | Quantifying and contextualizing the difference helps explain the choice but is not required to tell the operator which protocol governs. |
| MC4 | S | The Benson and Krause provenance is supported by [5], but does not decide which contractual procedure applies. |
| MC5 | S | The performance-check comparison is useful reassurance, not a necessary step in choosing the applicable protocol. |
| MC6 | C | Use the table belonging to the applicable procedure consistently; the question does not identify which procedure governs. |
| MN1 | S | Acknowledging both sources improves the comparison, but omission of one should not automatically erase otherwise correct protocol-selection guidance. |
| MN2 | C | Claiming the difference necessarily prevents measurement would assert an unsupported operational consequence. |
| MN3 | C | Any solubility values supplied must be supported. |
| MN4 | C | Averaging the tables would invent a third reference instead of following the applicable procedure. |

Excerpts [1] and [6] support 9.06 and 9.09 mg/L, and [4] supplies the USGS saturation-performance check.
Most numerical and provenance detail is supplementary for this wording of the question; it would become core if the question asked for the numerical comparison and its significance.
My rubric score is 1 because the answer partially expresses protocol dependence through its EPA-specific explanation, although its opening selects EPA without establishing that EPA governs.
Pass 2's zero is a plausible stricter reading of that omission, rather than a clear factual grading error like the thermistor case.
No MN violation is established merely by failing to give either numerical value.
The operator score remains 1: a more complete answer would make the recommendation conditional on the governing procedure.

#### crossdoc-warm-week-oxygen-drop#1

| Point | Class | Assessment |
|---|---|---|
| MC1 | S | The 15 C endpoint is a useful intermediate value; an accurate, qualified change can be communicated without separately listing it. |
| MC2 | S | The 20 C endpoint has the same intermediate role. |
| MC3 | C | A numerical benchmark with explicit equilibrium and pressure assumptions addresses the requested magnitude without claiming causal attribution. |
| MC4 | C | Pressure dependence prevents applying the freshwater benchmark as an unconditional site value. |
| MC5 | C | The site is explicitly brackish, so ignoring salinity undermines the comparison. |
| MC6 | C | The observations alone do not identify the warming contribution or a site-specific causal remainder. |
| MN1 | C | Unsupported numbers and unstated changes of table conditions directly corrupt the requested comparison. |
| MN2 | F | As an automatic-zero rule it can punish a justified explanation that the requested attribution cannot be calculated from the available inputs; incompleteness is not automatically fabrication. |
| MN3 | C | Treating this explicitly brackish site as freshwater without qualification is materially wrong. |

Both zero scores are warranted regardless of any rubric simplification.
In excerpt [4], 9.27 belongs to the 15 C / 700 mmHg cell, and 9.03 belongs to the 20 C / 755 mmHg cell.
The answer labels both as 760 mmHg and subtracts values from different pressure columns.
At 760 mmHg, the supplied table gives 10.08 and 9.09, a difference of 0.99 mg/L.
The answer then treats its erroneous difference as the actual warming contribution and reports a residual near 1.2 mg/L without adequate salinity, pressure or saturation assumptions.
Calling this only a failure to reproduce the rubric would miss the main problem.
Pass 1's description of 9.03 as the “correct” 20 C solubility is misleading: it falls within the rubric's loose 9.0-9.1 range but is not the table cell the answer claims to use.

#### deepmanual-diluting-clarity-standards#2

| Point | Class | Assessment |
|---|---|---|
| MC1 | C | Excerpts [3]-[4] explicitly prohibit flocculated calibrants; visible settled material makes the distinction relevant. |
| MC2 | C | Expiry, storage and distinguishing ordinary settling from flocculation determine whether reuse is permissible. |
| MN1 | C | An unqualified remix-and-use route omits a directly relevant exclusion. |
| MN2 | C | An invented recovery time, shelf life or inversion count cannot establish validity. |
| MN3 | C | Routine remixing does not override the stated shelf-life and flocculation restrictions. |

MC2 bundles several decisions and repeats MC1's flocculation exclusion; it should be decomposed and deduplicated, while preserving those substantive safeguards.
The year-long stock stability and 25 inversions are actually present in excerpts [1] and [3], so they are not invented numbers.
Their applicability depends on what is in this particular bottle; the conversation does not establish that it is the undiluted 4,000-unit stock.
Both judges correctly apply the written MN1 rule and assign 0.
I assign operator 1 because the final recommendation to discard an uncertain, truck-stored bottle is useful and conservative, but the conditional reuse advice is incomplete and potentially misleading.
This is not a candidate for full credit merely because most of the answer is cautious.

#### deepmanual-do-air-calibration#1

| Point | Class | Assessment |
|---|---|---|
| MC1 | C | The requested setup requires saturated air and an identified way to create it. |
| MC2 | C | Avoiding contact with the wet material is an explicit setup safeguard in [1]. |
| MC3 | C | Saturation and thermal stabilization before calibration are necessary setup conditions. |
| MC4 | C | The correct pressure input matters to the calibration calculation, with the source requirement explicit in [2]. |
| MC5 | C | The comparison, applicable tolerance and repeat action answer how the operator knows calibration worked. |
| MN1 | C | Inventing setup timing or acceptance tolerance changes the requested procedure. |
| MN2 | C | Immersion would not be this air-calibration setup; a separately identified zero-solution check is permitted. |
| MN3 | C | Uncorrected weather-service pressure is specifically prohibited by [2]. |

Both score-1 judgments are appropriate because MC2 and MC4 are missing.
Their treatment of MC3 is too coarse: the answer explicitly gives 10-15 minutes and temperature stabilization, though it does not separately say to turn on and warm up the DO probe.
That point is at least substantially met; scoring it as a wholly absent setup step exaggerates the omission count.
The rubric also misses source requirements that can matter more than that wording difference, including drying droplets and maintaining ambient pressure with a loose fit.
The answer makes the zero-solution check optional even though the supplied EPA procedure lists it as a step, another matter for a genuine procedural-completeness audit.

#### deepmanual-do-saturation-ceiling#1

| Point | Class | Assessment |
|---|---|---|
| MC1 | C | The exact value and units are the requested answer. |
| MC2 | C | The user explicitly requests a particular table, so correct attribution establishes that the requested source was used. |
| MC3 | S | Repeating the freshwater scope helps prevent later misuse, but the question already fixes it and does not ask for a brackish-water adjustment. |
| MN1 | C | An incorrect table value defeats the lookup. |
| MN2 | C | A probe datasheet cannot establish the requested table's solubility value. |

Both judges correctly give 2.
The answer's “USGS table” plus the citation to the supplied table is adequate attribution; spelling out the complete publication name again is unnecessary.
The freshwater wording reasonably entails that the value is not a saline-water correction.
This demonstrates the semantic credit that should also be applied consistently elsewhere.

#### deepmanual-thermistor-annual-check#1

| Point | Class | Assessment |
|---|---|---|
| MC1 | C | The number of points is explicitly requested. |
| MC2 | S | The extrema rule explains the selection, but the operator can correctly perform the requested check using a valid stated point set. |
| MC3 | S | The mean rule has the same explanatory role for this particular example. |
| MC4 | C | The actual verification temperatures are explicitly requested; [3] supplies this exact example. |
| MC5 | S | The five-point maximum concerns the broader procedure and does not affect this two-point case. |
| MN1 | C | Unsupported mandatory counts should be rejected, but this entry explicitly accepts two points when the rules are met. |
| MN2 | C | A single point would not meet the annual range-verification procedure. |
| MN3 | C | A proposed set must satisfy the applicable placement and spacing conditions. |

Pass 1 is correct under the written rubric and pass 2 is wrong.
The answer quotes the source's minimum and gives the very 6 C / 10 C example accepted by MC4 and MN1.
It does not demand exactly two points for every annual verification scenario.
The operator score is 2 for the idealized 4-12 C example given by the manual, assuming its 8 C mean.
A real site with a different annual mean needs a corresponding check of the chosen points; the fixture should make that assumption explicit rather than punish the accepted example.

#### definitional-eh-versus-the-millivolts-we-log#1

| Point | Class | Assessment |
|---|---|---|
| MC1 | C | The reference scale is essential to deciding whether the numbers are interchangeable. |
| MC2 | S | The detailed metal-water interface definition is useful background but not needed to explain the reference conversion. |
| MC3 | C | Raw reference-relative voltage is not automatically hydrogen-referenced Eh. |
| MC4 | C | Adding the appropriate reference potential explains how the quantities relate; [6]-[7] support it. |
| MN1 | C | Interchangeability is exactly the erroneous inference the question asks the assistant to resolve. |
| MN2 | C | The hardware-specific offset cannot be invented. |
| MN3 | C | A generic datasheet definition that never identifies the reference scale leaves the central distinction unanswered. |

Both zero scores are correct, including on an operator standard.
The answer initially states the hydrogen reference, then incorrectly tells the user the probe value corresponds to Eh.
Removing the supplementary electrode-interface definition does not repair that error.

#### definitional-eh-versus-the-millivolts-we-log#2

| Point | Class | Assessment |
|---|---|---|
| MC1 | C | Eh's non-routine status explains the scope of the table. |
| MC2 | C | Explicitly connecting that scope to the missing entry answers the question. |
| MC3 | S | Listing all other routine parameters is useful orientation but unnecessary to explain the omission. |
| MN1 | C | An invented Eh row or unsupported waiting time would falsely extend this table. |
| MN2 | C | Table exclusion does not establish that the equipment cannot measure the quantity. |
| MN3 | C | Non-routine status does not make the measurement worthless. |

Both scores of 2 are appropriate for this turn.
The phrase “in the same way” matters: the answer need not be read as permission to ignore Eh equilibration altogether.
I would nevertheless prefer an explicit pointer to A6.5's separate procedure.
The earlier false equivalence between raw ORP and Eh remains an unresolved conversation-level failure; a correct follow-up score does not erase it.

#### definitional-required-versus-recommended#2

| Point | Class | Assessment |
|---|---|---|
| MC1 | C | Documentation is one required part of managing the departure. |
| MC2 | C | Independent quality assurance is the additional requirement the user asks about. |
| MC3 | S | The analogous rule for recommended procedures is supported by [1], but the current question specifically concerns a required procedure. |
| MN1 | C | Saying the log alone is enough would reverse the answer. |
| MN2 | C | An invented approval process could impose or substitute an unsupported procedure. |
| MN3 | C | A blanket prohibition on departures contradicts the documented exception process. |

Both judges correctly give 1 under the existing rubric, but the answer deserves operator 2.
This is the clearest sampled example of a complete answer being held below full credit solely for omitting adjacent material.
The earlier conversation already discussed the two categories; forcing repetition in this follow-up is particularly hard to justify.

#### precedence-turbidity-groundwater-background-not-pod-limit#2

| Point | Class | Assessment |
|---|---|---|
| MC1 | S | Repeating the 19-unit observation and adding the contaminated-groundwater comparison is useful background, already partly supplied in turn 1. |
| MC2 | C | Observation versus recommendation is the precise mistaken inference to correct. |
| MC3 | F | The sole supplied excerpt does not establish that this pod's measurement is an uncalibrated qualitative index with no numeric pass/fail band. |
| MC4 | C | The answer must not imply knowledge of an existing pod threshold that was not supplied. |
| MC5 | C | The observation does not justify adopting 19 or another invented alarm threshold. |
| MN1 | C | Endorsing 19 as the pod threshold makes the unsupported decision proposed by the user. |
| MN2 | C | The excerpt reports an observation, not a recommended criterion. |
| MN3 | C | Substituting an invented threshold does not solve the evidence problem. |
| MN4 | C | The contaminated-groundwater statement supplies no numerical boundary. |

Both judges correctly give 1: the response establishes unavailable configuration and declines adoption, but does not explain the observational nature of 19.
The operator also gets only partial help because the underlying misconception remains uncorrected.
MC3 may reflect a separate application policy, but the packet does not include that policy among the model's excerpts for this turn.
The same excerpt discusses quantitative turbidity reporting and stability, so it cannot by itself establish a blanket qualitative-only rule.
This should be repaired by supplying and attributing the application policy, if applicable, and separating it from claims about turbidity generally.

#### probecal-ec-never-recalibrate#1

| Point | Class | Assessment |
|---|---|---|
| MC1 | S | Acknowledging stable hardware reconciles the vendor wording, but the actionable check-and-recalibrate rule can answer the question without repeating the manufacturer's claim. |
| MC2 | C | The pre-trip check requirement directly answers whether the station may rely indefinitely on its first calibration. |
| MC3 | C | On-site verification before measurement is separately required and explicitly supported by [8]. |
| MC4 | C | The acceptance criterion determines whether the check passes. |
| MC5 | C | The action after a failed check completes the operational decision. |
| MN1 | C | Declaring all future verification unnecessary would defeat the reporting station's QA process. |
| MN2 | C | A hardware interval does not replace field verification. |
| MN3 | C | Invented acceptance limits would change which data are accepted. |

Both judges are too generous in awarding 2.
The answer does not say to verify at the field site before measurements; its quoted requirement is pre-trip, and its summary says before deployment “or periodically.”
Those are not equivalent to the explicitly required on-site check.
It also calls a must-check rule a recommendation, although the citation reproduces “must.”
My rubric and operator scores are both 1.
This error matters because it shows the judge is not simply imposing a uniformly harsh standard.

#### probecal-ph-what-solutions#1

| Point | Class | Assessment |
|---|---|---|
| MC1 | C | The minimum number of buffers directly answers the question. |
| MC2 | F | Once the answer says USGS requires at least two, separately requiring a statement that one is unacceptable duplicates the same decision. |
| MC3 | C | The user asks what to immerse the probe in, so naming suitable standard buffers is necessary. |
| MC4 | C | The selected buffers must bracket the expected sample; otherwise the answer can lead to an invalid calibration. |
| MC5 | C | Traceability and unexpired material determine whether those solutions are valid calibration standards. |
| MN1 | C | Approving one point contradicts the USGS minimum. |
| MN2 | C | Invented buffer standards cannot be used as a calibration basis. |
| MN3 | C | Merely repeating the recalibration interval fails to answer the procedural question. |
| MN4 | C | The question explicitly says the datasheet supplies no procedure; attributing one to it would misrepresent the evidence. |

Both score-1 outcomes are correct because expiry is omitted.
Pass 2 is wrong to count the one-point prohibition as another unmet decision: “A two-point calibration is the minimum” already excludes one.
The quoted NIST-traceability requirement deserves credit, just as quoted prohibitions and qualifiers receive credit in other turns.
MC5 contains two independently checkable claims and should be split for auditing, without dropping the expiry requirement.
Long answers can still omit a core safeguard; this answer's length does not justify promotion to 2.

#### probecal-ph-what-solutions#2

| Point | Class | Assessment |
|---|---|---|
| MC1 | C | The requested choice is the 7 and 10.01 pair for the specified creek. |
| MC2 | S | Default calibration order is useful, but the question asks which buffers and whether bottle temperature matters. |
| MC3 | C | The temperature relationship directly answers the second question and is supported by [4]-[5]. |
| MC4 | C | Using the value appropriate to buffer temperature, automatically or manually, prevents treating the bottle's nominal value as universally correct. |
| MN1 | C | Treating the nominal value as invariant defeats the temperature qualification. |
| MN2 | C | A pair below the expected sample does not bracket it. |
| MN3 | C | An invented temperature window would change the recommended setup. |

Both judges correctly give 1 under the written rubric.
The response acknowledges automatic compensation in many meters, but does not verify that this meter recognizes and applies the appropriate buffer values or tell the user what to do otherwise.
That is a material remaining qualification, so my operator score is also 1; removing the unrelated order requirement alone would not make the response complete.
The source also supports laboratory calibration and field checks for common conditions, so a revised rubric should not turn the approximate temperature window into a universal command to calibrate at the creek.

## 3. Point-level totals

| Original numbered entries | Core | Supplementary | Flawed | Total |
|---|---:|---:|---:|---:|
| Must contain | 43 | 27 | 4 | 74 |
| Must not | 49 | 1 | 1 | 51 |
| Combined | 92 | 28 | 5 | 125 |

For MC entries, that is approximately 58% core, 36% supplementary and 5% flawed, subject to rounding.
These are counts of authored entries, not independent scientific facts or population estimates.
Compound and overlapping entries make the denominator imperfect, and the sample includes both turns from two conversations.

The four flawed MC entries are the missing-evidence requirements for pH slope and Eh correction in the temperature-drift turn, the unsupported application-specific turbidity characterization in the precedence turn, and the duplicated single-point pH prohibition.
The flawed MN entry is the unconditional zero for a qualitative response in the warming-attribution case.
The supplementary MN entry is the automatic-zero treatment of failing to acknowledge the other oxygen table.
Other MN entries can be reasonable only when their scope, negation and conditional exceptions are respected.

My original-rubric scores sum to 15/16 = 0.9375, versus 16/16 = 1.00 for the sampled pass-1 grades.
My operator scores sum to 19/16 = 1.1875.
The four operator-score increases relative to my original-rubric scores concern cold-water reporting, the compromised calibrant's conservative discard advice, the annual temperature-check example and required-procedure departures.
The change in score is therefore not equivalent to simply deleting all supplementary entries: for example, operator judgment gives partial credit to the calibrant answer despite its existing automatic-zero rule.

Neither mean is an estimate of the full-run mean or a revised gate result.
The sample was selected within score strata, with 3 zeros, 10 ones and 3 twos rather than the population's 10, 69 and 11; its sampling weights differ, its class coverage differs, and the operator scale is a changed measurement instrument.
There are no sampled refusal-class or follow-up-class turns, although I scanned those classes in ALL_TURNS.

## 4. Patterns from ALL_TURNS.md

### The full run fails more than the aggregate gate

I recalculated the following from the packet's 90 entries; these remain the supplied judge grades, not a fresh adjudication of all turns.

| Class | Turns | MC entries per turn, mean | Judge mean, pass 1 | Judge mean, pass 2 |
|---|---:|---:|---:|---:|
| Cross-document | 24 | 5.83 | 0.833 | 0.833 |
| Deep-in-manual | 20 | 3.70 | 1.200 | 1.250 |
| Definitional | 8 | 3.63 | 1.000 | 1.000 |
| Follow-up | 8 | 3.63 | 1.125 | 1.125 |
| Precedence | 6 | 4.50 | 1.167 | 1.000 |
| Probe-calibration | 16 | 4.88 | 1.000 | 1.000 |
| Refusal | 8 | 5.75 | 0.875 | 0.875 |
| Overall | 90 | 4.70 | 1.011 | 1.011 |

There are 423 MC entries across all turns.
Both passes total 91 points, and both cross-document and refusal fail the 1.00 class gate.
Identical aggregate means conceal six changed turn scores: `crossdoc-bailed-orp-jumping#2`, `crossdoc-two-oxygen-tables-disagree#1`, `deepmanual-thermistor-annual-check#1`, `deepmanual-thermistor-annual-check#2`, `deepmanual-turbidity-rounding#1`, and `precedence-do-hypoxia-qa-trigger-not-pod-limit#2`.
The observed pass-to-pass score agreement is 84/90; shared systematic errors remain possible even where both judges agree.

### Supplementary detail often blocks a 2

| Turn | Detail driving incompleteness | Assessment |
|---|---|---|
| definitional-required-versus-recommended#1 | Research/consensus provenance of mandatory policy | The practical distinction can be explained without the policy's history. |
| definitional-required-versus-recommended#2 | Repeating the analogous recommended-procedure rule | The answer already resolves the required-procedure question. |
| definitional-what-a-bare-tu-label-tells-us#1 | Historical JTU and FTU labels | Useful archival background, but not necessary to explain a column labeled TU. |
| definitional-what-a-bare-tu-label-tells-us#2 | Exhaustive wavelength mapping across every unit family | The common examples and design rule can answer the house-style question without an entire taxonomy. |
| followup-jumpy-temperature-trace#1 | Contrasting erratic readings with other causes of inaccurate readings | The answer supplies the requested initial troubleshooting checks. |
| probecal-buffer-handling#1 | Secondary field bottle and its labels | A clean separate vessel and discard instruction answer the stock-bottle question. |
| deepmanual-ec-standard-choice#1 | Explanation of why dilute standards are vulnerable | The chosen standard and DIW distinction can be correct without that mechanism. |
| deepmanual-sonde-settle-time#1 | Explicit “several minutes” range after already stating a minimum and longer manufacturer-dependent waits | This is close to demanding a second phrasing of an already expressed qualification. |
| crossdoc-how-steady-before-i-write-it-down#2 | Procedure for persistent variability | The user asks whether two tables disagree, not how to handle failure to stabilize. |
| crossdoc-orp-sliding-do-steady#1 | 430 mV at 25 C despite a worked 438 mV example at 22 C | A correct temperature-specific example should not require a second example to establish the same decision. |

These examples justify a content-validity audit, but do not imply that every answer in the table deserves 2 on all aspects.
For example, `crossdoc-orp-sliding-do-steady#1` overclaims that a passing present-day standard check demonstrates the probe was not responsible for a historical shift.
`deepmanual-sonde-settle-time#1` should still distinguish thermal equilibration from confirmed measurement stability when the question is whether a reading is ready to record.
A revised operator rubric must inspect the whole answer, including unsupported additions.

### Important omissions and false claims coexist with excess detail

`probecal-do-saturation-target#1` omits the loose calibration chamber that preserves ambient pressure.
`probecal-buffer-handling#2` gives a replacement cadence but does not address a truck's storage conditions.
`probecal-sonde-calibration-order#2` supplies triple DIW rinsing but omits conditioning with the next standard and rinsing the cup.
`followup-cleaning-the-salt-sensor#1` offers an acid cleaning procedure without the source's manufacturer-compatibility check.
These are plausible data-quality or equipment-protection issues, not merely omissions of textbook background.

The answer in `crossdoc-sonde-sensor-order#2` reverses the contamination explanation, attributing contamination to conductivity-electrode filling solution affecting pH, and extends a positioning rule to a multiparameter arrangement without support.
`crossdoc-two-oxygen-tables-disagree#2` says the EPA table stops around 40 C and 730 mmHg, despite the packet showing 45 C and a continuation to 690 mmHg.
The wrong cells and causal subtraction in `crossdoc-warm-week-oxygen-drop#1`, and the raw-ORP/Eh equivalence in the definitional turn, are failures on the substance of the question.

The current rubric can also be too permissive in places.
`probecal-end-of-day-check#1` starts by changing four days of sampling into a continuous deployment and prescribes calibration before the first day, yet receives 1 because it covers other points.
That is a wrong central cadence, which deserves explicit severity review.
`crossdoc-conductivity-rise-with-warming#2` gives an “at least five” annual check requirement while the sampled annual-verification source permits two points for some ranges.
Both judges mainly discuss missing explanations and fail to identify that source-procedure conflation.
These examples show why a positive checklist plus a finite MN list is insufficient as the sole screen for material error.

### Refusal rubrics mix appropriate boundaries with unnecessary background

All eight refusal-class answers receive less than 2 in both passes, although none supplies the requested unsupported deployment duration, fish-temperature limit, turbidity depth rating or alkalinity conversion.
That is evidence of successful boundary behavior on these prompts, alongside incomplete assistance; it is not evidence that every refusal is operator-complete.
`refusal-turbidity-sensor-hardware#1` should direct the user to the manufacturer, and `refusal-temperature-harm-threshold#2` should answer the explicit question about obtaining an external authority's criterion.
Those missing next steps are more material than naming the chapter number or listing unrelated supported measurements.

`refusal-how-long-can-it-stay-in#2` is a likely judge error in both passes.
The rubric itself requires declining an unsupported record-retention rule, and the answer both declines and gives relevant deployment/recovery checks.
Its missing fouling, qualification and project-plan details justify 1, but the judges' reason “refuses ... expected a real answer” does not justify 0 in this case.
A refusal sentence must not override substantive partial credit when the rubric asks for a boundary plus supported adjacent information.

### Duplicate and compound requirements create inconsistent severity

`probecal-end-of-day-check#2` repeats the project-QA-plan precedence in MC3 and MC5.
`crossdoc-soft-water-ph-wont-settle#2` substantially repeats the temperature-specific final-buffer check in MC3 and MC4.
`probecal-ph-what-solutions#1` separately asks for a minimum of two and rejection of one.
Other entries bundle several behaviors into one point, such as `crossdoc-do-calibrated-dry-deployed-brackish#1` and the sampled calibration-order exception.
The reported “1-8 unmet points” therefore cannot be interpreted as 1-8 independent, equally important operational defects.

Some omissions trigger automatic zero because they appear in MN, while comparable omissions elsewhere merely prevent 2.
`deepmanual-thermistor-annual-check#2` explicitly makes dropping the pre-trip check a zero, and the two judges disagree on applying it.
The acid-cleaning manufacturer check is a more defensible omission-based veto because it conditions the very action being recommended.
The team needs a consistent severity policy based on the immediate decision, not on whether an author happened to copy a requirement into MN.

### Judge errors occur in both directions

| Turn | Problem with the supplied judgment | My assessment |
|---|---|---|
| deepmanual-thermistor-annual-check#1 | Pass 2 rejects a point set expressly accepted by the rubric. | 1 under the written rubric, rather than 0. |
| probecal-ec-never-recalibrate#1 | Both passes infer an on-site check that the answer does not state. | 1, rather than 2. |
| followup-jumpy-temperature-trace#2 | Both passes claim a brief cable/recertification sentence meets the conditional NWIS uncertainty requirement. | At most 1 under the written rubric; that requirement is absent even from the quotation. |
| refusal-how-long-can-it-stay-in#2 | Both passes treat the requested refusal as grounds for zero despite substantive partial coverage. | 1 is the defensible written-rubric score. |
| probecal-ph-what-solutions#1 | Pass 2 fails to infer that a two-point minimum excludes one point. | Same overall 1 because expiry is still missing, but an incorrect unmet-point count. |
| deepmanual-do-air-calibration#1 | Both passes count the saturation/warm-up bundle as missing despite explicit 10-15 minutes and temperature stabilization. | Same overall 1; at least partial coverage of that item. |
| deepmanual-turbidity-rounding#1 | Pass 2 gives full credit without an explicit table attribution, whereas pass 1 requires it. | A real attribution-policy ambiguity; operator usefulness is much less disputed than the written-rubric score. |

The held-out 9/12 agreement is encouraging but too small to settle these interpretation and content-validity questions.
Agreement with the owner checks consistency with that owner's application of the rubric; it does not independently validate the rubric as a measure of operator success.

## 5. Goalpost analysis

### What the original bar establishes

The preregistration protects against choosing a more convenient numeric threshold after seeing the outcome.
It does not independently establish the validity or difficulty of a rubric written later and not yet human-verified.
With the current instrument, the observed result is unambiguously 91/90 = 1.011, below 1.30, with two classes below 1.00.
That result should remain visible even if the instrument is corrected.

For a 0/1/2 scale, mean score equals `1 + (number of 2s - number of 0s) / N`.
At N = 90, reaching 1.30 requires at least 27 more twos than zeros; this run has only one more two than zero.
It would require a net gain of 26 total score points to cross the aggregate gate, apart from the class gates.
That quantifies the existing shortfall; it must not become a target number of rubric changes.

Requiring every substantive detail for a 2 makes the score sensitive to how much content is required, not just whether the operator can make the right decision.
As an illustration only, independent 90%-likely coverage of each requirement produces all-covered probabilities of about 73% for three requirements and 43% for eight.
Real points are correlated, and the packet does not establish a common per-point probability, so this is an explanation of the measurement effect, not a model of these data.
Merely splitting an identical logical requirement into two equivalent statements does not change ideal all-or-nothing coverage; adding extra content, ambiguity and inconsistent semantic matching does.

The 1.30 bar remains meaningful for the original scoring construct.
It is not automatically an equivalent operational standard after changing what a 2 means.
Keeping the same numeral while changing the rubric can relax the gate as surely as lowering the numeral.
That does not make every correction illegitimate, but it makes versioning and prospective validation essential.

### What distinguishes correction from goalpost moving

A principled correction has a defensible reason tied to the question, applicable procedure and supplied evidence that would hold if every model answer were hidden or already scored 2.
It repairs missing evidence, contradiction, duplication, excessive scope or semantic grading, and is applied symmetrically to successful and unsuccessful answers and all relevant classes.
It may add missing core safeguards or lower previously generous scores.
The EC on-site check, cable-answer overcredit and missing source for drift mechanisms are important tests of that symmetry.

Goalpost moving would include selecting only unmet points for demotion, changing the core definition until the mean passes, repeatedly tuning on these same outputs while calling them held out, dropping hard fixtures without a source-based exclusion rule, or replacing the original failure with a revised pass.
The fact that the threshold predates the rubrics does not excuse any of those actions.
Conversely, preserving unsupported requirements merely because they were written first would not protect measurement validity.

### A concrete blind procedure

1. **Freeze the existing record and write a revision charter.** Preserve this packet, captures, both judgments and the original gates under version 1; identify objective error correction, operator sufficiency and safety severity as separate review questions.
   State that this review is already exposed to answers and can generate hypotheses, but cannot provide the blind adjudication itself.
2. **Prepare question-and-evidence packets for independent reviewers.** Give a field monitoring practitioner and a measurement/evaluation reviewer the user questions, necessary conversation context and exact evidence, without model names, model answers, judge notes, score strata or the aggregate outcome.
   For follow-ups, supply a prewritten factual scenario or intended antecedent, rather than a scored model answer; separately test the behavior of correcting erroneous history.
   Ask each reviewer to draft the minimum sufficient answer and decision-changing cautions before seeing the old rubric.
3. **Audit the old rubric against those independent drafts.** Review all 90 turns, including previous twos, for support, scope, ambiguity, duplication and missing safeguards; require an excerpt or explicit supported inference for each retained requirement.
   Mark an item core when omitting it changes the answer to an explicit question, permits a relevant wrong action, or removes a condition needed to apply the answer safely in the stated situation.
   Mark it supplementary when another competent, source-grounded answer can support the same correct decision without it; repair unsupported or contradictory items rather than merely relabeling them supplementary.
   Record disagreements and have a third domain reviewer adjudicate without seeing outputs.
4. **Freeze the revised scoring policy before unblinding.** Define 2 as all core decisions and conditions correct, 1 as meaningful partial assistance without a decisive wrong instruction, and 0 as a wrong central decision, material unsupported claim, or justified severe omission.
   Name any omission-based zero rule and its operational consequence in advance, accept equivalent wording and supported alternatives, and report supplementary coverage separately.
   Keep a separate material-error/safety flag so an aggregate mean cannot conceal consequential mistakes or let added detail offset them.
5. **Run a prospective validation and a separately labeled retrospective comparison.** First validate grading on disjoint calibration examples with human adjudication, then score the frozen old outputs under both versions for diagnosis.
   For a confirmatory test, use fresh fixtures covering the same task blueprint, with evidence and rubrics authored and locked before generating answers; keep two-turn conversations together when allocating calibration and test sets.
   Register the revised gates, class requirements and any safety rule before capture, with an operational rationale rather than the known score distribution.
   Use the original 1.30/1.00 numbers as a historical comparator if desired, but do not claim measurement equivalence without a validation argument.

If no reviewers unexposed to this packet are available, an answer-hidden reclassification by the same team is still useful quality control, but should not be described as fully blind.
A new fixture set is particularly important because the existing prompts, answer prompts and judge have already received repeated attention.
This review proposes the procedure; it does not authorize additional paid captures.

### How to report each option

| Option | Accurate report |
|---|---|
| Keep the rubric | “Gold-context correctness was 1.011 in both passes, below 1.30; cross-document and refusal also failed the 1.00 class gate.” |
| Correct judge application only | Publish the original and adjudicated grades with every changed turn and reason; state whether the same fixed rubric passes after complete adjudication. |
| Correct source or rubric defects | Publish a new version, the defect log and both score sets; distinguish original-output rescoring from new captures receiving repaired context. |
| Introduce core/supplementary scoring | Label the old-output result exploratory under a changed instrument, report supplementary coverage and serious errors separately, and retain the original failure. |
| Run a fresh prospective evaluation | Report the new preregistered test as evidence about the revised construct, with the previous failure and revision history disclosed. |

Do not quote my 16-turn operator mean as a revised 90-turn result, and do not claim the model would cross 1.30 after an audit that has not yet happened.

## 6. Other explanations, ranked

| Rank | Explanation | Likely contribution and evidence |
|---|---|---|
| 1 | Answer capability and execution | Substantial and directly observed: wrong table coordinates, raw-ORP/Eh equivalence, protocol conflation, configuration assumptions and missing setup safeguards survive a more practical rubric. |
| 2 | Rubric scope and measurement design | Substantial for the pile-up at 1: historical details, repeated qualifications, unrelated follow-up information and full procedure details are often required for narrow questions. |
| 3 | Answer selection and length habits | Plausible contributor: many short answers resolve the immediate question but stop before the rubric's expanded checklist; longer answers also miss core conditions, so simply asking for more text is not an established fix. |
| 4 | Gold-context construction and fixture difficulty | Demonstrably nonzero: at least two detailed mechanisms lack support in the drift turn, and an application-policy claim lacks support in the sampled precedence turn; fragmented tables and large irrelevant table continuations also burden interpretation. |
| 5 | Judge application | Material locally but uncertain in aggregate: some failures are overly literal and some twos are too generous; my sampled correction reduces the original-rubric mean rather than rescuing it. |
| 6 | Question ambiguity and protocol scope | Relevant to particular fixtures: the cold-water question never names turbidity, the oxygen-table question leaves the governing protocol unspecified, and several answers assume hardware types or workflows not established by the user. |
| 7 | The prompt as currently tested | Three prompt versions provide evidence of a local plateau, but do not establish that every prompt, answer structure, reasoning setting or model configuration is exhausted. |

Ranks 1 and 2 are both strongly supported; the evidence does not identify what fraction of the 1.01 mean each causes.
These explanations interact: a long rubric invites omissions, a terse answer may hide essential qualifications, and a judge may treat a multi-claim entry as wholly missing.
The supplied evidence is not a factorial experiment capable of allocating causal percentages.

Retrieval cannot explain the sampled failures where the needed evidence is present, but the observed missing-support cases mean “gold context” is not proof that every requirement was answerable from every supplied packet.
The reranker's higher recall and small score change are consistent with an answer or metric bottleneck, but also with gains on evidence that did not resolve the decisive missing claims.
Without paired adjudication and uncertainty analysis, “inside judge noise” is a useful caution rather than a demonstrated causal finding.
The high-reasoning run is absent here, so I draw no conclusion about its effect.

## 7. What I would do next

- Publish the original failure with both class failures, then adjudicate the concrete judge discrepancies and missing-evidence cases identified here.
- Have an independent field practitioner draft minimum sufficient answers blind to outputs, then audit every rubric under a fixed core/supplementary rule.
- Repair context support, ambiguous questions, duplicate entries and severity rules in a versioned instrument, including missing safeguards that could make some grades lower.
- Rescore the frozen outputs once under the locked revision, publishing paired results and substantive-error counts as an exploratory analysis.
- Use fresh, prospectively specified conversations to test the revised instrument and the chosen answer configuration before making a new pass claim.

## 8. Limits

I reviewed the supplied text, not original PDF page images, live pod behavior, actual hardware configuration, a site's quality-assurance plan or operator performance in the field.
I am an OpenAI Codex reviewer using the requested Astra model, not an independent human field practitioner; the OpenAI family is also responsible for the answer model, so favorable interpretation of model answers is a possible bias.
The packet's framing and rubric authorship are Claude's, and the grading is DeepSeek's; none of those family differences independently establishes validity.

I read the sampled excerpts and scanned all 90 questions, rubrics, answers and verdicts, but did not independently source-audit the full evidence bundles for the 74 unsampled turns.
Statements about missing evidence are tied to the sampled turn's supplied excerpts; unsampled source-validity concerns need their own evidence check.
I did not inspect the complete answer/judge prompts, reconstruct captures, verify the original preregistration or sample-selection history, or rerun any model or paid evaluation.
The packet's account of those procedures is taken as given.
The original numeric tables have extraction artifacts, so conclusions about other cells or an apparent source inconsistency should be checked against the PDFs before changing source data.

This is an exposed retrospective review, with subjective operator scores and some debatable core/supplementary boundaries.
The score-stratified sample is not representative of the population without adjustment, and a two-turn conversation can remain wrong overall even when its second answer earns 2 locally.
No confidence interval or overall corrected score is claimed from this sample.

A blind practitioner review finding that the disputed details are genuinely needed for the stated decisions would reduce my estimate of rubric overspecification.
Evidence that the supposedly absent mechanisms or application policy were actually supplied to the model would change those source-support classifications.
A fresh, source-verified evaluation showing strong core decision accuracy but weak exhaustive coverage would strengthen the case for revising the measurement construct; persistence of the sampled substantive mistakes under that design would strengthen the model-capability diagnosis.
