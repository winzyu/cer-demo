# fouling-do-erratic

**Class:** `fouling-drift` · **Turns:** 2

> Answers below are labelled A/B/C in an order specific to this fixture. The same letter
> means a **different** system on another sheet. Do not compare letters across fixtures.

---

## Turn 1

**Question:** DO has gone erratic — jumping around instead of tracing a smooth curve.

### Rubric

**Must contain**
- names zinc-oxide corrosion building up around the anode as a cause of irregular readings
- gives the reconditioning steps: file the corrosion off the anode, not the cathode, then refill electrolyte and reassemble
- names a worn membrane as another cause of irregular readings, remedied by replacing the membrane cap

**Must not**
- recommends filing the cathode
- invents a failure mode absent from the datasheet

**Should cite**
- Industrial-DO-probe.pdf

### Answer A

The DO probe is a galvanic sensor that relies on a small amount of oxygen to generate a voltage. When the probe’s environment or condition changes, the voltage can fluctuate rapidly, giving the “jumping” pattern you’re seeing. Common causes include:

| Cause | What happens | Why it causes erratic readings |
|-------|--------------|--------------------------------|
| **Insufficient water movement** | The probe consumes a tiny amount of oxygen; stagnant water can’t replenish it quickly. | The probe’s voltage drops and recovers unevenly, producing spikes. The spec notes that ~60 mL min⁻¹ of flow is needed for stable readings【3†L2-L4】. |
| **Bio‑fouling / deposits** | Micro‑organisms or chemical deposits build on the membrane or electrodes. | They alter the probe’s electrical resistance, causing sudden changes in the output voltage. Cleaning or replacing the membrane can restore stability【3†L11-L13】【3†L19-L21】. |
| **Electrolyte depletion** | The internal electrolyte is consumed over time. | A low‑electrolyte probe reads very low or fluctuating values; replacing the electrolyte every 1–2 years is recommended【3†L7-L9】【3†L15-L17】. |
| **Calibration drift** | The probe’s zero/span shifts gradually. | A slow trend can appear as erratic jumps when the sensor crosses calibration thresholds. Re‑calibrate annually for the first two years, then every ~6 months in weak environments【3†L23-L25】【3†L27-L29】. |
| **Temperature changes** | The probe’s voltage is temperature‑dependent. | Rapid temperature swings can cause the DO reading to jump unless temperature‑compensated. The probe has an internal PT‑1000 sensor for this purpose【3†L5-L7】. |
| **Electrical noise or cable issues** | Long cables or poor shielding can pick up interference. | Noise can be interpreted as voltage changes. Use proper isolation or shorter cables if possible【6†L1-L4】. |

**What to do next**

1. **Check water flow** – ensure at least ~60 mL min⁻¹ of movement around the probe.  
2. **Inspect and clean** – gently brush the membrane and electrodes; if fouling is heavy, use a mild bleach solution as described in the maintenance guide【3†L19-L21】.  
3. **Replace electrolyte** – if the probe is >1–2 years old, add fresh electrolyte solution.  
4. **Re‑calibrate** – perform a full calibration and verify the span.  
5. **Verify cable integrity** – confirm the SMA connector is secure and the cable is not damaged.

If after these steps the DO still jumps, the probe may need replacement.

<sub>Context supplied: 5 chunk(s) from 5 document(s) — EC_K_1.0_probe.pdf, IORP_probe.pdf, Industrial-DO-probe.pdf, IpH_probe.pdf, water-quality-metrics-source-of-truth.pdf. Full text: `context/fouling-do-erratic/turn1-A.txt`</sub>

### Answer B

Erratic DO can be a sensor‑related issue rather than a real water‑quality change.  
- Optical DO probes often drift or foul with biofilm, producing sudden jumps or a “noisy” trend【1】.  
- Check the probe’s calibration history and the antifouling/clean‑up schedule; a slow, one‑directional trend over weeks is usually drift, not a pollution event【1】.  
- Compare DO to temperature and other parameters (pH, ORP, turbidity). If DO jumps without corresponding changes in the other metrics, it’s likely a sensor problem.  

If the sensor is clean and calibrated, look for a sudden step‑change that breaks the expected diel cycle—this would suggest a real event rather than instrument noise.

<sub>Context supplied: 5 chunk(s) from 3 document(s) — water-quality-metrics-source-of-truth.pdf, volunteer_stream_monitoring_a_methods_manual.pdf, tm9a6.2.pdf. Full text: `context/fouling-do-erratic/turn1-B.txt`</sub>

### Answer C

The sensor’s DO probe can become erratic for a few common reasons:

