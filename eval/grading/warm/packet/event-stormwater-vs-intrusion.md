# event-stormwater-vs-intrusion

**Class:** `event-signature` · **Turns:** 2

> Answers below are labelled A/B/C in an order specific to this fixture. The same letter
> means a **different** system on another sheet. Do not compare letters across fixtures.

---

## Turn 1

**Question:** Turbidity spiked hard and EC dropped. Storm runoff or saltwater intrusion?

### Rubric

**Must contain**
- gives the stormwater/urban-runoff signature: a sharp turbidity spike coincident with rainfall, with EC dropping in marine settings and possibly spiking in freshwater from road salt
- gives the saltwater-intrusion signature: EC rising strongly with little turbidity change, correlated with tidal phase, drought or sea-level conditions
- concludes the described pattern fits stormwater runoff rather than intrusion

**Must not**
- concludes saltwater intrusion
- invents a signature

**Should cite**
- water-quality-metrics-source-of-truth.pdf

### Answer A

A turbidity spike **with a simultaneous drop in electrical conductivity (EC)** is the classic signature of **storm‑runoff dilution**.  
- Turbidity rises when runoff carries sediment, organic matter, or other suspended particles into the water.  
- EC falls because the fresh runoff water has a much lower ion concentration than the existing water, diluting the dissolved‑salt load.

Salt‑water intrusion would instead **raise** EC (saltwater has ~1,000× higher conductivity than freshwater) and typically would not produce a turbidity spike unless accompanied by a separate sediment event.  

So the pattern you’re seeing points to storm‑runoff rather than salt‑water intrusion.  

*(Source: water‑quality‑metrics‑source‑of‑truth, “Stormwater / urban runoff” signature matrix – turbidity spike + EC drop.)*

<sub>Context supplied: 5 chunk(s) from 5 document(s) — EC_K_1.0_probe.pdf, IORP_probe.pdf, Industrial-DO-probe.pdf, IpH_probe.pdf, water-quality-metrics-source-of-truth.pdf. Full text: `context/event-stormwater-vs-intrusion/turn1-A.txt`</sub>

### Answer B

A turbidity spike is a classic sign of storm‑runoff or erosion, but the accompanying **drop in conductivity** is not what the diagnostic matrix shows for either storm‑runoff or salt‑water intrusion.

* In the “Stormwater / urban runoff” signature (water‑quality‑metrics‑source‑of‑truth.pdf, matrix) turbidity spikes **with EC rising** (↑↑) are expected【2†L4-L7】.  
* The “Saltwater intrusion” signature also shows turbidity changes with **EC rising** (↑↑)【5†L1-L3】.

A falling EC would instead suggest dilution by very low‑ion water (e.g., a large influx of fresh rainwater that is less conductive than the stream), which is not the typical pattern for either of those two events. Therefore, the pattern you describe does not match the standard signatures for storm‑runoff or salt‑water intrusion.

<sub>Context supplied: 5 chunk(s) from 2 document(s) — volunteer_stream_monitoring_a_methods_manual.pdf, water-quality-metrics-source-of-truth.pdf. Full text: `context/event-stormwater-vs-intrusion/turn1-B.txt`</sub>

### Answer C

A turbidity spike **with a simultaneous drop in conductivity** is the classic signature of a fresh‑water input—most often storm‑runoff.  

- Turbidity often rises sharply during rainfall because runoff from impervious surfaces carries soil, sediment, and other suspended particles into the stream【1】.  
- Conductivity (EC) is a measure of dissolved ions. Fresh‑water runoff dilutes the stream’s ion concentration, so EC falls. In contrast, salt‑water intrusion would raise EC dramatically (seawater is ~45,000–55,000 µS/cm)【3】.  

Therefore, the pattern you’re seeing points to storm‑runoff rather than salt‑water intrusion.

<sub>Context supplied: 5 chunk(s) from 2 document(s) — volunteer_stream_monitoring_a_methods_manual.pdf, water-quality-metrics-source-of-truth.pdf. Full text: `context/event-stormwater-vs-intrusion/turn1-C.txt`</sub>

---

## Turn 2

**Question:** How do I rule out the tide?

### Rubric

**Must contain**
- states an EC change that repeats on the tidal clock is mixing, not a discharge
- notes turbidity often peaks at maximum tidal current from resuspension
- states a real event appears as a step-change or sustained excursion that breaks the expected diel or tidal rhythm

**Must not**
- treats a repeating tidal oscillation as evidence of an event

**Should cite**
- water-quality-metrics-source-of-truth.pdf

### Answer A

To be sure the spike isn’t just a tidal fluctuation, check these points:

1. **Timing vs. tidal phase** – Tidal‑related changes in EC and turbidity usually repeat every 12–13 h (semidiurnal) or 24 h (diurnal). If the spike occurs at a random time (e.g., after a rain event) and does not recur with the next tide, it’s likely not tidal.

2. **Pattern of change** – Tides produce a smooth, sinusoidal rise and fall in EC and turbidity. A storm‑runoff event shows a sharp, step‑like increase in turbidity and a sudden drop in EC that then gradually returns to baseline, not a gradual tidal rise.

