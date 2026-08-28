# acronym-ntu-fnu

**Class:** `acronym-exact-token` · **Turns:** 2

> Answers below are labelled A/B in an order specific to this fixture. The
> same letter means a **different** system on another sheet. Do not compare letters across
> fixtures.

---

## Turn 1

**Question:** Our turbidity readings are in NTU but another pod reports FNU — can I compare them?

### Rubric

**Must contain**
- states NTU and FNU are not interchangeable
- identifies NTU as white-light and FNU as infrared
- recommends standardizing on one unit across the fleet

**Must not**
- says the units are equivalent
- supplies a conversion factor between NTU and FNU

**Should cite**
- water-quality-metrics-source-of-truth.pdf

### Answer A

No. The sensor reports turbidity in **NTU** (white‑light nephelometric units). FNU (infrared formazin nephelometric units) is a different optical measurement and the two units are **not interchangeable**.  The USGS guidance notes that “NTU and FNU are not interchangeable” and recommends standardizing on one unit across the fleet【6】【7】.  To compare the two pods you would need a conversion factor or a common calibration, otherwise the values cannot be directly compared.

<sub>Context supplied: 10 chunk(s) from 6 document(s) — EC_K_1.0_probe.pdf, IORP_probe.pdf, Industrial-DO-probe.pdf, IpH_probe.pdf, water-quality-metrics-source-of-truth.pdf, https://pubs.usgs.gov/twri/twri9a6/twri9a67/twri9a_Section6.7_v2.1.pdf. Full text: `context/acronym-ntu-fnu/turn1-A.txt`</sub>

### Answer B

No.  NTU (nephelometric turbidity units) and FNU (formazin nephelometric units) are only equivalent for calibration solutions such as formazin or polymer beads.  For environmental samples the two instruments can give different values because they use different light sources and detector geometries.  Therefore you cannot directly compare an NTU reading with an FNU reading without a conversion that has been validated for the specific instruments and sample matrix【1】【4】.

<sub>Context supplied: 5 chunk(s) from 1 document(s) — https://pubs.usgs.gov/twri/twri9a6/twri9a67/twri9a_Section6.7_v2.1.pdf. Full text: `context/acronym-ntu-fnu/turn1-B.txt`</sub>

---

## Turn 2

**Question:** Which one does our sensor use?

### Rubric

**Must contain**
- states this deployment reports NTU
- notes NTU is the white-light unit, so the other pod's FNU values are not directly comparable to ours

**Must not**
- says the deployment's unit is unspecified
- supplies a conversion factor between the units

**Notes:** The unit comes from the operator block in the system prompt, not from the corpus, so no citation is expected. Before 2026-07-29 this turn had no grounded answer.

### Answer A

Our sensor reports turbidity in **NTU** (nephelometric turbidity units). The operator‑provided normal range for this deployment is 0–25 NTU, confirming that the sensor uses NTU rather than FNU【5】.

<sub>Context supplied: 10 chunk(s) from 8 document(s) — EC_K_1.0_probe.pdf, IORP_probe.pdf, Industrial-DO-probe.pdf, IpH_probe.pdf, water-quality-metrics-source-of-truth.pdf, https://pubs.usgs.gov/tm/09/a6.1/tm9a6.1.pdf, https://pubs.usgs.gov/tm/09/a6.8/tm9a6.8.pdf, https://pubs.usgs.gov/tm/09/a6.2/tm9a6.2.pdf. Full text: `context/acronym-ntu-fnu/turn2-A.txt`</sub>

### Answer B

Your sensor reports turbidity in **NTU** (nephelometric turbidity units).  The operator‑provided normal range for this deployment is 0–25 NTU, confirming that the sensor uses NTU as its unit【4】.

<sub>Context supplied: 5 chunk(s) from 3 document(s) — https://pubs.usgs.gov/tm/09/a6.1/tm9a6.1.pdf, https://pubs.usgs.gov/tm/09/a6.8/tm9a6.8.pdf, https://pubs.usgs.gov/tm/09/a6.2/tm9a6.2.pdf. Full text: `context/acronym-ntu-fnu/turn2-B.txt`</sub>

