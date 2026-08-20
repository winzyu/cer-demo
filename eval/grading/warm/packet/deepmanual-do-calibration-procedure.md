# deepmanual-do-calibration-procedure

**Class:** `deep-in-manual` · **Turns:** 2

> Answers below are labelled A/B/C in an order specific to this fixture. The same letter
> means a **different** system on another sheet. Do not compare letters across fixtures.

---

## Turn 1

**Question:** Walk me through the one-point DO calibration options for a field sonde.

### Rubric

**Must contain**
- names Procedure 1 — calibration in air, using an air-calibration chamber or the wet-towel variation
- names Procedure 2 — calibration in air-saturated water (water bubbled with air)
- states the goal is a 100-percent-saturated oxygen environment with the sensor and its thermistor at the same temperature
- cites the USGS dissolved-oxygen field-methods chapter

**Must not**
- describes a calibration procedure not present in the corpus
- presents the Atlas datasheet's maintenance steps as the USGS calibration procedure

**Should cite**
- tm9a6.2.pdf

**Notes:** Refusal is the expected direct-feed behaviour and is graded as a miss, not as a groundedness failure.

### Answer A

**One‑point calibration options for a field DO sonde**

| Option | What you calibrate | How to do it | Notes |
|--------|-------------------|--------------|-------|
| **Zero‑point (de‑oxygenated water)** | Sets the 0 mg L⁻¹ reference | 1. Purge a small volume of the probe with nitrogen or a de‑oxygenated gas for a few minutes.<br>2. Place the probe in the nitrogen‑purged water and let it equilibrate.<br>3. Use the sonde’s calibration command (e.g., `CAL 0`) to record the zero reading. | The probe’s internal temperature sensor automatically compensates for temperature, so you don’t need a separate temperature correction. |
| **Full‑scale (oxygen‑saturated water)** | Sets the 100 mg L⁻¹ reference (or the probe’s maximum) | 1. Saturate a container of water with air (or use a commercial DO calibration solution) at the temperature you expect to measure.<br>2. Immerse the probe fully and allow it to equilibrate.<br>3. Use the sonde’s calibration command (e.g., `CAL 100`) to record the full‑scale reading. | Because the probe is galvanic, a small water flow (≈ 60 mL min⁻¹) helps keep the membrane clean and the reading stable. |
| **Single‑point at a known concentration** | Sets the probe to a specific DO value (e.g., 5 mg L⁻¹) | 1. Prepare a calibration solution with a known DO concentration (commercially available or calculated from temperature and salinity).<br>2. Immerse the probe and let it equilibrate.<br>3. Use the sonde’s calibration command (e.g., `CAL 5`) to lock the sensor to that value. | Useful when you only need a quick check against a reference value and don’t want to perform a full two‑point calibration. |

**Key points from the probe documentation**

* The probe has an internal temperature sensor (Class A platinum RTD) and reports temperature‑corrected DO automatically【3†L1-L5】.  
* The probe’s response time is 90 % in 1 s【3†L1-L5】, so you can perform quick calibrations in the field.  
* The probe’s lifespan is ~4 years, and the electrolyte can be replaced every 1–2 years to maintain accuracy【3†L1-L5】.  

**Practical workflow for a field sonde**

1. **Prepare the calibration environment** – keep the probe submerged in a clean, well‑mixed water sample.  
2. **Choose the calibration point** – zero, full‑scale, or a known concentration.  
3. **Equilibrate** – allow the probe to stabilize (usually a few minutes).  
4. **Execute the calibration command** – most sonde firmware accepts a simple `CAL <value>` command.  
5. **Verify** – after calibration, check the reading against a reference (e.g., a calibrated DO meter) to confirm accuracy.  

These one‑point options give you flexibility: a quick zero check, a full‑scale check, or a single‑point calibration when you only need to verify a specific DO level.

<sub>Context supplied: 5 chunk(s) from 5 document(s) — EC_K_1.0_probe.pdf, IORP_probe.pdf, Industrial-DO-probe.pdf, IpH_probe.pdf, water-quality-metrics-source-of-truth.pdf. Full text: `context/deepmanual-do-calibration-procedure/turn1-A.txt`</sub>

### Answer B

**One‑point DO calibration for a field sonde**

The goal of a one‑point calibration is to place the DO sensor and its thermistor in a 100 % oxygen‑saturated environment at the same temperature. Two common procedures are used in the field:

| Procedure | How it’s done | Key steps | Notes |
|-----------|---------------|-----------|-------|
| **Procedure 1 – Calibration in air** | Use an air‑calibration chamber or the wet‑towel method. | 1. Place the sonde in the chamber (or on a wet towel).  <br>2. Allow the sensor and thermistor to equilibrate to the ambient air temperature.  <br>3. Record the sensor reading; it should match the 100 % saturation value for that temperature. | • Works well when a chamber is available.  <br>• The wet‑towel method is a quick field check that can be performed on site.  <br>• The sensor’s temperature must be stable and equal to the air temperature. |
| **Procedure 2 – Calibration in air‑saturated water** | Bubble air into a water bath to saturate it, then immerse the sonde. | 1. Bubble air into a water bath until the water is fully saturated (typically 5–10 min).  <br>2. Immerse the sonde so that the sensor and thermistor are in the saturated water.  <br>3. Allow the sensor to equilibrate to the water temperature.  <br>4. Record the reading; it should equal the 100 % saturation value for that temperature. | • Provides a true 100 % saturation environment.  <br>• Requires a water bath and a source of air.  <br>• The sensor and thermistor must be at the same temperature as the water. |

**After the one‑point calibration**

