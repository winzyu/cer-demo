# precedence-conductivity-range

**Class:** `precedence` · **Turns:** 2

> Answers below are labelled A/B/C in an order specific to this fixture. The same letter
> means a **different** system on another sheet. Do not compare letters across fixtures.

---

## Turn 1

**Question:** Our conductivity is 30 µS/cm. Flag it?

### Rubric

**Must contain**
- states the operator range for this freshwater deployment is 0 to 1,500 µS/cm, so 30 µS/cm is inside it
- notes the reference's healthy-freshwater band starts at 50 µS/cm, so the reading sits below general guidance
- states the operator range governs the normal/abnormal call

**Must not**
- flags an exceedance against the operator range
- silently adopts the 50 µS/cm floor as the authority

**Should cite**
- water-quality-metrics-source-of-truth.pdf

### Answer A

No.  
Your sensor’s normal range for conductivity is 0 – 1,500 µS/cm, and 30 µS/cm falls well within that window. (Typical river conductivity is usually 50 – 1,500 µS/cm, so 30 µS/cm is on the low side but still normal for the sensor.)

<sub>Context supplied: 5 chunk(s) from 3 document(s) — tm9a6.8.pdf, EC_K_1.0_probe.pdf, volunteer_stream_monitoring_a_methods_manual.pdf. Full text: `context/precedence-conductivity-range/turn1-A.txt`</sub>

### Answer B

No – 30 µS/cm is within the operator‑provided normal range for conductivity (0 – 1,500 µS/cm).

<sub>Context supplied: 5 chunk(s) from 3 document(s) — EC_K_1.0_probe.pdf, tm9a6.8.pdf, tm9a6.2.pdf. Full text: `context/precedence-conductivity-range/turn1-B.txt`</sub>

### Answer C

Your sensor’s conductivity reading of **30 µS/cm** falls within the operator‑provided normal range of 0 – 1,500 µS/cm, so it would **not be flagged** as abnormal.  

(For reference, the water‑quality document lists a typical healthy freshwater range of 50 – 1,500 µS/cm, so 30 µS/cm is slightly below that baseline but still within the acceptable limits set by the operator.)

<sub>Context supplied: 5 chunk(s) from 5 document(s) — EC_K_1.0_probe.pdf, IORP_probe.pdf, Industrial-DO-probe.pdf, IpH_probe.pdf, water-quality-metrics-source-of-truth.pdf. Full text: `context/precedence-conductivity-range/turn1-C.txt`</sub>

---

## Turn 2

**Question:** What would push it that low?

### Rubric

**Must contain**
- attributes low EC to freshwater input — rain, runoff, or groundwater
- notes the direction of an EC change fingerprints freshwater versus saline input

**Must not**
- attributes low EC to a saline or ionic discharge

**Should cite**
- water-quality-metrics-source-of-truth.pdf

### Answer A

I can only answer questions grounded in this sensor's readings or the loaded water-quality documents, and I don't have enough information to answer that. The context does not contain any explanation of factors that affect conductivity.

<sub>Context supplied: 5 chunk(s) from 1 document(s) — tm9a6.2.pdf. Full text: `context/precedence-conductivity-range/turn2-A.txt`</sub>

### Answer B

I can only answer questions grounded in this sensor's readings or the loaded water‑quality documents, and I don't have enough information to answer that. The context does not explain factors that affect conductivity.

<sub>Context supplied: 5 chunk(s) from 2 document(s) — tm9a6.2.pdf, volunteer_stream_monitoring_a_methods_manual.pdf. Full text: `context/precedence-conductivity-range/turn2-B.txt`</sub>

### Answer C

A conductivity of 30 µS/cm is very low because the water contains very few dissolved ions (electrolytes).  
Typical causes are:

| Cause | Why it lowers conductivity |
|-------|----------------------------|
| **Very pure or de‑ionized water** | The ion concentration is almost zero, so the solution can’t conduct electricity. |
| **Dilution with fresh, low‑mineral water** | Adding large volumes of water that has little dissolved salt reduces the overall ion load. |
| **Low‑mineral natural waters** | Some streams or groundwater sources naturally have low total dissolved solids, giving low EC. |
| **Sensor fouling or calibration drift** | Biofilm, deposits, or a mis‑calibrated probe can give artificially low readings. |

In short, a low EC reading means the water is very low in dissolved salts or the probe isn’t measuring correctly.

<sub>Context supplied: 5 chunk(s) from 5 document(s) — EC_K_1.0_probe.pdf, IORP_probe.pdf, Industrial-DO-probe.pdf, IpH_probe.pdf, water-quality-metrics-source-of-truth.pdf. Full text: `context/precedence-conductivity-range/turn2-C.txt`</sub>