3. **Baseline comparison** – Compare the current EC and turbidity to the long‑term tidal baseline for that site. If the values fall outside the normal tidal envelope (e.g., EC lower than the lowest tidal value), the event is probably not tidal.

4. **Co‑variation with other parameters** – Tidal changes often affect temperature and salinity (or EC) but not usually cause a large turbidity spike unless accompanied by sediment resuspension. A storm event will also show a concurrent rise in temperature (from runoff) and possibly a drop in dissolved oxygen.

If the spike does not match the regular tidal pattern and shows a sudden, non‑periodic change, you can rule out tide and attribute it to storm runoff.  

*(Source: water‑quality‑metrics‑source‑of‑truth, “Rule out the water body’s normal rhythms” and “Stormwater / urban runoff” signature matrix.)*

<sub>Context supplied: 5 chunk(s) from 5 document(s) — EC_K_1.0_probe.pdf, IORP_probe.pdf, Industrial-DO-probe.pdf, IpH_probe.pdf, water-quality-metrics-source-of-truth.pdf. Full text: `context/event-stormwater-vs-intrusion/turn2-A.txt`</sub>

### Answer B

To be sure the turbidity/EC change isn’t just a tidal signal, look for the **tidal signature** in your data and then see if the event breaks that pattern.

1. **Check the time‑series for periodicity**  
   * Tidal changes are usually sinusoidal or step‑like with a period of ~12.4 h (semidiurnal) or ~24.8 h (diurnal).  
   * Plot turbidity, EC, and temperature against time and overlay a tide‑prediction curve (or the local tide table). If the spikes line up with high‑ or low‑tide times, they’re likely tidal.

2. **Look for the expected parameter coupling**  
   * In a tidal cycle, EC, temperature, and turbidity all oscillate together (EC and temperature rise with high tide, turbidity often peaks at the strongest current).  
   * If only turbidity spikes while EC and temperature stay flat or move in the opposite direction, the event is less likely tidal.

3. **Assess the shape of the change**  
   * Tidal changes are smooth and repeatable. A sudden, sustained step‑change that does not recur with the next tide is a red flag for a non‑tidal event (e.g., runoff, discharge).

4. **Compare to the “normal” tidal range**  
   * Use the historical baseline for your site (if available) to see what the typical EC and turbidity ranges are during tidal cycles.  
   * If the observed values exceed the normal tidal envelope, the event is probably not tidal.

5. **Cross‑check with other parameters**  
   * A true tidal signal will also show a corresponding shift in water level or flow direction (if you have that data).  
   * If you only have turbidity and EC, look for a simultaneous rise in EC and temperature; a drop in EC with a turbidity spike is atypical for tide.

If after these checks the spike does **not** match the timing, shape, or coupled behavior of the tidal cycle, you can rule out tide as the cause.

<sub>Context supplied: 5 chunk(s) from 3 document(s) — volunteer_stream_monitoring_a_methods_manual.pdf, water-quality-metrics-source-of-truth.pdf, tm9a6.2.pdf. Full text: `context/event-stormwater-vs-intrusion/turn2-B.txt`</sub>

### Answer C

To be sure the change isn’t just a tidal “pulse,” look for the hall‑marks of a tide in your data:

| What to check | Why it matters | How to test it |
|---------------|----------------|----------------|
| **Periodic repeat** | Tides are strictly periodic (≈12 h 25 min for a semi‑diurnal tide). | Plot EC, temperature, and turbidity over several days. A tide will show a regular, repeating wave‑like pattern. A storm‑runoff event will appear as a one‑time step or a short‑lived spike that does not recur. |
| **Co‑variation of EC, temperature, turbidity** | In estuaries, EC and temperature rise with the tide (water moves in from the ocean) while turbidity often peaks at high‑current points. | Check whether EC and temperature rise *simultaneously* with turbidity. If EC falls while turbidity rises, that’s the opposite of a tidal signature. |
| **Connection to the ocean** | Only water bodies that are physically linked to the sea can be affected by tides. | Verify the site’s geography. If it’s a freshwater stream, lake, or isolated pond, tide cannot be the cause. |
| **Magnitude of change** | Tidal changes in EC are usually modest (tens to a few hundred µS/cm) unless the water body is very shallow. | Compare the observed EC change to typical tidal swings for the region. A drop of several hundred µS/cm is more consistent with dilution from runoff than with tidal mixing. |

**Bottom line:**  
- A turbidity spike *with* a drop in EC, no periodic repeat, and a site that isn’t ocean‑connected is almost certainly storm‑runoff.  
- If you see a regular, repeating pattern in EC, temperature, and turbidity that matches the local tidal cycle, then tide is the likely driver.  

These criteria come from the diagnostic matrix in the water‑quality corpus, which notes that “EC rise correlated with tidal phase” is a tidal signature, whereas “turbidity spike with EC drop” points to fresh‑water runoff【4】.

<sub>Context supplied: 5 chunk(s) from 2 document(s) — volunteer_stream_monitoring_a_methods_manual.pdf, water-quality-metrics-source-of-truth.pdf. Full text: `context/event-stormwater-vs-intrusion/turn2-C.txt`</sub>