1. **Verify zero‑DO performance** (e.g., with a sodium sulfite solution) to ensure the sensor can read near zero when required.  
2. **Check the calibration** against the DO solubility tables (e.g., https://water.usgs.gov/software/DOTABLES) to confirm the reading is within ±0.2 mg L⁻¹ of the expected 100 % saturation value.  

These steps are described in the USGS guidance (see “One‑point calibration” in tm9a6.2.pdf) and are the standard approach for field sonde calibration.

<sub>Context supplied: 5 chunk(s) from 2 document(s) — tm9a6.2.pdf, tm9a6.8.pdf. Full text: `context/deepmanual-do-calibration-procedure/turn1-B.txt`</sub>

### Answer C

**One‑point DO calibration for a field sonde**

A one‑point calibration sets the sensor to a 100 % saturated oxygen condition (the same temperature as the water).  
There are two common ways to achieve this:

| Option | What you do | Key steps | Notes |
|--------|-------------|-----------|-------|
| **Procedure 1 – Calibration in air** | Use the instrument’s calibration chamber (or a wet‑towel method). | 1. Wet the chamber, then drain so only a thin film remains. <br>2. Insert the sensor, ensuring it is not sealed against the chamber (maintain ambient barometric pressure). <br>3. Allow 5–10 min for the air to saturate with water vapor and for the sensor to equilibrate. <br>4. Measure ambient pressure (to the nearest 1 mm Hg). <br>5. Monitor temperature and DO until readings stabilize. <br>6. Use the DO‑solubility table or DOTABLES to find the saturation value for the measured temperature and pressure. <br>7. Adjust the instrument to that saturation value. | • Preferred by many manufacturers for field checks. <br>• Requires a stable temperature and a calibrated barometer. <br>• The sensor and chamber must be at the same temperature. |
| **Procedure 2 – Calibration in air‑saturated water** | Bubble air into a water sample to create a 100 % saturated solution, then calibrate the sensor in that water. | 1. Prepare a water sample and bubble air until it is fully saturated. <br>2. Place the sensor in the saturated water. <br>3. Allow the sensor to equilibrate with the water temperature. <br>4. Measure the temperature and pressure as above. <br>5. Use the saturation value from the tables or DOTABLES. <br>6. Adjust the instrument to that value. | • Often used in the laboratory because it can be more precise. <br>• Requires a water bath or a well‑mixed saturated water column. <br>• The sensor’s temperature must match the water temperature. |

**General points for both procedures**

* The calibration should be performed at the same temperature as the water you will later sample.  
* After calibration, verify the sensor’s reading is within ±0.2 mg L⁻¹ (or 2 %) of the calculated saturation value.  
* Perform a calibration check at each field site and recalibrate if the check fails.  
* Keep the sensor and its logbook updated with all calibration details.  

These steps are drawn from the USGS field‑sonde manual (see sections on one‑point calibration, Procedures 1 and 2, and the DO‑solubility tables)【1】【2】【3】【4】.

<sub>Context supplied: 5 chunk(s) from 1 document(s) — tm9a6.2.pdf. Full text: `context/deepmanual-do-calibration-procedure/turn1-C.txt`</sub>

---

## Turn 2

**Question:** Which of those is recommended at the field site itself?

### Rubric

**Must contain**
- identifies the air calibration or check with the wet-towel variation as the method recommended at the field site
- notes the air-saturated-water method is generally favoured for laboratory calibrations because of the equipment required

**Must not**
- invents a recommendation

**Should cite**
- tm9a6.2.pdf

### Answer A

**Recommended field‑site calibration:**  
The **zero‑point (de‑oxygenated water) calibration** is the one you should perform on‑site.  

* It’s quick (a few minutes of nitrogen purging),  
* the probe’s internal temperature sensor automatically compensates for temperature, and  
* it ensures the sensor is properly zeroed before you start collecting data.  

Full‑scale or single‑point calibrations are usually done in a lab or with a calibrated reference solution, so the zero‑point check is the standard field‑site procedure.

<sub>Context supplied: 5 chunk(s) from 5 document(s) — EC_K_1.0_probe.pdf, IORP_probe.pdf, Industrial-DO-probe.pdf, IpH_probe.pdf, water-quality-metrics-source-of-truth.pdf. Full text: `context/deepmanual-do-calibration-procedure/turn2-A.txt`</sub>

### Answer B

The USGS guidance notes that the **wet‑towel method** is the one‑point calibration that can be done directly at a field site.  
It is described as a “quick field check that can be performed on site”【1†L1-L4】, whereas the air‑saturated‑water method requires a water bath and a source of air, which are usually not available in the field.  

So, if you’re calibrating a sonde on the spot, use the wet‑towel method.

<sub>Context supplied: 5 chunk(s) from 3 document(s) — volunteer_stream_monitoring_a_methods_manual.pdf, tm9a6.8.pdf, tm9a6.2.pdf. Full text: `context/deepmanual-do-calibration-procedure/turn2-B.txt`</sub>

### Answer C

The field‑site one‑point DO calibration that the USGS NFM recommends is the **air‑calibration** (Procedure 1).  
It is the simplest to perform in the field, requires only a wet‑towel chamber and a barometer, and is described as a routine field method for most natural waters【1】【2】【3】【4】.  
The air‑saturated‑water calibration is more suited to laboratory or controlled‑water‑bath conditions and is not the typical field‑site procedure.

<sub>Context supplied: 5 chunk(s) from 2 document(s) — tm9a6.8.pdf, tm9a6.2.pdf. Full text: `context/deepmanual-do-calibration-procedure/turn2-C.txt`</sub>

