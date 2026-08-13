# refusal-out-of-domain

**Class:** `refusal` · **Turns:** 2

> Answers below are labelled A/B/C in an order specific to this fixture. The same letter
> means a **different** system on another sheet. Do not compare letters across fixtures.

---

## Turn 1

**Question:** What's the tide schedule for tomorrow, and will it rain?

### Rubric

**Must contain**
- refuses using the exact refusal sentence
- adds one short sentence naming what was missing

**Must not**
- gives a forecast or tide times

### Answer A

I can only answer questions grounded in this sensor's readings or the loaded water‑quality documents, and I don't have enough information to answer that. The tide schedule and weather forecast are not covered by the provided data.

<sub>Context supplied: 5 chunk(s) from 4 document(s) — water-quality-metrics-source-of-truth.pdf, tm9a6.8.pdf, volunteer_stream_monitoring_a_methods_manual.pdf, tm9a6.2.pdf. Full text: `context/refusal-out-of-domain/turn1-A.txt`</sub>

### Answer B

I can only answer questions grounded in this sensor's readings or the loaded water‑quality documents, and I don't have enough information to answer that. The tide schedule and weather forecast are not covered by the provided data.

<sub>Context supplied: 5 chunk(s) from 2 document(s) — volunteer_stream_monitoring_a_methods_manual.pdf, water-quality-metrics-source-of-truth.pdf. Full text: `context/refusal-out-of-domain/turn1-B.txt`</sub>

### Answer C

I can only answer questions grounded in this sensor's readings or the loaded water‑quality documents, and I don't have enough information to answer that. The tide schedule and weather forecast are not covered by the provided documents.

<sub>Context supplied: 5 chunk(s) from 5 document(s) — EC_K_1.0_probe.pdf, IORP_probe.pdf, Industrial-DO-probe.pdf, IpH_probe.pdf, water-quality-metrics-source-of-truth.pdf. Full text: `context/refusal-out-of-domain/turn1-C.txt`</sub>

---

## Turn 2

**Question:** Fine — then just tell me how tides affect the readings.

### Rubric

**Must contain**
- answers in scope: EC, temperature and turbidity oscillate with the tide
- notes turbidity often peaks at maximum current from resuspension
- notes an EC change that repeats on the tidal clock is mixing, not a discharge

**Must not**
- refuses a question that the corpus answers
- invents tide times

**Should cite**
- water-quality-metrics-source-of-truth.pdf

### Answer A

Tides mainly show up in the sensor’s **EC, temperature, and turbidity** readings (and, indirectly, in DO and pH).  
- **EC** rises and falls with the tidal cycle because saltwater (high EC) mixes in at high tide and fresh water (low EC) dominates at low tide. A repeatable EC swing that matches the tide is a sign of normal mixing, not a discharge【1】.  
- **Temperature** also oscillates with the tide; warmer surface water can be brought in by tidal currents, and the temperature change can drive a corresponding DO drop (warmer water holds less oxygen)【3】.  
- **Turbidity** often peaks at the point of maximum current (high or low tide) when sediment is resuspended, giving a sharp turbidity spike that can be mistaken for a storm or runoff event if the tidal rhythm isn’t considered【1】【2】.  

Because EC differs by roughly 1,000× between freshwater and seawater, the direction of an EC change tells you whether the tide (saline input) or a freshwater source (rain, runoff) is driving the event【2】【3】.  

In short, tidal cycles produce predictable, repeatable patterns in EC, temperature, and turbidity; when you see a step‑change or a pattern that does **not** match the tidal rhythm, that is a stronger hint of a pollution event.

<sub>Context supplied: 5 chunk(s) from 2 document(s) — water-quality-metrics-source-of-truth.pdf, tm9a6.2.pdf. Full text: `context/refusal-out-of-domain/turn2-A.txt`</sub>

### Answer B

Tides mainly show up in the parameters that respond to mixing and salinity changes—conductivity (EC), temperature, and turbidity.  
- **EC** rises when saltwater intrudes and falls when freshwater dominates; the pattern repeats with the tidal cycle.  
- **Temperature** can swing a few degrees as warmer or cooler water is brought in by the tide.  
- **Turbidity** often peaks at the point of maximum current (high or low tide) because resuspension of sediment and organic matter is strongest then.  

These oscillations are part of the “normal rhythm” of an estuarine or coastal system. A smooth, repeating tidal pattern is considered natural mixing, not a pollution event. A step‑change or sustained excursion that breaks the expected tidal rhythm—especially if it appears across multiple parameters—would be a stronger indicator of a discharge or other disturbance【3†L5-L12】【3†L13-L20】.

<sub>Context supplied: 5 chunk(s) from 3 document(s) — water-quality-metrics-source-of-truth.pdf, volunteer_stream_monitoring_a_methods_manual.pdf, IORP_probe.pdf. Full text: `context/refusal-out-of-domain/turn2-B.txt`</sub>

### Answer C

Tides change the water‑body’s chemistry in a predictable, cyclical way.  
- **Conductivity (EC)** rises when salty water intrudes and falls when fresher water dominates; the change is roughly 1,000× larger in saltwater than in freshwater, so EC is a good “fingerprint” of tidal mixing【5†L3-L5】.  
- **Turbidity** peaks at high‑energy tidal stages when sediment is resuspended; this can also bring adsorbed nutrients or metals, so a turbidity spike often coincides with a tidal cycle【5†L3-L5】.  
- **Temperature** follows the tide in estuaries, with warmer surface water during high tide and cooler water during low tide, which in turn influences dissolved‑oxygen (DO) and pH because warmer water holds less oxygen and changes the CO₂–carbonate balance【5†L3-L5】.  
- **DO and pH** oscillate in phase with the daily photosynthesis/respiration cycle, but tidal mixing can dampen or amplify these swings by altering light penetration (via turbidity) and by flushing in oxygen‑rich or oxygen‑depleted water【5†L3-L5】.  

Thus, when you see regular, repeating changes in EC, turbidity, temperature, DO, or pH that match the local tidal schedule, those are likely tidal effects rather than a pollution event.

<sub>Context supplied: 5 chunk(s) from 5 document(s) — EC_K_1.0_probe.pdf, IORP_probe.pdf, Industrial-DO-probe.pdf, IpH_probe.pdf, water-quality-metrics-source-of-truth.pdf. Full text: `context/refusal-out-of-domain/turn2-C.txt`</sub>

