# crossdoc-conductivity-rise-with-warming

**Class:** `cross-document` · **Turns:** 2

> Answers below are labelled A/B in an order specific to this fixture. The
> same letter means a **different** system on another sheet. Do not compare letters across
> fixtures.

---

## Turn 1

**Question:** Our conductivity climbed through a warm spell and I can't tell whether the water actually changed or the pod is just reacting to the heat. How does the correction work, and how much per degree are we talking about?

### Rubric

**Must contain**
- Explains that uncompensated conductivity generally rises as water warms and checks whether the displayed value is already temperature-compensated before attributing its change to heat
- gives the per-degree change as a range of roughly 0.5 to 3 percent per degree Celsius depending on the ions present, not a single fixed number
- Explains compensation using either the linear measured-temperature-minus-25 term or the source-supported nonlinear alternative
- gives the typical linear compensation factor as about 0.019 to 0.020 per degree Celsius, or names the nonlinear ISO alternative
- states the corrected value is specific conductance referenced to 25 C, which is what should be reported and trended
- States temperature compensation is typically accurate to ±5 percent for 5-35 °C and pH 4-11, without claiming universal invalidity outside that range

**Must not**
- gives a single flat per-degree percentage as if it were exact for all waters
- invents a compensation factor not in the manual
- says the temperature correction removes the need to record temperature

**Should cite**
- usgs-nfm-a6.3-specific-conductance.pdf

### Answer A

Temperature‑compensated conductivity is obtained by adjusting the measured value to the standard reference temperature of 25 °C.  Modern meters use a built‑in temperature‑compensation factor (α) in an equation that corrects the reading to what it would be at 25 °C【3†"Modern specific conductance field meters typically have preprogrammed temperature‑compensation factors (α) and report specific conductance (or electrical conductivity) at 25 °C (κ25 °C)"】.  The factor α is usually a linear value of about 0.019–0.020 per °C【3†"either linear (0.019–0.020 per °C) or nonlinear"】, which corresponds to roughly a 2 % change in conductivity for each degree change in temperature.  In practice, natural water conductivity “increases by 0.5 to 3 percent per degree Celsius”【3†"Electrical conductivity increases by 0.5 to 3 percent per degree Celsius"】, so the correction removes that temperature‑driven increase and isolates any true change in dissolved ions.

<sub>Context supplied: 6 chunk(s) from 3 document(s) — https://pubs.usgs.gov/tm/09/a6.1/tm9a6.1.pdf, https://pubs.usgs.gov/tm/09/a6.3/tm9-a6_3.pdf, https://pubs.usgs.gov/tm/09/a6.8/tm9a6.8.pdf. Full text: `context/crossdoc-conductivity-rise-with-warming/turn1-A.txt`</sub>

### Answer B

Conductivity readings are temperature-sensitive, and the correction works by reporting conductivity at a reference temperature of 25 °C to remove temperature effects: "the electrical conductivity is reported at 25 °C (κ25 °C, which is equivalent to specific conductance), to facilitate this estimation of TDS by removing the effects of temperature" 【3†"the electrical conductivity is reported at 25 °C (κ25 °C, which is equivalent to specific conductance), to facilitate this estimation of TDS by removing the effects of temperature"】.

As for how much per degree: "Electrical conductivity increases by 0.5 to 3 percent per degree Celsius and varies depending on the ionic species present" 【3†"Electrical conductivity increases by 0.5 to 3 percent per degree Celsius and varies depending on the ionic species present"】.

So a warm spell could shift the raw conductivity signal even if the water's dissolved-solids content didn't change. The meters typically apply either a linear compensation factor of "0.019–0.020 per °C" 【3†"Most specific conductance meters utilize either linear (0.019–0.020 per °C) or nonlinear"】 or a nonlinear algorithm, and this compensation "is typically accurate to ±5 percent for water in the range from 5 to 35 ºC and whose pH is between 4 and 11" 【3†"temperature compensation is typically accurate to ±5 percent for water in the range from 5 to 35 ºC and whose pH is between 4 and 11"】.

I don't have this pod's configured thresholds or its raw vs. temperature-compensated readings available here, so I can't tell you whether your specific change reflects a real water-chemistry shift or just the temperature effect — you'd need to compare the temperature-compensated specific conductance values across the warm spell to distinguish the two.

<sub>Context supplied: 6 chunk(s) from 3 document(s) — https://pubs.usgs.gov/tm/09/a6.1/tm9a6.1.pdf, https://pubs.usgs.gov/tm/09/a6.3/tm9-a6_3.pdf, https://pubs.usgs.gov/tm/09/a6.8/tm9a6.8.pdf. Full text: `context/crossdoc-conductivity-rise-with-warming/turn1-B.txt`</sub>

---

## Turn 2

**Question:** That correction leans entirely on the temperature reading. How good does our temperature sensor have to be before I trust the corrected number, and how do I check it?

