# followup-fouling-cleaning

**Class:** `follow-up` · **Turns:** 3

> Answers below are labelled A/B/C in an order specific to this fixture. The same letter
> means a **different** system on another sheet. Do not compare letters across fixtures.

---

## Turn 1

**Question:** We've had the pod in the water for eight months and every parameter is drifting a little.

### Rubric

**Must contain**
- acknowledges the pattern — a gradual multi-parameter drift after a long deployment
- does not yet declare an environmental cause

**Must not**
- names a pollution event on this information alone

**Should cite**
- water-quality-metrics-source-of-truth.pdf

### Answer A

It’s normal for a long‑term deployment to show a slow, multi‑parameter drift. The main causes are:

1. **Calibration drift** – pH, DO, and ORP probes can shift one‑directionally over weeks or months. Check the probe calibration history and see if the trend matches the expected drift for that sensor type【1】.  
2. **Biofouling** – Optical DO sensors and other submerged probes accumulate biofilm, which can reduce sensitivity and bias the reading. Pair DO trends with the antifouling/cleaning schedule to see if the drift coincides with fouling periods【1】.  
3. **Temperature compensation** – If EC isn’t temperature‑corrected, it will track temperature changes and look like a drift. Make sure you’re looking at 25 °C‑corrected specific conductance【1】.  
4. **Reference offsets** – ORP values depend on the electrode reference (Ag/AgCl vs. SHE). If the reference type changes or drifts, the ORP trend can shift even if the water chemistry is stable【1】.

**What to do next**

- Compare the current readings to the site‑specific baseline you built over the first few months.  
- Look for step‑changes or sustained excursions that break the normal diel, tidal, or seasonal rhythm; those are more likely real events than gradual drift.  
- If the drift is consistent across all parameters, it’s probably a sensor issue rather than a water‑quality change.  

If you need help interpreting a specific trend or deciding whether a cleaning or recalibration is warranted, let me know the latest values and the calibration history.

<sub>Context supplied: 5 chunk(s) from 1 document(s) — water-quality-metrics-source-of-truth.pdf. Full text: `context/followup-fouling-cleaning/turn1-A.txt`</sub>

### Answer B

It’s common for a long‑term deployment to show a slow, one‑directional shift in all of the parameters.  The most likely causes are **sensor drift** (the electrodes or membranes change over time) and **bio‑fouling** (organisms grow on the probe and alter the signal).  Here’s what you can do:

| Parameter | Typical drift cause | What to check / do |
|-----------|---------------------|--------------------|
| **Dissolved Oxygen (DO)** | Electrolyte depletion and membrane fouling.  The probe can last ~2 yr before the electrolyte is exhausted; best practice is to replace the electrolyte and membrane every 1–2 yr.  A gradual, consistent drop in DO can be a sign of this.  (Source: Industrial‑DO‑probe.pdf, section “How often do you need to recalibrate a dissolved oxygen probe?”) | • Verify the last electrolyte replacement date.  <br>• Clean the membrane and electrodes (see “How to add more electrolyte solution” and “How to recondition the industrial Dissolved Oxygen probe”).  <br>• Re‑calibrate the DO sensor. |
| **ORP** | Reference electrode drift; the probe needs recalibration about once per year for the first two years, then every ~6 months.  (Source: IORP_probe.pdf, section “How often do you need to recalibrate an ORP probe?”) | • Re‑calibrate the ORP probe.  <br>• Inspect the platinum tip for deposits; clean with a mild bleach solution if needed. |
| **pH** | Reference electrode drift; similar schedule to ORP.  (Source: IpH_probe.pdf, section “How often do you need to recalibrate a pH probe?”) | • Re‑calibrate the pH probe.  <br>• Check the glass bulb for coating; clean with a mild bleach or KCl solution. |
| **Conductivity (EC)** | Fouling or scaling on the graphite plates can change the effective cell area.  (Source: EC_K_1.0_probe.pdf, section “Operating principle” and “Helpful operating tips”) | • Lightly tap or brush the probe to remove bubbles and deposits.  <br>• Verify that the probe is fully submerged and that the cable is not picking up noise. |
| **Turbidity** | No drift is expected, but a gradual rise can indicate sediment build‑up on the sensor.  (Source: EC_K_1.0_probe.pdf, “Helpful operating tips”) | • Clean the turbidity sensor according to the manufacturer’s instructions. |
| **Temperature** | Usually stable; a drift could indicate a sensor‑temperature mismatch or a change in the water column.  (Source: EC_K_1.0_probe.pdf, “Operating principle”) | • Verify the temperature sensor is functioning and that the probe is not in a thermal hotspot. |

