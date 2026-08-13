# probecal-ph-interval

**Class:** `probe-calibration` · **Turns:** 2

> Answers below are labelled A/B/C in an order specific to this fixture. The same letter
> means a **different** system on another sheet. Do not compare letters across fixtures.

---

## Turn 1

**Question:** What's the calibration interval for the pH probe?

### Rubric

**Must contain**
- gives the datasheet spec of ~1 year time before recalibration
- gives the body guidance: no set schedule — in weak acid/base environments once per year for the first two years, then roughly every six months
- notes monthly or per-batch calibration applies to strong-acid/base or industrial process use

**Must not**
- gives a single unconditional number
- states our deployment needs monthly calibration

**Should cite**
- IpH_probe.pdf

### Answer A

The Atlas Scientific Gen 3 industrial pH probe does **not** have a single, fixed calibration interval.  
The recommended schedule depends on how the probe is used:

| Use case | Typical calibration interval |
|----------|------------------------------|
| **Weak‑acid/base environments** (e.g., fish tanks, hydroponics) | Once per year for the first two years, then roughly every six months thereafter |
| **Strong‑acid/base or industrial processes** (e.g., batch chemical manufacturing) | Monthly, or after each batch if conditions are very aggressive |

These guidelines come from the probe’s maintenance instructions (see the “How often do you need to recalibrate a pH probe?” section in the Atlas Scientific documentation).

<sub>Context supplied: 5 chunk(s) from 2 document(s) — IpH_probe.pdf, volunteer_stream_monitoring_a_methods_manual.pdf. Full text: `context/probecal-ph-interval/turn1-A.txt`</sub>

### Answer B

The manufacturer’s guidance says there is no single “calibration interval” that applies to every situation.  Instead, the recommended schedule depends on how the probe is used:

| Use case | Suggested calibration interval |
|----------|--------------------------------|
| Fish tanks, hydroponics, or other low‑acid/base systems | Once per year for the first two years, then roughly every 6 months thereafter |
| Batch chemical manufacturing, industrial processes, or solutions with strong acids or bases | Monthly, or after each batch in extreme cases |

These guidelines are from the pH probe documentation (see “How often do you need to recalibrate a pH probe?” in the IpH_probe.pdf).

<sub>Context supplied: 5 chunk(s) from 5 document(s) — EC_K_1.0_probe.pdf, IORP_probe.pdf, Industrial-DO-probe.pdf, IpH_probe.pdf, water-quality-metrics-source-of-truth.pdf. Full text: `context/probecal-ph-interval/turn1-B.txt`</sub>

### Answer C

The pH probe should be calibrated before each sample analysis and then again after every 25 samples【1】【5】.

<sub>Context supplied: 5 chunk(s) from 2 document(s) — volunteer_stream_monitoring_a_methods_manual.pdf, IpH_probe.pdf. Full text: `context/probecal-ph-interval/turn1-C.txt`</sub>

---

## Turn 2

**Question:** Which of those applies to us?

### Rubric

**Must contain**
- maps a natural water deployment to the weak-chemistry case: yearly for the first two years, then roughly every six months
- notes fouling or a failed calibration check can force it sooner

**Must not**
- applies the industrial-process interval to this deployment

**Should cite**
- IpH_probe.pdf
- water-quality-metrics-source-of-truth.pdf

### Answer A

I can only answer questions grounded in this sensor's readings or the loaded water‑quality documents, and I don't have enough information to answer that. I would need details about your water‑quality environment (e.g., acidity, usage frequency, industrial vs. natural setting) to determine the appropriate calibration interval.

<sub>Context supplied: 5 chunk(s) from 3 document(s) — tm9a6.8.pdf, volunteer_stream_monitoring_a_methods_manual.pdf, tm9a6.2.pdf. Full text: `context/probecal-ph-interval/turn2-A.txt`</sub>

### Answer B

I can only answer questions grounded in this sensor's readings or the loaded water-quality documents, and I don't have enough information to answer that.  
I need details about your specific application (e.g., fish tank, hydroponics, industrial process) to determine the appropriate calibration interval.

<sub>Context supplied: 5 chunk(s) from 5 document(s) — EC_K_1.0_probe.pdf, IORP_probe.pdf, Industrial-DO-probe.pdf, IpH_probe.pdf, water-quality-metrics-source-of-truth.pdf. Full text: `context/probecal-ph-interval/turn2-B.txt`</sub>

### Answer C

For your deployment, the pH probe should be calibrated before each sample analysis and then again after every 25 samples【1】【5】.

<sub>Context supplied: 5 chunk(s) from 3 document(s) — tm9a6.8.pdf, tm9a6.2.pdf, volunteer_stream_monitoring_a_methods_manual.pdf. Full text: `context/probecal-ph-interval/turn2-C.txt`</sub>