### Rubric

**Must contain**
- states that when a temperature sensor is bundled on a multiparameter instrument and used to correct another parameter, it is required to be accurate to within about plus or minus 0.2 C
- states that checking a temperature sensor means verifying its accuracy across the range of use, not adjusting it to a standard the way a pH or conductivity sensor is adjusted
- states the check is made against a NIST-certified or NIST-traceable thermometer
- states that a faulty or drifting thermistor in the conductivity cell produces wrong specific conductance values

**Must not**
- invents a temperature accuracy figure other than the manual's requirement
- describes temperature calibration as adjusting the sensor until it matches a standard
- answers only from the conductivity chapter and never gives an accuracy requirement

**Should cite**
- usgs-nfm-a6.1-temperature.pdf
- usgs-nfm-a6.8-multiparameter-instruments.pdf
- usgs-nfm-a6.3-specific-conductance.pdf

### Answer A

A temperature sensor used to temperature‑correct conductivity should meet the same accuracy requirements that USGS specifies for water‑temperature measurements.  Certified sensors must have a readout accuracy of ±0.05 °C, while traceable or verified sensors are required to have a stated accuracy of ≤ ±0.2 °C【1†"certified accuracy of less than or equal to ±0.05°C"】【1†"manufacturer’s stated accuracy of less than or equal to ±0.2°C"】.  Using a sensor in that range keeps the temperature‑compensation error small enough that the corrected conductivity remains reliable.

To verify that your temperature sensor meets those limits you must compare it to a certified or traceable thermometer.  The standard procedure is to perform a calibration verification by checking the sensor at several points (at least five) across the expected temperature range, using a certified or traceable reference in a water bath【2†"A new sensor is required to be checked against a certified or traceable sensor at points covering the range of expected temperature measurements"】.  Record the comparison results in a logbook (paper or electronic) that travels with the instrument【2†"A separate logbook or electronic log for recording repair, maintenance, and calibration history information is required to be maintained"】, and repeat the verification at least once every 12 months【2†"Calibration verification of sensors collecting data for USGS publication is required to be performed every 12 months"】.

<sub>Context supplied: 6 chunk(s) from 3 document(s) — https://pubs.usgs.gov/tm/09/a6.1/tm9a6.1.pdf, https://pubs.usgs.gov/tm/09/a6.3/tm9-a6_3.pdf, https://pubs.usgs.gov/tm/09/a6.8/tm9a6.8.pdf. Full text: `context/crossdoc-conductivity-rise-with-warming/turn2-A.txt`</sub>

### Answer B

The USGS guidance distinguishes sensor classes by accuracy. A "Certified Temperature Sensor" is required to have "a certified accuracy of less than or equal to ±0.05°C with a readout resolution of at least 0.001°C" 【1†"a certified accuracy of less than or equal to ±0.05°C with a readout resolution of at least 0.001°C"】. A "Traceable Temperature Sensor" needs "a manufacturer's stated accuracy of less than or equal to ±0.2°C" 【1†"a manufacturer's stated accuracy of less than or equal to ±0.2°C"】.

Importantly for your case, when a temperature sensor is used to correct another parameter, the tighter requirement applies: "An accuracy specification for a verified sensor is only required if the sensor is bundled onto a multiparameter instrument and is used to correct another water-quality parameter (such as dissolved oxygen or specific conductance). The accuracy of such a sensor is required to be less than or equal to ±0.2°C" 【1†"The accuracy of such a sensor is required to be less than or equal to ±0.2°C"】.

As for checking it: temperature calibration is a verification rather than an adjustment — "calibration refers to a verification of calibrated accuracy at a range of temperatures covering the expected or actual range of use or deployment. The verification comparison is done with a certified or traceable thermometer or sensor" 【2†"calibration refers to a verification of calibrated accuracy at a range of temperatures covering the expected or actual range of use or deployment"】. A new sensor must be checked "against a certified or traceable sensor at points covering the range of expected temperature measurements using a water bath, before the sensor is used to collect environmental data" 【2†"against a certified or traceable sensor at points covering the range of expected temperature measurements using a water bath"】, and for publication-quality data this verification "is required to be performed every 12 months" 【2†"Calibration verification of sensors collecting data for USGS publication is required to be performed every 12 months"】.

Note these are the USGS standard specifications from the reference documents, not your pod's configured thresholds — I don't have your pod's own sensor accuracy spec or verification history available here.

<sub>Context supplied: 6 chunk(s) from 3 document(s) — https://pubs.usgs.gov/tm/09/a6.1/tm9a6.1.pdf, https://pubs.usgs.gov/tm/09/a6.3/tm9-a6_3.pdf, https://pubs.usgs.gov/tm/09/a6.8/tm9a6.8.pdf. Full text: `context/crossdoc-conductivity-rise-with-warming/turn2-B.txt`</sub>