### Practical steps

1. **Log the last calibration dates** for each probe.  
2. **Perform a full calibration** on all sensors (DO, ORP, pH, EC, turbidity, temperature).  
3. **Clean or replace** any electrodes or membranes that show visible fouling or deposits.  
4. **Check the cable and connectors** for corrosion or loose connections that could introduce drift.  
5. **Re‑install the probe** in the same location and monitor for a few days to confirm that the drift has stopped.

If, after these steps, the parameters still drift in the same direction, it may be time to **replace the probe** (especially the DO probe, which is designed for ~2 yr of electrolyte life).  

---

**Note:** The sensor cannot tell you whether the water is safe to swim in or drink; for that you should consult local public‑health authorities.

<sub>Context supplied: 5 chunk(s) from 5 document(s) — EC_K_1.0_probe.pdf, IORP_probe.pdf, Industrial-DO-probe.pdf, IpH_probe.pdf, water-quality-metrics-source-of-truth.pdf. Full text: `context/followup-fouling-cleaning/turn1-B.txt`</sub>

### Answer C

It’s normal for a long‑term deployment to show a slow, systematic shift in all the parameters. The most common causes are:

| Parameter | Typical drift source | What to check |
|-----------|----------------------|---------------|
| **pH, DO, ORP** | Calibration drift of the probe electrodes (often one‑directional over weeks) | Review the probe’s calibration log; compare recent calibration values to the first‑deployment values. |
| **ORP** | Reference electrode type (Ag/AgCl vs. standard hydrogen) can change the baseline | Verify which reference was used and whether it has been swapped or aged. |
| **Conductivity (EC)** | Temperature changes not corrected for 25 °C; sensor fouling | Ensure EC is reported as 25 °C‑corrected; check the temperature‑compensation routine. |
| **Turbidity** | Biofilm or particulate buildup on the optical sensor | Inspect the sensor for fouling; schedule a cleaning or antifouling cycle. |

The manual notes that “a slow one‑directional trend across weeks may be drift, not water chemistry” and that “pair DO trends with the antifouling/cleaning schedule” (see *Sensor & Data‑Quality Caveats* and *Biofouling* sections).  

So, review the calibration history, confirm temperature compensation for EC, and check the cleaning schedule for the optical sensors. If the drift is still unexplained, consider recalibrating or replacing the affected probes.

<sub>Context supplied: 5 chunk(s) from 2 document(s) — volunteer_stream_monitoring_a_methods_manual.pdf, water-quality-metrics-source-of-truth.pdf. Full text: `context/followup-fouling-cleaning/turn1-C.txt`</sub>

---

## Turn 2

**Question:** Is that the water or the pod?

### Rubric

**Must contain**
- resolves "that" to the multi-parameter drift
- states that a gradual multi-parameter drift after a long deployment is a fouling/maintenance flag first and an environmental signal second
- recommends checking calibration history and servicing before treating it as an event

**Must not**
- attributes the drift to water chemistry without raising fouling

**Should cite**
- water-quality-metrics-source-of-truth.pdf

### Answer A

The slow, multi‑parameter drift you’re seeing is most likely a **sensor‑related issue** (calibration drift, biofouling, reference offset, etc.) rather than a change in the water itself. The documents note that DO, pH, and ORP probes can drift over weeks or months, and that fouling or reference changes can bias all parameters at once【1】【4】. If the water chemistry were changing, you’d expect more abrupt, correlated shifts rather than a gradual, uniform trend across all metrics.

<sub>Context supplied: 5 chunk(s) from 2 document(s) — volunteer_stream_monitoring_a_methods_manual.pdf, water-quality-metrics-source-of-truth.pdf. Full text: `context/followup-fouling-cleaning/turn2-A.txt`</sub>

