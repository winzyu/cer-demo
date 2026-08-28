# deepmanual-stabilization-criteria

**Class:** `deep-in-manual` · **Turns:** 2

> Answers below are labelled A/B in an order specific to this fixture. The
> same letter means a **different** system on another sheet. Do not compare letters across
> fixtures.

---

## Turn 1

**Question:** What stabilization criteria should we hold a sonde reading to before recording it?

### Rubric

**Must contain**
- temperature ±0.2 °C
- DO ±0.2 mg/L
- pH ±0.1 pH units
- specific conductance ±5 µS/cm at or below 100 µS/cm, or ±3% above 100 µS/cm
- turbidity ±0.5 turbidity units or 5% of the reading, whichever is greater, at or below 100 units

**Must not**
- invents numeric criteria
- quotes probe accuracy specs from the Atlas datasheets in their place

**Should cite**
- usgs-nfm-a6.8-multiparameter-instruments.pdf

### Answer A

The stabilization criteria for recording a sonde’s field measurements are defined in Table 6.0‑1 of the National Water‑Quality Monitoring Field Manual [5]. The table lists the specific time‑ or change‑limits that a parameter must meet before the value is considered stable and can be recorded. (The exact numeric thresholds are in that table, which is not included in the excerpts provided.)

<sub>Context supplied: 5 chunk(s) from 3 document(s) — https://pubs.usgs.gov/tm/09/a6.8/tm9a6.8.pdf, https://pubs.usgs.gov/tm/09/a6.2/tm9a6.2.pdf, https://pubs.usgs.gov/tm/09/a6.0/tm9a6.0.pdf. Full text: `context/deepmanual-stabilization-criteria/turn1-A.txt`</sub>

### Answer B

For a multiparameter sonde, the USGS field‑measurement guidelines state that you should **hold the sensor reading until it stabilizes before recording it**.  
- For dissolved oxygen, the standard practice is to immerse the probe in a zero‑DO solution, wait until the reading stabilizes (usually within **5–10 minutes**), and then record it【7】.  
- The same “stabilize‑before‑record” rule applies to the other parameters (pH, ORP, conductivity, temperature, turbidity), though the exact time to reach stability can vary with the sensor and the water conditions. The guidelines recommend allowing the sensor to reach a steady value before logging the data.

<sub>Context supplied: 10 chunk(s) from 8 document(s) — EC_K_1.0_probe.pdf, IORP_probe.pdf, Industrial-DO-probe.pdf, IpH_probe.pdf, water-quality-metrics-source-of-truth.pdf, https://pubs.usgs.gov/tm/09/a6.8/tm9a6.8.pdf, https://pubs.usgs.gov/tm/09/a6.2/tm9a6.2.pdf, https://pubs.usgs.gov/tm/09/a6.0/tm9a6.0.pdf. Full text: `context/deepmanual-stabilization-criteria/turn1-B.txt`</sub>

---

## Turn 2

**Question:** How long do we wait at each new depth?

### Rubric

**Must contain**
- states a minimum of 60 seconds for the sensors and sonde body to reach thermal equilibrium
- notes some instruments need longer and the manufacturer's guidance governs

**Must not**
- invents a wait time

**Should cite**
- usgs-nfm-a6.8-multiparameter-instruments.pdf

### Answer A

For each new depth you should let the sonde equilibrate for **5–10 minutes** before taking a reading.  
After that, record **at least five sets of measurements** taken at **3–5‑minute intervals** and report the median of the last five (or more) readings.  
These are the stabilization and reporting criteria outlined in the USGS National Water‑Quality Monitoring Field Manual [4] and the DO‑sensor calibration guidance [5].

<sub>Context supplied: 5 chunk(s) from 2 document(s) — https://pubs.usgs.gov/tm/09/a6.0/tm9a6.0.pdf, https://pubs.usgs.gov/tm/09/a6.2/tm9a6.2.pdf. Full text: `context/deepmanual-stabilization-criteria/turn2-A.txt`</sub>

### Answer B

**General rule**

When you change depth, hold the sonde until the reading has *stabilized* before you log it.  
The USGS field‑measurement guidelines do not prescribe a single “wait‑time” for every depth; instead they require that you record a stable value.  

**Typical practice**

| Parameter | Typical stabilization time | How to confirm |
|-----------|---------------------------|----------------|
| Dissolved Oxygen (DO) | 5–10 min in a zero‑DO solution (or until the reading is steady in the field) | Take at least five readings 3–5 min apart and use the median of the last five or more readings【7】. |
| pH, ORP, Conductivity, Temperature, Turbidity | Usually a few minutes (often < 5 min) | Watch the display; when the value stops changing (within the sensor’s resolution) you can record it. |

**Practical steps**

1. **Lower the sonde to the new depth.**  
2. **Wait until the display shows a steady value** (no drift beyond the sensor’s resolution).  
3. **Optionally, take 5–7 readings at 3–5‑min intervals** and use the median of the last 5 or more as the recorded value (this is the procedure used for zero‑DO calibration【7】).  
4. **Record the value** once it is stable.

So, the “wait time” is essentially the time needed for the sensor to reach a steady reading—typically 5–10 minutes for DO, and usually a few minutes for the other parameters.

<sub>Context supplied: 10 chunk(s) from 7 document(s) — EC_K_1.0_probe.pdf, IORP_probe.pdf, Industrial-DO-probe.pdf, IpH_probe.pdf, water-quality-metrics-source-of-truth.pdf, https://pubs.usgs.gov/tm/09/a6.0/tm9a6.0.pdf, https://pubs.usgs.gov/tm/09/a6.2/tm9a6.2.pdf. Full text: `context/deepmanual-stabilization-criteria/turn2-B.txt`</sub>

