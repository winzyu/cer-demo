# crossdoc-soft-water-ph-wont-settle

**Class:** `cross-document` · **Turns:** 2

> Answers below are labelled A/B in an order specific to this fixture. The
> same letter means a **different** system on another sheet. Do not compare letters across
> fixtures.

---

## Turn 1

**Question:** Headwater stream, very soft water, specific conductance sits around 55 µS/cm. The pH reading never settles — it wanders half a unit and keeps creeping. Probe is new. What's actually going on and what do I do about it?

### Rubric

**Must contain**
- Identifies low ionic strength below about 100 µS/cm as a likely cause of unstable pH, without ruling out instrument faults merely because the probe is new
- explains that the water is not conductive enough to complete the electrical circuit for a stable reading with a combination electrode
- names the large ionic-strength difference between sample and buffers and the enlarged liquid-junction potential as contributing causes
- recommends a different electrode type for such water (fast-responding liquid-filled, Ross combination, or double-junction)
- describes the potassium chloride addition as the sanctioned fix, raising specific conductance by roughly 150 microsiemens per centimetre
- states the KCl addition changes the measured pH by less than about 0.01 unit
- states the KCl procedure is used only after the normal procedure has been tried and the reading would not stabilise
- Warns against stirring the untreated low-conductance subsample to speed stabilization, while permitting gentle swirling to dissolve KCl in the specified treatment

**Must not**
- Recommends stirring the untreated low-conductance subsample to speed stabilization; gentle swirling to dissolve KCl in the specified treatment is allowed
- invents a KCl mass or a resulting conductivity increase not in the manual
- attributes the instability to probe failure and stops there
- recommends low-ionic-strength buffers for field use without noting they are easily contaminated

**Should cite**
- usgs-nfm-a6.4-ph.pdf
- usgs-nfm-a6.0-field-measurement-guidelines.pdf

### Answer A

The pH electrode is having trouble because the water is very low in ions. In waters with a specific conductance below 100 µS/cm the solution “is not sufficiently conductive to complete the electrical circuit and allow for a stable pH reading”【12†"Accurate and precise measurement of pH in low-specific-conductance waters (less than 100 μS/cm) is challenging because (1) the water is not sufficiently conductive to complete the electrical circuit and allow for a stable pH reading..."】.  

A common way to fix this is to raise the ionic strength of the sample. The guidance recommends “adding a small amount of potassium chloride (KCl—crystalline, American Chemical Society‑certified)” to the water【12†"The recommended method allows for using normal pH field electrodes and standard pH buffers (table 6.4–3) by adding a small amount of potassium chloride (KCl—crystalline, American Chemical Society‑certified)."】. Doing so “will increase the specific conductance of the sample by approximately 150 µS/cm”【12†"This procedure will increase the specific conductance of the sample by approximately 150 μS/cm."】, which brings the water into a range where the pH probe can maintain a stable circuit and give a reliable reading.  

So the wandering pH value is a symptom of the low‑conductivity water, not a fault with the new probe. Adding a measured amount of KCl (as described) and then re‑measuring the pH should stabilize the reading.

<sub>Context supplied: 22 chunk(s) from 8 document(s) — EC_K_1.0_probe.pdf, IORP_probe.pdf, Industrial-DO-probe.pdf, IpH_probe.pdf, https://pubs.usgs.gov/tm/09/a6.3/tm9-a6_3.pdf, https://pubs.usgs.gov/tm/09/a6.0/tm9a6.0.pdf, https://pubs.usgs.gov/tm/09/a6.4/tm9a6.4.pdf, https://pubs.usgs.gov/tm/09/a6.8/tm9a6.8.pdf. Full text: `context/crossdoc-soft-water-ph-wont-settle/turn1-A.txt`</sub>

### Answer B

The water you are sampling has a specific conductance of about 55 µS cm⁻¹, which is below the 100 µS cm⁻¹ threshold where pH electrodes can reliably complete an electrical circuit.  In such low‑ionic‑strength water “the water is not sufficiently conductive to complete the electrical circuit, causing an unstable pH reading”【3†"Water is not sufficiently conductive to complete the electrical circuit, causing an unstable pH reading."】.  This is why the pH value wanders and never settles, even with a new probe.

To obtain a stable measurement you need to raise the sample’s conductance.  The USGS guidance recommends adding a small amount of potassium chloride (KCl) to the water so that the specific conductance increases by roughly 150 µS cm⁻¹:  

* “The recommended method allows for using normal pH field electrodes and standard pH buffers … by adding a small amount of potassium chloride (KCl) to a subsample of water to increase the specific conductance by approximately 150 µS cm⁻¹”【4†"by adding a small amount of potassium chloride (KCl) to a subsample of water to increase the specific conductance by approximately 150 µS/cm."】.  

