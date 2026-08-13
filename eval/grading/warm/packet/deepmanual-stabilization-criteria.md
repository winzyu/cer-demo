# deepmanual-stabilization-criteria

**Class:** `deep-in-manual` · **Turns:** 2

> Answers below are labelled A/B/C in an order specific to this fixture. The same letter
> means a **different** system on another sheet. Do not compare letters across fixtures.

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
- tm9a6.8.pdf

### Answer A

Before you log a sonde measurement, make sure the reading has met the **stabilization criteria** listed in Table 6.8‑5 of the NFM A6.8 chapter:

| Parameter | Stabilization requirement |
|-----------|---------------------------|
| **Temperature** | ± 0.2 °C |
| **Specific electrical conductance (SC)** | ± 5 µS cm⁻¹ for SC ≤ 100 µS cm⁻¹, or ± 3 % for SC > 100 µS cm⁻¹ |
| **Dissolved oxygen (DO)** | ± 0.2 mg L⁻¹ |
| **pH** | ± 0.1 pH units |
| **Turbidity** | ± 0.5 TU or 5 % of the measured value (whichever is greater) for turbidity ≤ 100 TU; 10 % of the measured value for turbidity > 100 TU |

Additionally, the sonde and its sensors should reach thermal equilibrium with the water before the values are considered stable—typically a minimum of 60 seconds, though some instruments may require longer (see NFM A6.8). Once the reading satisfies these criteria, it is ready to be recorded.

<sub>Context supplied: 5 chunk(s) from 1 document(s) — tm9a6.8.pdf. Full text: `context/deepmanual-stabilization-criteria/turn1-A.txt`</sub>

### Answer B

I can only answer questions grounded in this sensor's readings or the loaded water‑quality documents, and I don't have enough information to answer that. The missing information is specific stabilization criteria for sonde readings.

<sub>Context supplied: 5 chunk(s) from 5 document(s) — EC_K_1.0_probe.pdf, IORP_probe.pdf, Industrial-DO-probe.pdf, IpH_probe.pdf, water-quality-metrics-source-of-truth.pdf. Full text: `context/deepmanual-stabilization-criteria/turn1-B.txt`</sub>

### Answer C

For a sonde to be considered stable before you record the data, the following criteria are typically used (from the USGS guidance):

| Parameter | Stabilization criterion |
|-----------|--------------------------|
| Temperature | ± 0.2 °C |
| Specific electrical conductance (SC) | ± 5 µS/cm for SC ≤ 100 µS/cm, or ± 3 % for SC > 100 µS/cm |
| Dissolved oxygen (DO) | ± 0.2 mg L⁻¹ |
| pH | ± 0.1 pH units |
| Turbidity | ± 0.5 NTU or 5 % of the measured value (whichever is greater) for turbidity ≤ 100 NTU; or 10 % of the measured value for turbidity > 100 NTU |

These are the standard sensor stabilization criteria for field measurements【5】.

<sub>Context supplied: 5 chunk(s) from 2 document(s) — tm9a6.8.pdf, tm9a6.2.pdf. Full text: `context/deepmanual-stabilization-criteria/turn1-C.txt`</sub>

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
- tm9a6.8.pdf

### Answer A

For each new depth you should:

1. **Immerse** the sonde and let it reach thermal equilibrium with the water – **at least 60 seconds** (see NFM A6.8, §6.8.1).  
2. **Wait until the reading stabilizes** to the field‑measurement criteria:  
   * DO: ± 0.2 mg L⁻¹  
   * Temperature: ± 0.2 °C  
   * pH: ± 0.1 pH units  
   * Conductivity: ± 5 µS cm⁻¹ (≤ 100 µS cm⁻¹) or ± 3 % (> 100 µS cm⁻¹)  
   * Turbidity: ± 0.5 TU or 5 % (≤ 100 TU) / 10 % (> 100 TU)  

Only after both the thermal equilibrium and the stabilization criteria are met should you record the value.

<sub>Context supplied: 5 chunk(s) from 2 document(s) — tm9a6.2.pdf, volunteer_stream_monitoring_a_methods_manual.pdf. Full text: `context/deepmanual-stabilization-criteria/turn2-A.txt`</sub>

### Answer B

The probe specifications give the sensor’s response time, which is the time it takes for the reading to reach about 90 % of its final value after a change in conditions. For the probes in this deployment:

* Conductivity, ORP, pH, and turbidity probes: ~1 s response time (≈ 95 % in 1 s)【1】【4】  
* Dissolved‑oxygen probe: ~0.1 mg L⁻¹ s⁻¹ response time, which corresponds to roughly 1 s for a typical change in DO concentration【3】

In practice, you can record a reading after the sensor has been at the new depth for about one second, once the probe is fully submerged and the water is still. If you want to be conservative, waiting a few seconds (e.g., 2–3 s) ensures the reading has fully stabilized.

<sub>Context supplied: 5 chunk(s) from 5 document(s) — EC_K_1.0_probe.pdf, IORP_probe.pdf, Industrial-DO-probe.pdf, IpH_probe.pdf, water-quality-metrics-source-of-truth.pdf. Full text: `context/deepmanual-stabilization-criteria/turn2-B.txt`</sub>

### Answer C

When you move the sonde to a new depth, let it sit for **5–10 minutes** before taking a reading.  
This time allows the sensor to reach thermal equilibrium with the water and for the dissolved‑oxygen, temperature, and other parameters to stabilize.  
The USGS guidance notes that “allow 5 to 10 minutes for the sensor to come to thermal equilibrium with the aerated water” and that a zero‑DO calibration “waits for reading to stabilize (usually within 5–10 minutes)”【4】【2】.

<sub>Context supplied: 5 chunk(s) from 2 document(s) — volunteer_stream_monitoring_a_methods_manual.pdf, tm9a6.2.pdf. Full text: `context/deepmanual-stabilization-criteria/turn2-C.txt`</sub>