1. **Calibration drift or incomplete calibration** – DO sensors must be calibrated in a saturated‑air chamber or with a wet‑towel method. If the calibration was not verified or if water droplets were on the optical module, the sensor can give spurious readings【1】.  
2. **Air bubbles or gas leaks** – Air bubbles introduced through tubing or a loose seal can cause sudden jumps in DO. Ensure the sensor is fully submerged and the tubing is gas‑tight【2】.  
3. **Temperature sensor error** – DO is temperature‑dependent. A mis‑calibrated or fouled temperature probe will make the DO calculation unstable【1】.  
4. **Sensor fouling or biofilm** – Over time, algae or sediment can coat the optical sensor, leading to erratic signals. Inspect and clean the probe if fouling is suspected.  
5. **Turbulent flow or rapid depth changes** – If the sensor is in a highly turbulent section or is moving, the DO reading can fluctuate rapidly. Position the sensor in a well‑mixed, stable zone if possible.

**What to do next**

- Re‑calibrate the DO sensor using the wet‑towel method or a saturated‑air chamber.  
- Inspect the optical module for water droplets or fouling and clean it.  
- Verify that the temperature probe is accurate and that the sensor is fully submerged.  
- Check the tubing and seals for leaks or air bubbles.  
- If the problem persists, consider replacing the probe or consulting the instrument manufacturer.

These steps should help restore a smooth, reliable DO curve.

<sub>Context supplied: 5 chunk(s) from 2 document(s) — tm9a6.2.pdf, volunteer_stream_monitoring_a_methods_manual.pdf. Full text: `context/fouling-do-erratic/turn1-C.txt`</sub>

---

## Turn 2

**Question:** Could it just be that the water is still?

### Rubric

**Must contain**
- states the galvanic probe consumes a small amount of the oxygen it reads, so some water movement is required
- gives the figure of approximately 60 mL/min
- concludes stagnant water can depress or destabilise readings

**Must not**
- denies any flow dependence
- invents a different flow requirement

**Should cite**
- Industrial-DO-probe.pdf

### Answer A

Yes. The dissolved‑oxygen probe is a galvanic sensor that **consumes a tiny amount of oxygen** as it generates its voltage. If the water around the probe is stagnant, the probe can’t be replenished quickly enough, so the voltage (and the reported DO) will rise and fall erratically. The manufacturer’s spec notes that about **60 mL min⁻¹ of water movement** is needed for stable readings【3†L2-L4】. So a still or very low‑flow environment is a common cause of the “jumping” DO pattern you’re seeing.

<sub>Context supplied: 5 chunk(s) from 5 document(s) — EC_K_1.0_probe.pdf, IORP_probe.pdf, Industrial-DO-probe.pdf, IpH_probe.pdf, water-quality-metrics-source-of-truth.pdf. Full text: `context/fouling-do-erratic/turn2-A.txt`</sub>

### Answer B

Still water can reduce mixing and lead to lower, more variable DO, but a “jumping” pattern is usually a sensor issue. Optical DO probes often drift or foul, producing sudden spikes or noise that break the smooth diel cycle you’d expect in a well‑mixed stream【1】. If the temperature, pH, ORP, and turbidity are steady, the erratic DO is more likely due to calibration drift or biofouling than to the water simply being still.

<sub>Context supplied: 5 chunk(s) from 2 document(s) — volunteer_stream_monitoring_a_methods_manual.pdf, water-quality-metrics-source-of-truth.pdf. Full text: `context/fouling-do-erratic/turn2-B.txt`</sub>

### Answer C

A still‑water stream can make DO readings a little less stable because the water isn’t being well mixed, so local pockets of higher or lower oxygen can appear. However, the kind of “jumping around” you’re seeing is usually a sensor problem rather than a natural effect of stillness.

Typical causes of erratic DO (from the monitoring manual) include:

* **Calibration drift or incomplete calibration** – DO probes must be calibrated in a saturated‑air chamber or with a wet‑towel method. If the calibration was missed or the probe was wet, the sensor can give spurious spikes【1】.  
* **Air bubbles or gas leaks** – Bubbles in the tubing or a loose seal can cause sudden jumps in the reading【2】.  
* **Temperature sensor error** – DO is temperature‑dependent; a mis‑calibrated or fouled temperature probe will make the DO calculation unstable【1】.  
* **Sensor fouling or biofilm** – Over time, algae or sediment can coat the optical sensor, leading to erratic signals【2】.  

In contrast, still water may produce a flatter curve but not the abrupt, random jumps you’re describing. So it’s more likely a sensor‑related issue. Re‑calibrate the probe, check for bubbles, clean the optical module, and verify the temperature sensor. If the problem persists, consider replacing the DO probe.

<sub>Context supplied: 5 chunk(s) from 2 document(s) — volunteer_stream_monitoring_a_methods_manual.pdf, water-quality-metrics-source-of-truth.pdf. Full text: `context/fouling-do-erratic/turn2-C.txt`</sub>