* Preparation steps: “Before going to the field, prepare small glass vials containing 20 milligrams (mg) of dry potassium chloride (KCl—crystalline, American Chemical Society‑certified). … At the sample site, fill a 250‑mL polyethylene bottle with raw sample water. Immediately transfer 20 mg KCl to the sample solution, cap the solution to minimize transfer of gases, and gently swirl the bottle to dissolve the KCl.”【4†"prepare small glass vials containing 20 milligrams (mg) of dry potassium chloride (KCl—crystalline, American Chemical Society‑certified)."】【4†"fill a 250‑mL polyethylene bottle with raw sample water. Immediately transfer 20 mg KCl to the sample solution, cap the solution to minimize transfer of gases, and gently swirl the bottle to dissolve the KCl."】

After the KCl addition, re‑measure the pH with your probe; the increased conductance should allow the reading to stabilize.  If you frequently sample very soft water, you may also consider using a “fast‑responding (liquid‑filled) electrode, Ross combination glass electrode, double junction electrode” that is recommended for low‑ionic‑strength conditions【3†"Fast‑responding (liquid‑filled) electrode, Ross combination glass electrode, double junction electrode"】.

<sub>Context supplied: 5 chunk(s) from 3 document(s) — https://pubs.usgs.gov/tm/09/a6.0/tm9a6.0.pdf, https://pubs.usgs.gov/tm/09/a6.4/tm9a6.4.pdf, https://pubs.usgs.gov/tm/09/a6.8/tm9a6.8.pdf. Full text: `context/crossdoc-soft-water-ph-wont-settle/turn1-B.txt`</sub>

---

## Turn 2

**Question:** The A6.8 example field form gives conductivity-dependent pH calibration criteria. What are those, and how do they differ from A6.4's final-buffer check?

### Rubric

**Must contain**
- Attributes ±0.1 pH unit to the A6.8 example field form's calibration criterion
- Attributes ±0.3 pH unit below 75 µS/cm to that example form
- Distinguishes the form's conductivity-dependent criteria from A6.4's final-buffer check, requiring agreement within 0.05 pH unit of the certified value at calibration temperature
- notes separately that a post-calibration buffer check should read within about 0.05 pH unit of that buffer's certified value at the calibration temperature

**Must not**
- Uses the example form's relaxed criterion as a replacement for A6.4's final-buffer check
- Invents a threshold for the example form; separately attributed low-ionic-strength guidance using 100 µS/cm is allowed
- confuses the calibration acceptance criterion with the stabilisation criterion for recording a reading

**Should cite**
- usgs-nfm-a6.8-multiparameter-instruments.pdf
- usgs-nfm-a6.4-ph.pdf

### Answer A

I can only answer questions grounded in this sensor's readings or the loaded water‑quality documents, and I don't have enough information to answer that.  
The excerpted documents do not include the A6.8 example field form or its conductivity‑dependent pH calibration criteria, nor do they detail how those criteria differ from the final‑buffer check described in A6.4.  
I could instead explain the general pH calibration steps and checks that are covered in the provided A6.4 excerpts.

<sub>Context supplied: 24 chunk(s) from 8 document(s) — EC_K_1.0_probe.pdf, IORP_probe.pdf, Industrial-DO-probe.pdf, IpH_probe.pdf, https://pubs.usgs.gov/tm/09/a6.4/tm9a6.4.pdf, https://pubs.usgs.gov/tm/09/a6.8/tm9a6.8.pdf, https://pubs.usgs.gov/tm/09/a6.3/tm9-a6_3.pdf, https://pubs.usgs.gov/tm/09/a6.0/tm9a6.0.pdf. Full text: `context/crossdoc-soft-water-ph-wont-settle/turn2-A.txt`</sub>

### Answer B

The A6.8 field‑form table lists a **conductivity‑dependent calibration tolerance** for pH:

* “Calibration Criteria: ± 0.1 pH units, ± 0.3 if SC < 75 µS/cm”【6†"Calibration Criteria: ± 0.1 pH units, ± 0.3 if SC <75us/cm"}】.

In other words, under normal conditions the pH reading must be within ±0.1 pH units of the buffer value, but when the water’s specific conductance is below 75 µS cm⁻¹ the allowable deviation is relaxed to ±0.3 pH units.

A6.4, by contrast, specifies a **final‑buffer check** that is much stricter and does not vary with conductivity:

* “Check the stability of the pH meter … If the pH of the buffer differs by more than 0.05 pH units from the certified value … recalibrate the pH system”【5†"If the pH of the buffer differs by more than 0.05 pH units from the certified value"}】.

**Difference:**  
- A6.8 permits a larger error margin (up to ±0.3 pH units) for low‑conductivity samples, whereas A6.4 requires the buffer reading to be within ±0.05 pH units of the certified value regardless of conductivity. The A6.8 rule is a field‑form tolerance that adapts to low ionic strength; the A6.4 rule is a final‑check step that demands a tighter, uniform accuracy before accepting a sample measurement.

<sub>Context supplied: 6 chunk(s) from 3 document(s) — https://pubs.usgs.gov/tm/09/a6.0/tm9a6.0.pdf, https://pubs.usgs.gov/tm/09/a6.4/tm9a6.4.pdf, https://pubs.usgs.gov/tm/09/a6.8/tm9a6.8.pdf. Full text: `context/crossdoc-soft-water-ph-wont-settle/turn2-B.txt`</sub>

