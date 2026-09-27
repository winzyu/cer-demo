# probecal-ph-slope-acceptance

**Class:** `probe-calibration` · **Turns:** 2

> Answers below are labelled A/B in an order specific to this fixture. The
> same letter means a **different** system on another sheet. Do not compare letters across
> fixtures.

---

## Turn 1

**Question:** Our pH probe has been in the water two seasons and the readings feel sluggish. After I run a fresh calibration, what number should I be looking at to tell me the electrode itself is still any good, and what counts as passing?

### Rubric

**Must contain**
- Identifies the calibration slope as the number that indicates electrode condition
- Gives and attributes either A6.4's 95-101 percent slope range or A6.8's example-form range of 95-102 percent
- If using A6.4, gives its equivalent 56.2-59.8 mV/pH at 25 °C; does not attribute this equivalence to A6.8's different percentage range
- Notes that a healthy electrode also responds quickly in buffer, on the order of one to two minutes

**Must not**
- invents a slope acceptance threshold that appears in no source
- Uses the datasheet's stated working life as the criterion for whether the electrode is usable
- Presents the 56.2 to 59.8 millivolt window as valid at any temperature without noting it is a 25 degree Celsius figure

**Should cite**
- usgs-nfm-a6.4-ph.pdf
- usgs-nfm-a6.8-multiparameter-instruments.pdf

**Notes:** 95-101 percent (NFM A6.4) and 95-102 percent (the A6.8 groundwater field form) are both corpus-grounded; credit either.

### Answer A

After you finish the calibration, check the **slope** that the meter reports for the electrode (often shown as a percent of the theoretical Nernst slope or as millivolts per pH unit).  

* The electrode is considered acceptable when the slope is **between 95 % and 101 % of the theoretical Nernst slope**【5†"slope of 95–101 percent of the theoretical Nernstian slope"】, which at 25 °C corresponds to **56.2 – 59.8 mV pH⁻¹**.  

* In the field‑form example the acceptance range is given as **95 % to 102 %**【10†"Slope Acceptance Criteria: 95% to 102%"】.  

* Also verify that the **isopotential point is near pH 7**【5†"an isopotential point near pH 7"】.  

If the reported slope falls within those limits (≈95‑101 % or 56.2‑59.8 mV pH⁻¹) and the isopotential point is close to pH 7, the electrode passes the check. If the slope is outside that range, the electrode should be cleaned, reconditioned, or replaced.

<sub>Context supplied: 10 chunk(s) from 2 document(s) — https://pubs.usgs.gov/tm/09/a6.4/tm9a6.4.pdf, https://pubs.usgs.gov/tm/09/a6.8/tm9a6.8.pdf. Full text: `context/probecal-ph-slope-acceptance/turn1-A.txt`</sub>

### Answer B

After calibration, check the **slope** — either as a percentage or in millivolts per pH unit.

- **Slope test:** "Properly working electrodes should have slopes that are 56.2 to 59.8 mV/pH unit at 25 °C, which is 95 to 101 percent of the expected slope from the theoretical Nernst relation" 【6】.
- Equivalently, the electrode should show "a pH electrode with an accurate Nernstian response (slope of 95–101 percent of the theoretical Nernstian slope)" 【5】.

If the slope falls outside that range, the guidance is to first clean the electrode and check the filling-solution level, that the fill hole is open, and that the junction is free flowing, then recalibrate 【6】. If it still fails after recalibration, the electrode should be cleaned, reconditioned, or replaced 【7】.

Note this is general guidance from the USGS field manual, not a threshold specific to your pod.

<sub>Context supplied: 10 chunk(s) from 2 document(s) — https://pubs.usgs.gov/tm/09/a6.4/tm9a6.4.pdf, https://pubs.usgs.gov/tm/09/a6.8/tm9a6.8.pdf. Full text: `context/probecal-ph-slope-acceptance/turn1-B.txt`</sub>

---

## Turn 2

**Question:** It came back at 92 percent. What am I supposed to do with it now, and at what point do I just order a new one?

### Rubric

**Must contain**
- States that 92 percent is below the acceptable range and the electrode fails
- For an otherwise serviceable electrode, cleans and recalibrates before replacement
- Checks electrode condition and reference-junction flow; checks filling solution and an open fill hole only when applicable to the electrode design
- If cleaning and recalibration fail, follows manufacturer-supported reconditioning for a serviceable liquid-filled electrode
- Does not use an electrode that still fails the applicable slope criterion after appropriate restoration and recalibration; replaces it when restoration fails or is unsuitable

**Must not**
- Tells the operator 92 percent is acceptable
- Recommends replacing an otherwise serviceable electrode solely for a failed slope before cleaning and recalibration; damaged or unserviceable electrodes may be replaced
- Invents a separate numeric replacement threshold distinct from the slope acceptance range

**Should cite**
- usgs-nfm-a6.4-ph.pdf

### Answer A

A slope of 92 % is below the acceptable range, so the electrode should **not be used as‑is**.  

1. **Clean or re‑condition the electrode** first – for example, flush the pH electrode with de‑ionized water, remove any visible crystals, and refill the reference chamber with fresh filling solution as described in the cleaning procedures【1†"Flush the pH electrode with DIW"】.  

2. **Re‑calibrate and re‑measure the slope** after the cleaning.  

3. If the slope is still **outside the 95 %–101 % (≈56.2 – 59.8 mV pH⁻¹) range**, the electrode must be **replaced**【2†"If the slope falls outside this range, do not use the electrode"】【7†"Clean, recondition, or replace electrode ... if the slope remains outside the acceptable range"】.  

So, clean/re‑condition now; if the slope does not rise into the 95 %–101 % window, order a new probe.

<sub>Context supplied: 7 chunk(s) from 1 document(s) — https://pubs.usgs.gov/tm/09/a6.4/tm9a6.4.pdf. Full text: `context/probecal-ph-slope-acceptance/turn2-A.txt`</sub>

### Answer B

At 92 percent, your electrode is outside the acceptable range — the guidance says "If the slope or percent value is outside this range, first clean the electrode and check: the level of the filling solution, that the fill hole is open, and that the junction is free flowing; then, recalibrate" 【6】.

If it still fails after that, the manual says to "Clean, recondition, or replace the electrode if, after recalibration, the slope remains outside the acceptable range of 95 to 101 percent" 【6】.

Reconditioning for a liquid-filled electrode means flushing and refilling the filling solution: remove the old solution, flush the electrode with deionized water, then "Flush and fill the electrode with fresh filling solution by using a syringe or equipment recommended by the manufacturer" 【2】, and retest by calibration. Reconditioning is specifically indicated when "the electrode's slope response has deteriorated to less than 95 percent" 【1】 — which is your situation.

As for when to order a new one: replace it if the slope "remains outside the acceptable range for the response slope and the deviation cannot be corrected through cleaning or reconditioning" 【7】. So the sequence is clean → recondition → recalibrate, and if it still won't reach 95–101 percent, that's when you replace it.

<sub>Context supplied: 7 chunk(s) from 1 document(s) — https://pubs.usgs.gov/tm/09/a6.4/tm9a6.4.pdf. Full text: `context/probecal-ph-slope-acceptance/turn2-B.txt`</sub>

