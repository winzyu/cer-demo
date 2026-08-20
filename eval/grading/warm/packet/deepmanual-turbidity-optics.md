# deepmanual-turbidity-optics

**Class:** `deep-in-manual` · **Turns:** 2

> Answers below are labelled A/B/C in an order specific to this fixture. The same letter
> means a **different** system on another sheet. Do not compare letters across fixtures.

---

## Turn 1

**Question:** How does a turbidity sensor physically take its reading?

### Rubric

**Must contain**
- a light source illuminates the sample and a detector measures the light scattered at a 90-degree angle
- multiparameter sondes typically use a near-infrared source (about 780–900 nm), usually an LED, with one detector at 90 degrees
- the result is reported in nephelometric turbidity units (NTU)

**Must not**
- describes an optical arrangement absent from the corpus
- confuses the turbidity sensor with the optical DO sensor

**Should cite**
- tm9a6.8.pdf
- volunteer_stream_monitoring_a_methods_manual.pdf

### Answer A

I can only answer questions grounded in this sensor's readings or the loaded water‑quality documents, and I don't have enough information to answer that. The provided context does not describe how a turbidity sensor takes its reading.

<sub>Context supplied: 5 chunk(s) from 1 document(s) — tm9a6.2.pdf. Full text: `context/deepmanual-turbidity-optics/turn1-A.txt`</sub>

### Answer B

A turbidity meter works by shining a light through a water sample and measuring how much of that light is scattered by suspended particles.  
* A light source (often a laser or LED) illuminates the sample.  
* A photoelectric detector positioned at about 90° to the light beam measures the intensity of the scattered light.  
* The detector’s signal is converted to nephelometric turbidity units (NTU), which represent the amount of light scattered by the particles in the water.  

This single‑beam, 90‑degree scattering method is the standard way turbidity is measured in both field and laboratory instruments【1】【3】.

<sub>Context supplied: 5 chunk(s) from 2 document(s) — volunteer_stream_monitoring_a_methods_manual.pdf, tm9a6.8.pdf. Full text: `context/deepmanual-turbidity-optics/turn1-B.txt`</sub>

### Answer C

A turbidity sensor measures how much light is scattered by suspended particles in the water.  
The sensor contains a light source (usually an LED) that shines a beam into the sample.  
A photodetector (photodiode or phototransistor) is positioned either at 90° to the beam or on the opposite side to detect the light that has been scattered or transmitted. The intensity of the detected light is inversely proportional to the amount of suspended material, and the sensor converts that signal into turbidity units (NTU or FNU)【5†L1-L4】.

<sub>Context supplied: 5 chunk(s) from 5 document(s) — EC_K_1.0_probe.pdf, IORP_probe.pdf, Industrial-DO-probe.pdf, IpH_probe.pdf, water-quality-metrics-source-of-truth.pdf. Full text: `context/deepmanual-turbidity-optics/turn1-C.txt`</sub>

---

## Turn 2

**Question:** Does that explain why NTU and FNU differ?

### Rubric

**Must contain**
- links the light source to the unit — white light corresponds to NTU, infrared to FNU
- restates that the two units are not interchangeable

**Must not**
- supplies a conversion between the units

**Should cite**
- water-quality-metrics-source-of-truth.pdf

### Answer A

The context only notes that NTU (white‑light) and FNU (infrared) are not interchangeable and that a single unit type should be used consistently. It does not explain the physical reason why the two units differ.

<sub>Context supplied: 5 chunk(s) from 2 document(s) — water-quality-metrics-source-of-truth.pdf, volunteer_stream_monitoring_a_methods_manual.pdf. Full text: `context/deepmanual-turbidity-optics/turn2-A.txt`</sub>

### Answer B

Yes. The basic sensor principle you described—illuminating the sample and measuring scattered light—does explain the difference between NTU and FNU.  
* **NTU (nephelometric turbidity units)** are based on visible‑light scattering measured at a 90° angle.  
* **FNU (infrared nephelometric units)** use an infrared wavelength for the same scattering measurement.  

Because the two methods use different wavelengths, the numerical values they produce are not directly comparable, so NTU and FNU are not interchangeable【3】【4】.

<sub>Context supplied: 5 chunk(s) from 3 document(s) — tm9a6.8.pdf, volunteer_stream_monitoring_a_methods_manual.pdf, water-quality-metrics-source-of-truth.pdf. Full text: `context/deepmanual-turbidity-optics/turn2-B.txt`</sub>

### Answer C

Yes. The basic principle is the same—measure how much light is scattered by suspended particles—but the wavelength of the light matters.  
NTU (nephelometric turbidity units) are measured with a **white‑light** source and a detector that captures scattered light at a 90° angle.  
FNU (fluorescence‑based nephelometric units) use an **infrared** source and a detector that is sensitive to the different scattering behavior of IR light. Because particles scatter light differently at different wavelengths, the two units are not interchangeable【5†L1-L4】【5†L5-L7】.

<sub>Context supplied: 5 chunk(s) from 5 document(s) — EC_K_1.0_probe.pdf, IORP_probe.pdf, Industrial-DO-probe.pdf, IpH_probe.pdf, water-quality-metrics-source-of-truth.pdf. Full text: `context/deepmanual-turbidity-optics/turn2-C.txt`</sub>