### Answer B

The drift you’re seeing can come from **either the water or the pod (or both)**.  
- **Pod‑related causes**:  
  * **Sensor drift** – electrodes, membranes, and reference points slowly change over months (e.g., DO electrolyte depletion, ORP/​pH reference electrode aging).  
  * **Bio‑fouling** – organisms grow on the probe and alter the signal.  
  * **Mechanical or electrical noise** – cable or connector issues can introduce a slow offset.  
  (See *Industrial‑DO‑probe.pdf* “How often do you need to recalibrate a dissolved oxygen probe?”; *IORP_probe.pdf* “How often do you need to recalibrate an ORP probe?”; *IpH_probe.pdf* “How often do you need to recalibrate a pH probe?”; *EC_K_1.0_probe.pdf* “Helpful operating tips”.)

- **Water‑related causes**:  
  * Genuine changes in water chemistry (e.g., increased ion content, temperature shifts, organic loading) will also produce a gradual change in all parameters.  
  * Seasonal or tidal cycles can produce slow trends that look like drift.

**How to tell which is dominant**

1. **Re‑calibrate all probes**. If the drift disappears, it was mainly sensor drift.  
2. **Clean or replace fouled components** (membrane, electrodes).  
3. **Compare to a baseline** you recorded when the pod was first deployed. If the new values are still within the normal ranges (pH 6.5‑8.5, ORP 200‑400 mV, DO 5‑14 mg L⁻¹, conductivity 0‑1500 µS cm⁻¹, turbidity 0‑25 NTU, temperature 32‑95 °F) and the trend is still present, the water itself may be changing.  
4. **Check for external events** (rainfall, discharge, temperature spikes) that could explain a real water‑quality shift.

So, the drift is most likely a combination of **sensor aging/fouling** and **actual water‑quality changes**. Re‑calibration and cleaning will tell you how much of the trend is due to the pod.

<sub>Context supplied: 5 chunk(s) from 5 document(s) — EC_K_1.0_probe.pdf, IORP_probe.pdf, Industrial-DO-probe.pdf, IpH_probe.pdf, water-quality-metrics-source-of-truth.pdf. Full text: `context/followup-fouling-cleaning/turn2-B.txt`</sub>

### Answer C

The drift you’re seeing is almost always a **pod‑related issue** rather than a change in the water itself.  
- **Electrode drift** (pH, DO, ORP) and **temperature‑compensation errors** in the conductivity sensor are common over months of continuous use.  
- **Biofouling** on the optical turbidity sensor can make the reading trend upward or downward.  

The manual notes that “a slow one‑directional trend across weeks may be drift, not water chemistry” and that “pair DO trends with the antifouling/cleaning schedule” (see *Sensor & Data‑Quality Caveats* and *Biofouling* sections).  

So the likely culprit is the pod’s sensors or their maintenance schedule, not a change in the water’s chemistry.

<sub>Context supplied: 5 chunk(s) from 1 document(s) — volunteer_stream_monitoring_a_methods_manual.pdf. Full text: `context/followup-fouling-cleaning/turn2-C.txt`</sub>

---

## Turn 3

**Question:** What do I clean them with?

### Rubric

**Must contain**
- resolves "them" to the probes
- pH: soft coatings removed by vigorous stirring or a squirt bottle, organic or hard coatings chemically with a light bleach solution
- ORP: same soft/hard split, with a light bleach solution or a 5–10% HCl soak for hard coatings
- conductivity: soft coatings lightly brushed around the conducting area, hard coatings removed chemically
- states that abrasives and brushes must not be used on the pH or ORP probes

**Must not**
- recommends brushing or abrasive cleaning of the pH or ORP probe
- gives one cleaning method for all probes

**Should cite**
- IpH_probe.pdf
- IORP_probe.pdf
- EC_K_1.0_probe.pdf

### Answer A

