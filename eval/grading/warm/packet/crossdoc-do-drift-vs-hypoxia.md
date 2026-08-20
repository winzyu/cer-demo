# crossdoc-do-drift-vs-hypoxia

**Class:** `cross-document` · **Turns:** 2

> Answers below are labelled A/B/C in an order specific to this fixture. The same letter
> means a **different** system on another sheet. Do not compare letters across fixtures.

---

## Turn 1

**Question:** Our DO has slid down for three weeks and now reads 1.8 mg/L. Is the river going hypoxic?

### Rubric

**Must contain**
- gives both candidate explanations: genuine hypoxia (below 2 mg/L) and an instrument cause
- cites the DO probe's electrolyte depletion — a depleted probe reads very low, and electrolyte and membrane are replaced every 1–2 years
- cites the reference's caveat that a slow one-directional trend across weeks may be drift or fouling rather than water chemistry
- gives a discriminating check, e.g. ORP: if ORP is also crashing the water is likely genuinely anoxic, if ORP is flat suspect the probe

**Must not**
- asserts one cause with certainty
- omits the instrument explanation entirely

**Should cite**
- water-quality-metrics-source-of-truth.pdf
- Industrial-DO-probe.pdf

### Answer A

Your sensor reading of 1.8 mg L⁻¹ is below the operator‑provided normal range for dissolved oxygen (5 – 14 mg L⁻¹)【Authoritative Normal Ranges】.  This indicates that the river is experiencing very low oxygen levels, which is typically considered hypoxic.

<sub>Context supplied: 5 chunk(s) from 2 document(s) — volunteer_stream_monitoring_a_methods_manual.pdf, tm9a6.2.pdf. Full text: `context/crossdoc-do-drift-vs-hypoxia/turn1-A.txt`</sub>

### Answer B

Yes. A dissolved‑oxygen reading of 1.8 mg L⁻¹ is below the operator‑provided normal range for freshwater (5–14 mg L⁻¹) and falls into the “hypoxia” category defined in the water‑quality guidelines (>6 mg L⁻¹ healthy, 4–6 mg L⁻¹ stress, 2–4 mg L⁻¹ hypoxic stress, <2 mg L⁻¹ hypoxia)【1】. This indicates the river is currently hypoxic.

<sub>Context supplied: 5 chunk(s) from 2 document(s) — water-quality-metrics-source-of-truth.pdf, volunteer_stream_monitoring_a_methods_manual.pdf. Full text: `context/crossdoc-do-drift-vs-hypoxia/turn1-B.txt`</sub>

### Answer C

Yes.  
Your dissolved‑oxygen (DO) reading of **1.8 mg L⁻¹** is below the operator‑provided normal range for DO (5 – 14 mg L⁻¹) and falls under the hypoxic threshold (< 2 mg L⁻¹) described in the water‑quality document. This indicates the river is currently hypoxic.

<sub>Context supplied: 5 chunk(s) from 5 document(s) — EC_K_1.0_probe.pdf, IORP_probe.pdf, Industrial-DO-probe.pdf, IpH_probe.pdf, water-quality-metrics-source-of-truth.pdf. Full text: `context/crossdoc-do-drift-vs-hypoxia/turn1-C.txt`</sub>

---

## Turn 2

**Question:** Does the optical-sensor fouling warning in the reference even apply to our probe?

### Rubric

**Must contain**
- states the deployed Atlas probe is galvanic — HDPE membrane, zinc anode, silver cathode — not optical/luminescent
- concludes the optical-drift caveat does not apply directly
- gives the galvanic failure modes instead: electrolyte depletion, zinc-oxide corrosion on the anode, worn membrane
- notes all submerged sensors foul, so a fouling check is still warranted

**Must not**
- describes the deployed DO probe as optical or luminescent
- answers without noticing the two documents describe different sensor technologies

**Should cite**
- water-quality-metrics-source-of-truth.pdf
- Industrial-DO-probe.pdf

**Notes:** Requires reconciling a conflict between two in-slice documents. An arm that retrieves only one will answer confidently and wrongly.

### Answer A

The excerpts you provided from the reference do not mention a fouling warning for optical sensors.  Because the text does not describe fouling or a related caution, I can’t confirm that such a warning applies to your probe.  If your instrument’s manual or manufacturer’s guidance includes a fouling note, that would be the source to consult.

<sub>Context supplied: 5 chunk(s) from 2 document(s) — tm9a6.2.pdf, tm9a6.8.pdf. Full text: `context/crossdoc-do-drift-vs-hypoxia/turn2-A.txt`</sub>

### Answer B

I can only answer questions grounded in this sensor's readings or the loaded water‑quality documents, and I don't have enough information to answer that. The provided excerpts do not contain a fouling warning for optical sensors.

<sub>Context supplied: 5 chunk(s) from 1 document(s) — tm9a6.2.pdf. Full text: `context/crossdoc-do-drift-vs-hypoxia/turn2-B.txt`</sub>

### Answer C

No. The fouling warning in the reference is specific to **optical** dissolved‑oxygen sensors. Your probe is a galvanic DO probe (Industrial Gen 3), which does not suffer from the same biofilm‑driven drift that optical sensors do. The warning in the document states: “DO sensor fouling: Optical DO sensors drift with biofilm growth. Pair DO trends with the antifouling/cleaning schedule”【5†L6-L9】.

<sub>Context supplied: 5 chunk(s) from 5 document(s) — EC_K_1.0_probe.pdf, IORP_probe.pdf, Industrial-DO-probe.pdf, IpH_probe.pdf, water-quality-metrics-source-of-truth.pdf. Full text: `context/crossdoc-do-drift-vs-hypoxia/turn2-C.txt`</sub>

