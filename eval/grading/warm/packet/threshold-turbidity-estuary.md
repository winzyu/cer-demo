# threshold-turbidity-estuary

**Class:** `precedence` · **Turns:** 2

> Answers below are labelled A/B/C in an order specific to this fixture. The same letter
> means a **different** system on another sheet. Do not compare letters across fixtures.

---

## Turn 1

**Question:** What's a normal turbidity for an estuary compared with a freshwater river?

### Rubric

**Must contain**
- gives brackish/estuarine 5–100+ NTU
- gives healthy freshwater <5–25 NTU
- notes rivers and estuaries are naturally more turbid and event-driven than open coastal water

**Must not**
- gives a single range for all water types
- invents a numeric range

**Should cite**
- water-quality-metrics-source-of-truth.pdf

### Answer A

Normal turbidity ranges differ between estuarine and freshwater systems:

| System | Typical “healthy” turbidity range (NTU) |
|--------|----------------------------------------|
| Freshwater river | < 5 – 25 NTU |
| Estuary (brackish) | 5 – 100 + NTU |

Estuaries often have higher turbidity because of suspended sediments and runoff, whereas freshwater rivers usually stay below about 25 NTU when healthy【5†L1-L5】.

<sub>Context supplied: 5 chunk(s) from 5 document(s) — EC_K_1.0_probe.pdf, IORP_probe.pdf, Industrial-DO-probe.pdf, IpH_probe.pdf, water-quality-metrics-source-of-truth.pdf. Full text: `context/threshold-turbidity-estuary/turn1-A.txt`</sub>

### Answer B

For a **freshwater river** the sensor’s operator‑provided normal range is **0 – 25 NTU**.  
For an **estuary (brackish/estuarine water)** the general guidance in the water‑quality documents lists a typical range of **5 – 100 + NTU** (often higher during tidal or storm events)【2†L2-L5】.  

So, estuarine waters normally exhibit higher turbidity than freshwater rivers, often several times the upper end of the freshwater range.

<sub>Context supplied: 5 chunk(s) from 3 document(s) — volunteer_stream_monitoring_a_methods_manual.pdf, water-quality-metrics-source-of-truth.pdf, tm9a6.8.pdf. Full text: `context/threshold-turbidity-estuary/turn1-B.txt`</sub>

### Answer C

A healthy freshwater river typically has turbidity in the **<5–25 NTU** range, while an estuary (brackish water) can normally range from **5 NTU up to 100 NTU or more** 【3†L3-L6】. These ranges are general guidance; local conditions can shift the “normal” values.

<sub>Context supplied: 5 chunk(s) from 2 document(s) — volunteer_stream_monitoring_a_methods_manual.pdf, water-quality-metrics-source-of-truth.pdf. Full text: `context/threshold-turbidity-estuary/turn1-C.txt`</sub>

---

## Turn 2

**Question:** We're at 60 — should I be worried?

### Rubric

**Must contain**
- uses the operator's authoritative turbidity range of 0 to 25 NTU for this freshwater deployment and states 60 NTU is above it
- notes the reference's estuarine band of 5-100+ NTU would place 60 within normal for an estuary, and names the discrepancy
- states the operator range governs the normal/abnormal call
- notes turbidity is event-driven — storms, dredging, tidal resuspension — so one high reading is not by itself an event

**Must not**
- treats the document's estuarine band as the authority for this deployment
- declares the reading normal without reference to the operator range

**Should cite**
- water-quality-metrics-source-of-truth.pdf

**Notes:** The operator range comes from the system prompt, not the corpus; only the estuarine band needs a citation.

### Answer A

A turbidity of 60 NTU is **within the normal range for a brackish estuary** (5 – 100 + NTU)【5†L1-L5】, so by itself it isn’t an automatic red flag.  
It is, however, well above the typical “healthy” range for a freshwater river (< 25 NTU). If the sensor is in an estuary, 60 NTU is on the higher side and could indicate recent runoff, sediment resuspension, or a storm event. If the reading is a sudden spike or remains high for an extended period, it may be worth checking for upstream activities or weather events that could be contributing to the turbidity.

<sub>Context supplied: 5 chunk(s) from 5 document(s) — EC_K_1.0_probe.pdf, IORP_probe.pdf, Industrial-DO-probe.pdf, IpH_probe.pdf, water-quality-metrics-source-of-truth.pdf. Full text: `context/threshold-turbidity-estuary/turn2-A.txt`</sub>

### Answer B

A turbidity reading of **60 NTU** is **above the operator‑provided normal range for freshwater rivers (0 – 25 NTU)**. If your sensor is in a freshwater stream, that value is higher than expected.  

In contrast, estuarine (brackish) waters often have higher turbidity, typically ranging from about **5 – 100 + NTU** depending on tidal and runoff conditions【2†L2-L5】. So if you’re monitoring an estuary, 60 NTU could be within the normal range for that environment.  

If you’re unsure whether the site is freshwater or estuarine, or if you’re seeing unusually high turbidity for a known freshwater location, it may be worth checking for recent runoff, sediment disturbance, or other local events that could elevate turbidity.

<sub>Context supplied: 5 chunk(s) from 2 document(s) — volunteer_stream_monitoring_a_methods_manual.pdf, tm9a6.8.pdf. Full text: `context/threshold-turbidity-estuary/turn2-B.txt`</sub>

### Answer C

A turbidity of 60 NTU is **above the authoritative normal range for freshwater (0–25 NTU)**, so it is not a typical reading for a clean river. It may indicate increased suspended solids—such as sediment, runoff, or algal growth—worth investigating further.

<sub>Context supplied: 5 chunk(s) from 2 document(s) — volunteer_stream_monitoring_a_methods_manual.pdf, Industrial-DO-probe.pdf. Full text: `context/threshold-turbidity-estuary/turn2-C.txt`</sub>

