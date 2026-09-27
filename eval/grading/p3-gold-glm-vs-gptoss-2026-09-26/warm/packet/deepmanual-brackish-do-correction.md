# deepmanual-brackish-do-correction

**Class:** `deep-in-manual` · **Turns:** 2

> Answers below are labelled A/B in an order specific to this fixture. The
> same letter means a **different** system on another sheet. Do not compare letters across
> fixtures.

---

## Turn 1

**Question:** We moved a pod into a tidal creek. Specific conductance normalized to 25 °C is about 50,000 µS/cm, water temperature is 20 °C, and the DO reading has no salinity compensation. Using USGS table 6.2-4, how do we correct it?

### Rubric

**Must contain**
- States the measured DO must be multiplied by a salinity correction factor
- Gives 0.8235 as the factor for 20.0 °C at 50,000 µS/cm
- Attributes the factor to the salinity-correction table in the USGS NFM dissolved-oxygen chapter (table 6.2-4)

**Must not**
- Invents a correction factor not in the table
- Adds or divides by the factor rather than multiplying

**Should cite**
- usgs-nfm-a6.2-dissolved-oxygen.pdf

### Answer A

The USGS method works like this:

1. **Get the correction factor.** From table 6.2–4, at 20.0 °C and a specific conductance of 50,000 µS/cm, the salinity correction factor is 0.8235 【4†"20.0 0.8419 0.8383 0.8346 0.8309 0.8272 0.8235"】.

2. **Apply it to the uncompensated DO reading.** The USGS example shows: "the actual DO concentration should be reported as 7.50 mg/L multiplied by 0.9733, or 7.30 mg/L" 【2】. So you multiply your pod's raw DO reading by 0.8235. For example, a raw reading of 7.50 mg/L would be reported as 7.50 × 0.8235 ≈ 6.18 mg/L.

3. **Optionally compute percent saturation.** Using the equation "( DO percent saturation = measured DO mg L × 100 / DO mg L at 100 percent saturation )" 【2】, divide the corrected DO by the salinity-corrected oxygen solubility and multiply by 100. In the USGS example, "7.30 divided by 8.73, multiplied by 100, which equals 83.6 percent" 【2】.

Note the context for why this matters: "Correcting DO solubility for saline waters (specific conductance greater than 2,000 μS/cm) varies with instrument type, calibration method, and the salts in solution" 【1】, and "The presence of dissolved ions in the water decreases the oxygen solubility" 【2】. Also, "Most multiparameter instruments that include DO and specific-conductance sensors automatically correct the DO reading for salinity if needed, unless the feature is turned off by the user" 【1】 — since yours lacks compensation, the manual correction above applies.

<sub>Context supplied: 4 chunk(s) from 1 document(s) — https://pubs.usgs.gov/tm/09/a6.2/tm9a6.2.pdf. Full text: `context/deepmanual-brackish-do-correction/turn1-A.txt`</sub>

### Answer B

To correct a DO value that was measured without salinity compensation, multiply the raw reading by the salinity‑correction factor for the water’s temperature and specific conductance.

1. Locate the factor for 20 °C and 50 000 µS cm⁻¹ in USGS Table 6.2‑4. The table row shows:



0.8419 0.8383 0.8346 0.8309 0.8272 0.8235 0.8198 0.8161 0.8124 0.8087 0.8050 0.8013 0.7976 0.7939 0.7902"}  

2. The sixth value in that row (corresponding to 50 000 µS cm⁻¹) is **0.8235**.

3. Apply the factor:  

 **Corrected DO = Raw DO × 0.8235**  

So, take the DO reading from the sensor and multiply it by 0.8235 to obtain the salinity‑adjusted dissolved‑oxygen concentration.

<sub>Context supplied: 4 chunk(s) from 1 document(s) — https://pubs.usgs.gov/tm/09/a6.2/tm9a6.2.pdf. Full text: `context/deepmanual-brackish-do-correction/turn1-B.txt`</sub>

---

## Turn 2

**Question:** We have three more pods upstream in fresh water. Do those need the same treatment?

### Rubric

**Must contain**
- Explains the manual's operational saline-water correction applies above 2,000 µS/cm and asks for the upstream specific conductance before deciding; freshwater does not imply zero conductivity or mathematically zero salinity effect
- Gives 1.0000 at zero specific conductance without extending that exact factor to all freshwater

**Must not**
- Invents a conductivity threshold such as 1,000 or 5,000 µS/cm
- Claims the salinity correction must be applied regardless of conductivity

**Should cite**
- usgs-nfm-a6.2-dissolved-oxygen.pdf

### Answer A

No — this correction is only for saline conditions. The USGS guidance frames it as: "Correcting DO solubility for saline waters (specific conductance greater than 2,000 μS/cm) varies with instrument type, calibration method, and the salts in solution" 【1】. Your upstream pods in fresh water fall well below that, so the salinity correction from table 6.2–4 doesn't apply to them — their DO readings can be used as measured.

The correction is only needed where dissolved ions materially reduce oxygen solubility: "The presence of dissolved ions in the water decreases the oxygen solubility" 【2】.

<sub>Context supplied: 4 chunk(s) from 1 document(s) — https://pubs.usgs.gov/tm/09/a6.2/tm9a6.2.pdf. Full text: `context/deepmanual-brackish-do-correction/turn2-A.txt`</sub>

### Answer B

No. The salinity‑correction factor is only required when the water’s specific conductance is high enough that it appreciably lowers oxygen solubility. The USGS guidance says that “correcting DO solubility for saline waters (specific conductance greater than 2,000 µS/cm) varies with instrument type…”.  

If the upstream pods are in fresh water with conductance well below that threshold, the raw DO readings can be used directly (or only the sensor’s built‑in compensation, if any, is needed).

<sub>Context supplied: 4 chunk(s) from 1 document(s) — https://pubs.usgs.gov/tm/09/a6.2/tm9a6.2.pdf. Full text: `context/deepmanual-brackish-do-correction/turn2-B.txt`</sub>

