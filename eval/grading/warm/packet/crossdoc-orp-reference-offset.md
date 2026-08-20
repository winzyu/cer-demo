# crossdoc-orp-reference-offset

**Class:** `cross-document` · **Turns:** 2

> Answers below are labelled A/B/C in an order specific to this fixture. The same letter
> means a **different** system on another sheet. Do not compare letters across fixtures.

---

## Turn 1

**Question:** Our ORP reads 60 mV lower than the pod across the bay. Which one is wrong?

### Rubric

**Must contain**
- states ORP values depend on the electrode's reference type (Ag/AgCl vs standard hydrogen electrode) and that the reference used must be recorded for values to be comparable
- identifies our probe's construction: platinum sensing element with a silver/silver-chloride reference in KCl
- notes ionic strength makes absolute ORP readings less comparable between sites, so trend matters more than the raw number
- declines to call either pod wrong without knowing the other's reference type

**Must not**
- declares one pod faulty
- supplies a numeric conversion between reference electrodes

**Should cite**
- water-quality-metrics-source-of-truth.pdf
- IORP_probe.pdf

### Answer A

A 60 mV discrepancy is far larger than the ±5 mV accuracy that an ORP probe is specified to have (source: IORP_probe.pdf).  
Because the pod and the sensor are both measuring the same water, at least one of them is not reporting correctly.  
If the pod’s reading falls within the normal ORP range (200–400 mV) and the sensor is 60 mV lower, the sensor is the most likely culprit.  
The sensor should be recalibrated (or checked against a known reference) to confirm its accuracy.

<sub>Context supplied: 5 chunk(s) from 3 document(s) — tm9a6.8.pdf, IORP_probe.pdf, tm9a6.2.pdf. Full text: `context/crossdoc-orp-reference-offset/turn1-A.txt`</sub>

### Answer B

Both readings could be correct.  
The authoritative normal range for ORP in freshwater is +200 to +400 mV【5†L1-L3】, so a 60 mV difference still falls well within that band. ORP can vary across a bay because it reflects local electron‑transfer activity, so a 60 mV offset is not automatically an error.  

If you suspect one sensor is drifting, check its calibration, reference electrode condition, and temperature compensation, and compare the two probes under the same conditions.

<sub>Context supplied: 5 chunk(s) from 5 document(s) — EC_K_1.0_probe.pdf, IORP_probe.pdf, Industrial-DO-probe.pdf, IpH_probe.pdf, water-quality-metrics-source-of-truth.pdf. Full text: `context/crossdoc-orp-reference-offset/turn1-B.txt`</sub>

### Answer C

A 60 mV difference is far larger than the ±1 mV accuracy that an ORP probe is specified to have (see IORP_probe.pdf, accuracy ±1 mV).  
Because ORP can change with local chemistry (e.g., oxygen concentration, organic loading, salinity, temperature), a 60 mV offset could be due to:

1. **Calibration drift** – either probe may have drifted since its last calibration.  
2. **Different reference electrodes** – ORP values depend on the reference type (Ag/AgCl vs. standard hydrogen electrode).  
3. **Spatial variation** – the bay may have a real 60 mV gradient between the two sites.

So, without additional information (e.g., the absolute values, recent calibration records, or confirmation that both probes were in the same water sample), it is impossible to say definitively which reading is “wrong.”  

**What to do next**

- Verify that both probes were calibrated recently and that the calibration curves match.  
- Check that the reference electrodes are the same type and are properly maintained.  
- If possible, take a simultaneous duplicate measurement at the same location to see if the difference persists.  

If the discrepancy remains after these checks, it may reflect a true spatial difference in ORP across the bay.

<sub>Context supplied: 5 chunk(s) from 3 document(s) — IORP_probe.pdf, tm9a6.8.pdf, water-quality-metrics-source-of-truth.pdf. Full text: `context/crossdoc-orp-reference-offset/turn1-C.txt`</sub>

---

## Turn 2

**Question:** So what should I compare instead?

### Rubric

**Must contain**
- recommends comparing trends over time rather than absolute values
- recommends recording the reference type per DataPod so future values are comparable

**Must not**
- recommends comparing raw absolute values across pods

**Should cite**
- water-quality-metrics-source-of-truth.pdf

### Answer A

Compare the sensor to a calibrated reference ORP probe (or a lab‑measured standard). A reference electrode that has been verified against a known ORP standard will let you see whether the pod or the sensor is off. If the pod’s reading is within the normal 200–400 mV range, the sensor is the most likely source of the 60 mV error.

<sub>Context supplied: 5 chunk(s) from 2 document(s) — tm9a6.2.pdf, volunteer_stream_monitoring_a_methods_manual.pdf. Full text: `context/crossdoc-orp-reference-offset/turn2-A.txt`</sub>

### Answer B

Check the two probes under the **same, controlled conditions** and compare them to a **calibrated reference**:

1. **Bring both probes to the same location** (e.g., a small container of the same water) and record their ORP, DO, temperature, and pH at the same time.  
2. **Use a calibrated ORP reference electrode** (or a second, recently calibrated probe) as a benchmark.  
3. **Verify temperature compensation** – ORP is temperature‑dependent, so ensure both probes are at the same temperature or apply the same correction.  
4. **Look for correlated trends** – in freshwater, ORP should track DO (+200 to +400 mV when DO is high). If one probe shows a consistent offset while the other follows the DO trend, the offset probe is likely drifting.  

By comparing the two probes to a known reference under identical conditions, you can determine which sensor is off.

<sub>Context supplied: 5 chunk(s) from 5 document(s) — EC_K_1.0_probe.pdf, IORP_probe.pdf, Industrial-DO-probe.pdf, IpH_probe.pdf, water-quality-metrics-source-of-truth.pdf. Full text: `context/crossdoc-orp-reference-offset/turn2-B.txt`</sub>

### Answer C

Because ORP is highly sensitive to local chemistry, the best way to check a probe is to compare it against a **known, calibrated reference** rather than another field probe that may have its own drift.  

**What to compare:**

1. **A calibrated reference electrode** (e.g., a standard hydrogen electrode or a well‑maintained Ag/AgCl reference) that has been verified against a traceable standard.  
2. **A duplicate measurement** taken at the same location with a second, freshly calibrated probe.  
3. **A laboratory‑prepared standard solution** (e.g., a 0 mV ORP solution) to confirm the probe’s zero point.

If the probe’s reading matches the reference within the ±1 mV accuracy specified in IORP_probe.pdf, it is likely correct; otherwise, recalibration or replacement is needed.

<sub>Context supplied: 5 chunk(s) from 3 document(s) — volunteer_stream_monitoring_a_methods_manual.pdf, tm9a6.8.pdf, tm9a6.2.pdf. Full text: `context/crossdoc-orp-reference-offset/turn2-C.txt`</sub>

