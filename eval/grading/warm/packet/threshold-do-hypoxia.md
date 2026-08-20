# threshold-do-hypoxia

**Class:** `threshold-lookup` · **Turns:** 2

> Answers below are labelled A/B/C in an order specific to this fixture. The same letter
> means a **different** system on another sheet. Do not compare letters across fixtures.

---

## Turn 1

**Question:** At what dissolved oxygen level does the water become hypoxic?

### Rubric

**Must contain**
- gives hypoxia as below 2 mg/L
- gives 2–4 mg/L as hypoxic stress
- states the unit is mg/L
- cites the operator source-of-truth reference

**Must not**
- invents a threshold absent from the context
- answers only in % saturation with no mg/L figure

**Should cite**
- water-quality-metrics-source-of-truth.pdf

### Answer A

Water is considered hypoxic when dissolved oxygen falls **below about 2 mg L⁻¹**【4】.

<sub>Context supplied: 5 chunk(s) from 3 document(s) — tm9a6.2.pdf, volunteer_stream_monitoring_a_methods_manual.pdf, water-quality-metrics-source-of-truth.pdf. Full text: `context/threshold-do-hypoxia/turn1-A.txt`</sub>

### Answer B

Water is considered hypoxic when dissolved oxygen drops **below about 2 mg L⁻¹** (values 2–4 mg L⁻¹ are often called hypoxic stress).  
This threshold comes from the general guidance in the water‑quality metrics reference【5†L1-L4】.

<sub>Context supplied: 5 chunk(s) from 5 document(s) — EC_K_1.0_probe.pdf, IORP_probe.pdf, Industrial-DO-probe.pdf, IpH_probe.pdf, water-quality-metrics-source-of-truth.pdf. Full text: `context/threshold-do-hypoxia/turn1-B.txt`</sub>

### Answer C

I can only answer questions grounded in this sensor's readings or the loaded water‑quality documents, and I don't have enough information to answer that. The context provided does not include a specific threshold for hypoxia.

<sub>Context supplied: 5 chunk(s) from 2 document(s) — volunteer_stream_monitoring_a_methods_manual.pdf, Industrial-DO-probe.pdf. Full text: `context/threshold-do-hypoxia/turn1-C.txt`</sub>

---

## Turn 2

**Question:** And what would you call 5.2?

### Rubric

**Must contain**
- reads 5.2 as 5.2 mg/L DO from the prior turn's context
- places it in the 4–6 mg/L stress band
- notes the operator's authoritative normal range is 5–14 mg/L, so it is inside the operator range but near its floor

**Must not**
- places 5.2 mg/L in the healthy (>6 mg/L) band
- replaces the operator range with a document range

**Should cite**
- water-quality-metrics-source-of-truth.pdf

**Notes:** Mixes a document band with the operator range in one answer — precedence has to be handled without being asked about.

### Answer A

A dissolved‑oxygen reading of **5.2 mg L⁻¹** falls within the operator‑provided normal range of 5–14 mg L⁻¹, so it would be considered **normal/adequate** for most aquatic life.

<sub>Context supplied: 5 chunk(s) from 1 document(s) — tm9a6.8.pdf. Full text: `context/threshold-do-hypoxia/turn2-A.txt`</sub>

### Answer B

A dissolved‑oxygen reading of **5.2 mg L⁻¹** falls into the “stress” range (4–6 mg L⁻¹) for freshwater, indicating moderate oxygen stress but not yet hypoxic【5†L1-L4】.

<sub>Context supplied: 5 chunk(s) from 5 document(s) — EC_K_1.0_probe.pdf, IORP_probe.pdf, Industrial-DO-probe.pdf, IpH_probe.pdf, water-quality-metrics-source-of-truth.pdf. Full text: `context/threshold-do-hypoxia/turn2-B.txt`</sub>

### Answer C

A dissolved‑oxygen value of 5.2 mg L⁻¹ falls within the operator‑provided normal range of 5 – 14 mg L⁻¹, so it would be considered **normal, though at the lower end of that range**【Authoritative Normal Ranges】.

<sub>Context supplied: 5 chunk(s) from 2 document(s) — tm9a6.8.pdf, volunteer_stream_monitoring_a_methods_manual.pdf. Full text: `context/threshold-do-hypoxia/turn2-C.txt`</sub>

