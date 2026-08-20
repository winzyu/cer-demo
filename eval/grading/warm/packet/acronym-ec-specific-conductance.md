# acronym-ec-specific-conductance

**Class:** `acronym-exact-token` · **Turns:** 2

> Answers below are labelled A/B/C in an order specific to this fixture. The same letter
> means a **different** system on another sheet. Do not compare letters across fixtures.

---

## Turn 1

**Question:** What's the difference between EC and specific conductance?

### Rubric

**Must contain**
- states EC is the raw electrical-conductivity measurement
- states specific conductance is EC corrected to 25 °C
- states raw EC rises ~2% per °C, so uncorrected EC tracks temperature and produces false signals

**Must not**
- treats the two terms as identical with no temperature correction
- invents a different temperature coefficient

**Should cite**
- water-quality-metrics-source-of-truth.pdf

### Answer A

**Electrical conductivity (EC)** is the raw measurement of how well water conducts an electric current, expressed in µS cm⁻¹.  
**Specific conductance** is the same property but corrected to a standard temperature (usually 25 °C) so that values can be compared or used in calculations such as salinity‑correction factors【5†L179-L186】【3†L1-L6】.

<sub>Context supplied: 5 chunk(s) from 4 document(s) — EC_K_1.0_probe.pdf, tm9a6.2.pdf, tm9a6.8.pdf, volunteer_stream_monitoring_a_methods_manual.pdf. Full text: `context/acronym-ec-specific-conductance/turn1-A.txt`</sub>

### Answer B

EC (electrical conductivity) is the raw measurement of how well the water conducts electricity, expressed in μS cm⁻¹.  
Specific conductance is the same value but temperature‑corrected (usually to 25 °C) so that changes in temperature don’t masquerade as changes in dissolved‑ion content【5†L1-L4】.

<sub>Context supplied: 5 chunk(s) from 5 document(s) — EC_K_1.0_probe.pdf, IORP_probe.pdf, Industrial-DO-probe.pdf, IpH_probe.pdf, water-quality-metrics-source-of-truth.pdf. Full text: `context/acronym-ec-specific-conductance/turn1-B.txt`</sub>

### Answer C

EC (electrical conductivity) is the raw measurement of how well a water sample conducts an electric current.  
Specific conductance (SC) is the same property, but it is usually expressed per unit length and area and is corrected to a standard temperature (commonly 25 °C) so that values can be compared regardless of the sample’s temperature【1】. In practice, many sensors report the temperature‑corrected value and label it “specific conductance,” while the underlying measurement is still the electrical conductivity of the water.

<sub>Context supplied: 5 chunk(s) from 3 document(s) — tm9a6.8.pdf, EC_K_1.0_probe.pdf, volunteer_stream_monitoring_a_methods_manual.pdf. Full text: `context/acronym-ec-specific-conductance/turn1-C.txt`</sub>

---

## Turn 2

**Question:** So if EC climbed 4% overnight and the water warmed 2 degrees, is that a real change?

### Rubric

**Must contain**
- applies the ~2%/°C rule and attributes roughly the whole 4% rise to the 2 °C warming
- concludes it is most likely a temperature artifact rather than a chemistry change
- recommends comparing temperature-corrected specific conductance before calling it an event

**Must not**
- ignores the temperature correction
- declares a pollution event

**Should cite**
- water-quality-metrics-source-of-truth.pdf

### Answer A

A 4 % rise in raw EC that coincides with a 2 °C temperature increase is almost certainly just the temperature effect.  The literature notes that ion mobility—and therefore raw EC—increases about 2 % per °C, so a 2 °C rise would produce roughly a 4 % jump in EC【1†L1-L6】.  To determine whether the water’s chemistry actually changed, you’d need to convert the raw EC to temperature‑corrected specific conductance; if that value is unchanged, the “real” change is nil.

<sub>Context supplied: 5 chunk(s) from 2 document(s) — water-quality-metrics-source-of-truth.pdf, volunteer_stream_monitoring_a_methods_manual.pdf. Full text: `context/acronym-ec-specific-conductance/turn2-A.txt`</sub>

### Answer B

No – the 4 % rise can be explained by the 2 °C temperature increase.  
Raw EC typically goes up about 2 % per °C, so a 2 °C rise would produce roughly a 4 % jump in EC.  
If you correct the EC to a standard temperature (specific conductance), the value would likely stay the same, indicating no real change in dissolved‑ion content【5†L1-L4】.

<sub>Context supplied: 5 chunk(s) from 5 document(s) — EC_K_1.0_probe.pdf, IORP_probe.pdf, Industrial-DO-probe.pdf, IpH_probe.pdf, water-quality-metrics-source-of-truth.pdf. Full text: `context/acronym-ec-specific-conductance/turn2-B.txt`</sub>

### Answer C

Raw EC rises about 2 % for every 1 °C increase in temperature.  
If the water warmed 2 °C, you’d expect roughly a 4 % rise in the raw EC just from the temperature effect.  
So a 4 % overnight climb in the un‑corrected EC is consistent with the temperature rise and does **not** automatically indicate a real change in dissolved ions.  
To determine whether the chemistry actually changed, you need to look at the temperature‑corrected specific conductance (25 °C‑corrected). If that value still shows a significant increase, then it’s a real change; if it stays flat, the rise was just thermal.【1】

<sub>Context supplied: 5 chunk(s) from 2 document(s) — water-quality-metrics-source-of-truth.pdf, volunteer_stream_monitoring_a_methods_manual.pdf. Full text: `context/acronym-ec-specific-conductance/turn2-C.txt`</sub>