**General cleaning (all probes)**  
- Use a **mild, non‑phosphate detergent solution** (e.g., a gentle dish soap diluted in water).  
- Clean with a **small, non‑abrasive brush, cotton swab, or cloth**.  
- Rinse thoroughly with **deionized (DI) water** to remove any detergent residue.  
- Avoid organic solvents or corrosive chemicals unless the manufacturer specifically says so【1】.  
- Do not coat the sonde or sensors with paint or anti‑fouling paint unless instructed by the manufacturer【1】.

**ORP probe‑specific**  
- If the platinum tip has a soft coating, remove it by **vigorous stirring or a squirt bottle**.  
- For hard or chemical coatings, use a **light bleach solution** or a **5–10 % HCl soak for a few minutes**; this often removes the coating without damaging the probe【4】.  
- Never use abrasive materials on the ORP probe【4】.

**pH probe**  
- If dried KCl residue appears, simply **rinse the probe with water**; it is not damaged【4】.

Follow the manufacturer’s operating manual for any instrument‑specific nuances, but the above steps are the standard, recommended cleaning agents for most multiparameter probes.

<sub>Context supplied: 5 chunk(s) from 3 document(s) — tm9a6.8.pdf, volunteer_stream_monitoring_a_methods_manual.pdf, IORP_probe.pdf. Full text: `context/followup-fouling-cleaning/turn3-A.txt`</sub>

### Answer B

**Cleaning the probes – what to use**

| Probe | Recommended cleaning solution / method | Key points / source |
|-------|--------------------------------------|---------------------|
| **Conductivity (EC)** | • Rinse with clean tap water.  <br>• If deposits are visible, lightly brush the graphite plates with a soft, non‑abrasive brush.  <br>• Avoid harsh chemicals; the probe is food‑safe and the graphite plates are not meant to be chemically cleaned. | “Helpful operating tips” – tap the probe to knock out bubbles and brush the conducting area (EC_K_1.0_probe.pdf). |
| **ORP** | • Light bleach solution (e.g., 1 % sodium hypochlorite) or a 5–10 % HCl soak for a few minutes.  <br>• Rinse thoroughly with clean water afterward. | “Probe cleaning” – soft coatings removed by a light bleach solution or 5–10 % HCl (IORP_probe.pdf). |
| **pH** | • Light bleach solution (≈ 1 % sodium hypochlorite).  <br>• Rinse thoroughly with clean water. | “Probe cleaning” – hard coatings removed with a light bleach solution (IpH_probe.pdf). |
| **Dissolved Oxygen (DO)** | • Mild bleach mixture (≈ 1 % sodium hypochlorite) to wash the membrane and electrode surfaces.  <br>• After cleaning, re‑fill the electrolyte and rinse the probe with clean water. | “Probe cleaning” – soft coatings removed by a mild bleach mixture (Industrial‑DO‑probe.pdf). |
| **Turbidity** | • Rinse with clean water; if a film or sediment is visible, gently wipe with a soft, non‑abrasive cloth. | No specific chemical is listed; the manufacturer recommends rinsing the sensor (EC_K_1.0_probe.pdf). |

**General cleaning tips**

1. **Remove the probe from the water** before cleaning.  
2. **Avoid abrasive tools** (no metal files on the ORP or pH tips, no stiff brushes on the conductivity plates).  
3. **Rinse thoroughly** with clean water after any chemical soak to remove residual bleach or acid.  
4. **Re‑calibrate** each probe after cleaning to confirm the signal is back in the expected range.  

These steps should help stop the slow drift you’re seeing and keep each sensor giving reliable readings.

<sub>Context supplied: 5 chunk(s) from 5 document(s) — EC_K_1.0_probe.pdf, IORP_probe.pdf, Industrial-DO-probe.pdf, IpH_probe.pdf, water-quality-metrics-source-of-truth.pdf. Full text: `context/followup-fouling-cleaning/turn3-B.txt`</sub>

### Answer C

I can only answer questions grounded in this sensor's readings or the loaded water‑quality documents, and I don't have enough information to answer that. The documents do not provide details on cleaning agents for the pod sensors.

<sub>Context supplied: 5 chunk(s) from 1 document(s) — volunteer_stream_monitoring_a_methods_manual.pdf. Full text: `context/followup-fouling-cleaning/turn3-C.txt`</sub>

