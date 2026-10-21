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

Because the sensor does not apply a salinity correction, you must multiply the raw dissolved‑oxygen value by the appropriate salinity‑correction factor from USGS Table 6.2‑4.  

At 20 °C and a specific conductance of 50 000 µS cm⁻¹, the table gives a factor of 0.8235【4†"20.0

0.8419

0.8383

0.8346

0.8309

0.8272

0.8235"】.  

**Correction step**  
Corrected DO = (raw DO) × 0.8235  

So, for example, if the sensor reads 8.0 mg L⁻¹, the salinity‑adjusted value would be 8.0 × 0.8235 ≈ 6.59 mg L⁻¹.

<sub>Context supplied: 4 chunk(s) from 1 document(s) — https://pubs.usgs.gov/tm/09/a6.2/tm9a6.2.pdf. Full text: `context/deepmanual-brackish-do-correction/turn1-A.txt`</sub>

### Answer B

I can only answer questions grounded in this sensor's readings or the loaded water‑quality documents, and I don't have enough information to answer that.  

The missing piece is the salinity‑correction factor for a specific conductance of 50 000 µS/cm at 20 °C from USGS table 6.2‑4.  

If you obtain that factor, you would correct the un‑compensated DO value by multiplying the measured DO (in mg/L) by the factor (e.g., corrected DO = measured DO × factor) as described in the guidance to “apply a salinity correction … referring to … table 6.2‑4”【10】.

<sub>Context supplied: 24 chunk(s) from 8 document(s) — EC_K_1.0_probe.pdf, IORP_probe.pdf, Industrial-DO-probe.pdf, IpH_probe.pdf, https://pubs.usgs.gov/tm/09/a6.2/tm9a6.2.pdf, https://pubs.usgs.gov/tm/09/a6.3/tm9-a6_3.pdf, https://pubs.usgs.gov/tm/09/a6.8/tm9a6.8.pdf, https://19january2017snapshot.epa.gov/sites/production/files/2015-06/documents/EQASOP-FieldCalibrat.pdf. Full text: `context/deepmanual-brackish-do-correction/turn1-B.txt`</sub>

---

## Turn 2

**Question:** We have three more pods upstream in fresh water. Do those need the same treatment?

### Rubric

**Must contain**
- Explains the manual's operational saline-water correction applies above 2,000 µS/cm and asks for the upstream specific conductance before deciding; freshwater does not imply zero conductivity or mathematically zero salinity effect
- Gives 1.0000 at zero specific conductance without extending that exact factor to all freshwater
- States the manual treats water as saline only above about 2,000 µS/cm specific conductance

**Must not**
- Invents a conductivity threshold such as 1,000 or 5,000 µS/cm
- Claims the salinity correction must be applied regardless of conductivity

**Should cite**
- usgs-nfm-a6.2-dissolved-oxygen.pdf

### Answer A

No. Salinity‑correction factors are only needed when the water’s specific conductance is high enough to affect oxygen solubility. The USGS guidance says that “Correcting DO solubility for saline waters (specific conductance greater than 2,000 µS/cm) varies …”【1†"specific conductance greater than 2,000 μS/cm) varies"】. Fresh‑water streams typically have conductances well below that threshold, so the correction factor would be essentially 1.0 and no adjustment is required.

<sub>Context supplied: 4 chunk(s) from 1 document(s) — https://pubs.usgs.gov/tm/09/a6.2/tm9a6.2.pdf. Full text: `context/deepmanual-brackish-do-correction/turn2-A.txt`</sub>

### Answer B

I can only answer questions grounded in this sensor's readings or the loaded water‑quality documents, and I don't have enough information to answer that.  

The missing information is any guidance in the provided documents that states whether salinity compensation is required for fresh‑water (low‑conductivity) deployments. If you can locate such a statement, I could tell you whether the upstream pods need the same correction.

<sub>Context supplied: 22 chunk(s) from 11 document(s) — EC_K_1.0_probe.pdf, IORP_probe.pdf, Industrial-DO-probe.pdf, IpH_probe.pdf, https://pubs.usgs.gov/tm/09/a6.0/tm9a6.0.pdf, https://pubs.usgs.gov/tm/09/a6.1/tm9a6.1.pdf, https://pubs.usgs.gov/twri/twri9a6/twri9a67/twri9a_Section6.7_v2.1.pdf, https://pubs.usgs.gov/tm/09/a6.8/tm9a6.8.pdf, https://pubs.usgs.gov/twri/twri9a6/twri9a66/twri9a_6.6.pdf, https://pubs.usgs.gov/twri/twri9a6/twri9a65/twri9a_6.5_v_1.2.pdf, https://pubs.usgs.gov/tm/09/a6.2/tm9a6.2.pdf. Full text: `context/deepmanual-brackish-do-correction/turn2-B.txt`</sub>

