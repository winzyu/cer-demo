# probecal-conductivity-interval

**Class:** `probe-calibration` · **Turns:** 2

> Answers below are labelled A/B/C in an order specific to this fixture. The same letter
> means a **different** system on another sheet. Do not compare letters across fixtures.

---

## Turn 1

**Question:** How often does the conductivity probe need recalibrating?

### Rubric

**Must contain**
- states recalibration is effectively unnecessary — the graphite plates do not change or go bad, and after the first calibration the probe is good to go
- may cite the datasheet's ~10 years time-before-recalibration figure

**Must not**
- gives a ~1 year interval
- applies the pH or ORP recalibration guidance to the conductivity probe

**Should cite**
- EC_K_1.0_probe.pdf

### Answer A

The conductivity probe does **not need any further recalibration after the initial calibration**—the graphite plates don’t change, so once it’s calibrated it stays accurate.  
*Source: EC_K_1.0_probe.pdf*

<sub>Context supplied: 5 chunk(s) from 4 document(s) — EC_K_1.0_probe.pdf, IpH_probe.pdf, Industrial-DO-probe.pdf, tm9a6.8.pdf. Full text: `context/probecal-conductivity-interval/turn1-A.txt`</sub>

### Answer B

The Atlas Scientific EC‑K 1.0 conductivity probe is specified to require recalibration only about every 10 years 【1†L1-L3】.

<sub>Context supplied: 5 chunk(s) from 5 document(s) — EC_K_1.0_probe.pdf, IORP_probe.pdf, Industrial-DO-probe.pdf, IpH_probe.pdf, water-quality-metrics-source-of-truth.pdf. Full text: `context/probecal-conductivity-interval/turn1-B.txt`</sub>

### Answer C

The conductivity probe does **not need any further recalibration after the initial calibration**.  
According to the manufacturer’s instructions, the graphite plates that measure conductivity do not degrade, so once the probe is calibrated the first time it remains accurate indefinitely【1】.

<sub>Context supplied: 5 chunk(s) from 3 document(s) — EC_K_1.0_probe.pdf, Industrial-DO-probe.pdf, tm9a6.8.pdf. Full text: `context/probecal-conductivity-interval/turn1-C.txt`</sub>

---

## Turn 2

**Question:** Then why do our EC numbers wander?

### Rubric

**Must contain**
- deposits and dirt change the probe's electrical properties and cause inaccurate readings — soft coatings brushed off, hard coatings removed chemically
- air bubbles trapped between the graphite plates throw off results; the probe should be tapped to dislodge them
- temperature: raw EC rises ~2% per °C, so specific conductance must be reported

**Must not**
- attributes the wandering to calibration drift, which this probe does not have

**Should cite**
- EC_K_1.0_probe.pdf
- water-quality-metrics-source-of-truth.pdf

### Answer A

I can only answer questions grounded in this sensor's readings or the loaded water‑quality documents, and I don't have enough information to answer that. The context does not explain why EC numbers might wander.

<sub>Context supplied: 5 chunk(s) from 1 document(s) — volunteer_stream_monitoring_a_methods_manual.pdf. Full text: `context/probecal-conductivity-interval/turn2-A.txt`</sub>

### Answer B

The EC‑K 1.0 probe itself is designed to stay accurate for many years, so the manufacturer says it “does not need recalibration” after the first calibration【1†L1-L3】.  
In practice, the numbers can drift for a few reasons that are not related to the probe’s internal electronics:

| Cause | Why it happens | How it shows up in the data |
|-------|----------------|-----------------------------|
| **Fouling / deposits** | Organic or mineral material builds up on the graphite plates, changing the effective electrode area and resistance. | Gradual, slow trend or sudden jump in EC readings. |
| **Temperature changes** | EC is temperature‑dependent; if the sensor’s temperature compensation is off or the water temperature changes rapidly, the EC value will shift. | Correlated spikes or dips that match temperature swings. |
| **Air bubbles** | Bubbles trapped between the plates interrupt the conductive path. | Brief, erratic spikes or drops. |
| **Electrical noise / cable issues** | Long cable runs or poor isolation can pick up interference. | Random noise or a drift that coincides with cable changes. |
| **Water chemistry changes** | Sudden influx of salts, road‑salt runoff, or other ionic inputs alter the true conductivity. | Step‑change that matches a known event (e.g., rain, tide). |

Because the probe is a simple two‑electrode device, the “no recalibration” claim refers to the probe’s internal calibration curve, not to the need for routine maintenance. Cleaning the probe (removing deposits, checking for bubbles) and ensuring proper temperature compensation are the usual ways to keep the EC numbers stable.

<sub>Context supplied: 5 chunk(s) from 5 document(s) — EC_K_1.0_probe.pdf, IORP_probe.pdf, Industrial-DO-probe.pdf, IpH_probe.pdf, water-quality-metrics-source-of-truth.pdf. Full text: `context/probecal-conductivity-interval/turn2-B.txt`</sub>

### Answer C

EC readings can drift even though the probe itself doesn’t need a new calibration.  
The main reasons are:

| Cause | How it affects EC | What to do |
|-------|------------------|------------|
| **Temperature changes** | Raw EC rises ~2 % per °C, so un‑corrected values will swing with the water temperature. | Use temperature‑corrected specific conductance (25 °C‑c.); apply the same correction to all data. |
| **Air bubbles** | Bubbles trapped between the graphite plates block current and give a low EC reading. | Gently tap or swirl the probe to dislodge bubbles. |
| **Deposits / fouling** | Bio‑film or mineral buildup on the plates changes the probe’s electrical properties. | Clean the probe with a soft brush or manufacturer‑recommended cleaner. |
| **Cable or connector issues** | Long cables or poor SMA connections can pick up noise or act as an antenna, altering the signal. | Use proper isolation (e.g., inline voltage isolator) and keep connections sealed. |

So while the probe itself doesn’t need recalibration, the environment and handling can make the EC numbers wander. Correcting for temperature, keeping the probe clean, and ensuring good cable connections will keep the readings stable【1】【5】.

<sub>Context supplied: 5 chunk(s) from 4 document(s) — water-quality-metrics-source-of-truth.pdf, tm9a6.8.pdf, volunteer_stream_monitoring_a_methods_manual.pdf, EC_K_1.0_probe.pdf. Full text: `context/probecal-conductivity-interval/turn2-C.txt`</sub>

