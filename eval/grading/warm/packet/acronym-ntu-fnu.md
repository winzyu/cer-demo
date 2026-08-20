# acronym-ntu-fnu

**Class:** `acronym-exact-token` · **Turns:** 2

> Answers below are labelled A/B/C in an order specific to this fixture. The same letter
> means a **different** system on another sheet. Do not compare letters across fixtures.

---

## Turn 1

**Question:** Our turbidity readings are in NTU but another pod reports FNU — can I compare them?

### Rubric

**Must contain**
- states NTU and FNU are not interchangeable
- identifies NTU as white-light and FNU as infrared
- recommends standardizing on one unit across the fleet

**Must not**
- says the units are equivalent
- supplies a conversion factor between NTU and FNU

**Should cite**
- water-quality-metrics-source-of-truth.pdf

### Answer A

No. NTU (nephelometric turbidity units) and FNU (field nephelometric units) are different measurement scales. A turbidity meter that reports NTU (see [1]) uses a light‑scattering method calibrated to the NTU scale, while USGS multiparameter instruments report turbidity in FNU (see [2] and [3]). Because the two units are not directly equivalent, you can’t compare the numbers without first converting one to the other or using a calibration curve.

<sub>Context supplied: 5 chunk(s) from 3 document(s) — volunteer_stream_monitoring_a_methods_manual.pdf, tm9a6.8.pdf, water-quality-metrics-source-of-truth.pdf. Full text: `context/acronym-ntu-fnu/turn1-A.txt`</sub>

### Answer B

I can only answer questions grounded in this sensor's readings or the loaded water-quality documents, and I don't have enough information to answer that. The context does not provide information about FNU or how it relates to NTU.

<sub>Context supplied: 5 chunk(s) from 1 document(s) — volunteer_stream_monitoring_a_methods_manual.pdf. Full text: `context/acronym-ntu-fnu/turn1-B.txt`</sub>

### Answer C

No. NTU (white‑light turbidity) and FNU (infrared turbidity) are different measurement scales and are not interchangeable. The water‑quality documents state that “Turbidity units: NTU (white‑light) and FNU (infrared) are not interchangeable. Standardize on one across the fleet.”【5†L1-L3】. To compare the two pods you would need a conversion factor or to convert the FNU reading to NTU (or vice‑versa) using a calibration curve.

<sub>Context supplied: 5 chunk(s) from 5 document(s) — EC_K_1.0_probe.pdf, IORP_probe.pdf, Industrial-DO-probe.pdf, IpH_probe.pdf, water-quality-metrics-source-of-truth.pdf. Full text: `context/acronym-ntu-fnu/turn1-C.txt`</sub>

---

## Turn 2

**Question:** Which one does our sensor use?

### Rubric

**Must contain**
- states this deployment reports NTU
- notes NTU is the white-light unit, so the other pod's FNU values are not directly comparable to ours

**Must not**
- says the deployment's unit is unspecified
- supplies a conversion factor between the units

**Notes:** The unit comes from the operator block in the system prompt, not from the corpus, so no citation is expected. Before 2026-07-29 this turn had no grounded answer.

### Answer A

Your sensor reports turbidity in **NTU** (nephelometric turbidity units).

<sub>Context supplied: 5 chunk(s) from 2 document(s) — tm9a6.8.pdf, tm9a6.2.pdf. Full text: `context/acronym-ntu-fnu/turn2-A.txt`</sub>

### Answer B

Our sensor reports turbidity in **NTU** (nephelometric turbidity units).

<sub>Context supplied: 5 chunk(s) from 1 document(s) — tm9a6.8.pdf. Full text: `context/acronym-ntu-fnu/turn2-B.txt`</sub>

### Answer C

Your sensor reports turbidity in **NTU** (white‑light turbidity). The operator‑provided normal range for turbidity is 0–25 NTU, and the sensor’s specifications list turbidity in NTU【5†L1-L3】.

<sub>Context supplied: 5 chunk(s) from 5 document(s) — EC_K_1.0_probe.pdf, IORP_probe.pdf, Industrial-DO-probe.pdf, IpH_probe.pdf, water-quality-metrics-source-of-truth.pdf. Full text: `context/acronym-ntu-fnu/turn2-C.txt`</sub>

