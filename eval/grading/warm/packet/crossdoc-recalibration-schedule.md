# crossdoc-recalibration-schedule

**Class:** `cross-document` · **Turns:** 2

> Answers below are labelled A/B/C in an order specific to this fixture. The same letter
> means a **different** system on another sheet. Do not compare letters across fixtures.

---

## Turn 1

**Question:** Give me the recalibration interval for each of our four probes.

### Rubric

**Must contain**
- pH: datasheet spec ~1 year, with body guidance of yearly for the first two years then roughly every 6 months in weak-chemistry environments
- ORP: ~1 year, with the same first-two-years-then-6-months guidance
- DO: ~1 year, with electrolyte and membrane replaced every 1–2 years
- conductivity: recalibration effectively not needed — the graphite plates do not change, and the datasheet lists ~10 years

**Must not**
- gives the same interval for all four probes
- invents an interval for any probe
- gives the conductivity probe a ~1 year interval

**Should cite**
- IpH_probe.pdf
- IORP_probe.pdf
- Industrial-DO-probe.pdf
- EC_K_1.0_probe.pdf

### Answer A

**Recalibration intervals (based on the loaded documents)**  

| Probe | Recalibration interval | Source |
|-------|------------------------|--------|
| Conductivity | No further recalibration after the initial calibration – the probe is considered “good to go.” | [1] |
| ORP | Approximately **1 year** before the next recalibration. | [5] |
| pH | No recalibration interval is provided in the loaded documents. | – |
| Temperature | No recalibration interval is provided in the loaded documents. | – |

*If you need guidance for the pH or temperature probes, the current documents do not contain that information.*

<sub>Context supplied: 5 chunk(s) from 4 document(s) — EC_K_1.0_probe.pdf, tm9a6.2.pdf, tm9a6.8.pdf, IORP_probe.pdf. Full text: `context/crossdoc-recalibration-schedule/turn1-A.txt`</sub>

### Answer B

**Recalibration intervals (approximate)**  

| Probe | Recalibration interval | Source |
|-------|------------------------|--------|
| Conductivity (EC) | ~10 years | [1] |
| ORP | ~1 year | [2] |
| Dissolved Oxygen (DO) | ~1 year | [3] |
| pH | ~1 year | [4] |

These are the “Time before recalibration” values listed in the probe specifications.

<sub>Context supplied: 5 chunk(s) from 5 document(s) — EC_K_1.0_probe.pdf, IORP_probe.pdf, Industrial-DO-probe.pdf, IpH_probe.pdf, water-quality-metrics-source-of-truth.pdf. Full text: `context/crossdoc-recalibration-schedule/turn1-B.txt`</sub>

### Answer C

**Recalibration intervals for the four probes on your deployment**

| Probe | Recommended interval (from the documents) | Source |
|-------|-------------------------------------------|--------|
| **pH probe** | • Once per year for the first two years of use. <br>• After that, every ~6 months. <br>• In industrial or strong‑acid/base environments, calibrate monthly or after each batch. | [2] (pH probe re‑hydration & calibration guidance) |
| **Dissolved‑Oxygen (DO) probe** | • No fixed schedule; best practice is to replace the electrolyte solution and membrane every **1–2 years** (or sooner if the probe shows low readings). | [4] (DO probe maintenance) |
| **ORP probe** | • No specific interval is given; the standard practice is to **calibrate before each field use**. | [1] (ORP accuracy) + [3] (general calibration before field use) |
| **Conductivity (SC) probe** | • No specific interval is given; the standard practice is to **calibrate before each field use**. | [1] (SC accuracy) + [3] (general calibration before field use) |

These intervals reflect the guidance provided in the loaded documents. If your deployment conditions differ (e.g., extreme temperatures, high ionic strength, or frequent sensor exposure to harsh chemicals), you may need to adjust the schedule accordingly.

<sub>Context supplied: 5 chunk(s) from 3 document(s) — tm9a6.8.pdf, IpH_probe.pdf, Industrial-DO-probe.pdf. Full text: `context/crossdoc-recalibration-schedule/turn1-C.txt`</sub>

---

## Turn 2

**Question:** Which of those would you do first, a year into deployment?

### Rubric

**Must contain**
- prioritizes pH, ORP and DO over conductivity
- grounds the priority in the reference's statement that pH, DO and ORP probes drift over time
- mentions DO electrolyte and membrane service at the 1–2 year mark

**Must not**
- prioritizes the conductivity probe
- invents a maintenance schedule not derivable from the datasheets

**Should cite**
- water-quality-metrics-source-of-truth.pdf
- Industrial-DO-probe.pdf

### Answer A

A year into deployment, you’d start with the **ORP probe**—the only one that requires a recalibration at that time.

<sub>Context supplied: 5 chunk(s) from 3 document(s) — volunteer_stream_monitoring_a_methods_manual.pdf, tm9a6.8.pdf, tm9a6.2.pdf. Full text: `context/crossdoc-recalibration-schedule/turn2-A.txt`</sub>

### Answer B

At the one‑year mark the **ORP, DO, and pH probes** all reach their recommended recalibration interval (≈ 1 year)【2】【3】【4】.  
The conductivity probe is still far from its ~10‑year interval【1】.

If you must pick a single probe to recalibrate first, many operators start with the **dissolved‑oxygen (DO) probe** because it is the most critical for assessing aquatic health and often drives the most urgent maintenance actions. However, you could just as well begin with the ORP or pH probe; all three are due at the same time.

<sub>Context supplied: 5 chunk(s) from 5 document(s) — EC_K_1.0_probe.pdf, IORP_probe.pdf, Industrial-DO-probe.pdf, IpH_probe.pdf, water-quality-metrics-source-of-truth.pdf. Full text: `context/crossdoc-recalibration-schedule/turn2-B.txt`</sub>

### Answer C

At the one‑year mark the **pH probe** is the first one that should be recalibrated.  
The guidance says to calibrate the pH probe once per year during the first two years of use, so a year into deployment it is due for its first scheduled calibration. The other probes either have longer replacement intervals (DO) or are calibrated before each field use (ORP, conductivity).

<sub>Context supplied: 5 chunk(s) from 2 document(s) — tm9a6.2.pdf, volunteer_stream_monitoring_a_methods_manual.pdf. Full text: `context/crossdoc-recalibration-schedule/turn2-C.txt`</sub>

