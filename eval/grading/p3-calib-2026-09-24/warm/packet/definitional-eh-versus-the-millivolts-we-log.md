# definitional-eh-versus-the-millivolts-we-log

**Class:** `definitional` · **Turns:** 2

> Answers below are labelled A/B in an order specific to this fixture. The
> same letter means a **different** system on another sheet. Do not compare letters across
> fixtures.

---

## Turn 1

**Question:** The USGS chapters keep saying Eh where our kit just says ORP in millivolts. Is Eh the same number our probe is giving us, or something else?

### Rubric

**Must contain**
- states that Eh is defined relative to the standard hydrogen electrode
- states that Eh is an equilibrium potential developed at the boundary between a noble-metal electrode and the water, and reflects the redox-active species in solution
- states that the millivolts the probe reads are not Eh on their own, because that raw reading is against the probe's own reference electrode
- states that getting Eh means adding the reference electrode's own potential to the measured reading

**Must not**
- asserts that Eh and the probe's raw ORP output are interchangeable
- invents a numeric offset between the probe reading and Eh for this operator's hardware
- answers only from the probe datasheet's electron-activity description and never reaches the standard hydrogen electrode reference

**Should cite**
- usgs-nfm-a6.5-orp.pdf

### Answer A

Yes. In the USGS field manuals the term **Eh** (the symbol for oxidation‑reduction potential) is used for the same redox measurement that your probe reports as **ORP** in millivolts. The manuals note that “ORP … accuracy, ±5 mV. For guidance on **Eh** measurements using the platinum electrode, refer to NFM A6.5”【5†"ORP … accuracy, ±5 mV. For guidance on Eh measurements using the platinum electrode"】, and they list “ORP … accuracy, ±5 mV” alongside the same unit (millivolts)【10†"ORP … accuracy, ±5 mV"】. Thus, the numeric value your probe outputs as ORP (mV) is the Eh value the USGS documents refer to.

<sub>Context supplied: 21 chunk(s) from 10 document(s) — EC_K_1.0_probe.pdf, IORP_probe.pdf, Industrial-DO-probe.pdf, IpH_probe.pdf, https://pubs.usgs.gov/tm/09/a6.8/tm9a6.8.pdf, https://pubs.usgs.gov/twri/twri9a6/twri9a65/twri9a_6.5_v_1.2.pdf, https://19january2017snapshot.epa.gov/sites/production/files/2015-06/documents/EQASOP-FieldCalibrat.pdf, https://pubs.usgs.gov/tm/09/a6.2/tm9a6.2.pdf, https://pubs.usgs.gov/tm/09/a6.4/tm9a6.4.pdf, https://pubs.usgs.gov/tm/09/a6.0/tm9a6.0.pdf. Full text: `context/definitional-eh-versus-the-millivolts-we-log/turn1-A.txt`</sub>

### Answer B

Eh is defined as “a measure of the equilibrium potential, relative to the standard hydrogen electrode” and is reported in millivolts【5†"REDUCTION‑OXIDATION POTENTIAL (as Eh)—A measure of the equilibrium potential, relative to the standard hydrogen electrode..."】.  

I can only answer questions grounded in this sensor's readings or the loaded water‑quality documents, and I don't have enough information to answer that. I’m missing a direct statement that “Eh” and “ORP” are the same numeric value. I could instead describe how Eh is measured and interpreted.

<sub>Context supplied: 7 chunk(s) from 2 document(s) — https://pubs.usgs.gov/tm/09/a6.0/tm9a6.0.pdf, https://pubs.usgs.gov/twri/twri9a6/twri9a65/twri9a_6.5_v_1.2.pdf. Full text: `context/definitional-eh-versus-the-millivolts-we-log/turn1-B.txt`</sub>

---

## Turn 2

**Question:** Then why isn't it in the list of things we're told to watch settle down before we take a reading? Everything else is on there.

### Rubric

**Must contain**
- states that Eh is not treated as a routine or direct field measurement
- states that because of this it has no entry in the stabilisation criteria that the other field measurements have
- names the properties that are treated as routine on-site measurements - water temperature, dissolved oxygen, specific conductance, pH and turbidity

**Must not**
- invents a table 6.0-1 stabilization criterion for Eh, or a settling time not present in the context
- claims Eh is excluded because the equipment cannot measure it
- conflates 'not a routine field measurement' with 'not worth recording'

**Should cite**
- usgs-nfm-a6.0-field-measurement-guidelines.pdf
- usgs-nfm-a6.5-orp.pdf

### Answer A

The USGS “wait for particles to settle” note applies to **turbidity** measurements, not to redox‑potential (ORP/Eh) readings. Turbidity is measured by how much light is scattered by suspended particles, so if those particles settle the instrument can give a lower value; the guidance therefore says “Values must be read from the meter before particle settling can affect the measured turbidity.”【19†"Values must be read from the meter before particle settling can affect the measured turbidity."】

An ORP probe, on the other hand, measures the electron activity of the water with a platinum electrode. Its specification lists a fast response time (95 % of the final value in about 1 second) and does not mention particle settling as a factor【2†"95% in 1s Response time"】. Because the redox potential is not dependent on suspended solids, the USGS documents do not include ORP/Eh in the “watch for settling” list.

<sub>Context supplied: 24 chunk(s) from 12 document(s) — EC_K_1.0_probe.pdf, IORP_probe.pdf, Industrial-DO-probe.pdf, IpH_probe.pdf, https://pubs.usgs.gov/tm/09/a6.4/tm9a6.4.pdf, https://pubs.usgs.gov/tm/09/a6.0/tm9a6.0.pdf, https://pubs.usgs.gov/tm/09/a6.2/tm9a6.2.pdf, https://pubs.usgs.gov/tm/09/a6.1/tm9a6.1.pdf, https://pubs.usgs.gov/tm/09/a6.3/tm9-a6_3.pdf, https://pubs.usgs.gov/tm/09/a6.8/tm9a6.8.pdf, https://pubs.usgs.gov/twri/twri9a6/twri9a67/twri9a_Section6.7_v2.1.pdf, https://19january2017snapshot.epa.gov/sites/production/files/2015-06/documents/EQASOP-FieldCalibrat.pdf. Full text: `context/definitional-eh-versus-the-millivolts-we-log/turn2-A.txt`</sub>

### Answer B

Eh (or ORP) isn’t included in the stabilization‑criteria table because the USGS treats it as **not a routine direct‑field measurement**. The table lists temperature, specific conductance, dissolved‑oxygen, pH and turbidity, and notes that “Eh is not considered to be a routine or direct field measurement (see National Field Manual (NFM) A6.5)”【3†"Eh is not considered to be a routine or direct field measurement (see National Field Manual (NFM) A6.5)"】. Therefore it isn’t part of the parameters that must “settle down” before a reading is taken.

<sub>Context supplied: 7 chunk(s) from 2 document(s) — https://pubs.usgs.gov/tm/09/a6.0/tm9a6.0.pdf, https://pubs.usgs.gov/twri/twri9a6/twri9a65/twri9a_6.5_v_1.2.pdf. Full text: `context/definitional-eh-versus-the-millivolts-we-log/turn2-B.txt`</sub>

