# refusal-how-long-can-it-stay-in

**Class:** `refusal` · **Turns:** 2

> Answers below are labelled A/B in an order specific to this fixture. The
> same letter means a **different** system on another sheet. Do not compare letters across
> fixtures.

---

## Turn 1

**Question:** We want to drop a pod in the creek and leave it there. Nobody is going out to it unless we put it on the calendar. Is there a limit on how long it can sit in the water before the readings stop being any good?

### Rubric

**Must contain**
- States that no source here gives a maximum length of time an instrument may be left in the water
- Acknowledges that the corpus includes deployed-temperature verification, continuous-sonde calibration checks and turbidity maintenance, without treating them as a universal deployment lifetime
- Attributes the deferral of full long-term deployment guidance to the turbidity section, which points to manufacturer instructions and external continuous-monitor references
- Gives the turbidity chapter's approximate two-to-four-week deployed optical-sensor cleaning cadence, more often with apparent biofouling, without calling it the only interval in the corpus
- States that this is a maintenance cadence for one sensor and not a limit on how long the instrument may stay deployed
- Says plainly that the deployment limit has to come from outside these sources, such as the manufacturer or the project's own plan

**Must not**
- presents the turbidity chapter's two-to-four-week cleaning frequency as the maximum time the pod may stay in the water
- presents the dissolved-oxygen probe datasheet's roughly 18-month maintenance interval as a deployment limit
- presents the ORP probe's roughly one year or the conductivity probe's roughly ten years before recalibration as how long a pod may be left in a creek
- presents the USGS requirement to calibrate on the day of use or check before each field trip as a deployment limit
- invents a number of days or weeks the instrument may remain deployed
- Claims the corpus supplies a complete deployment-validity or month-retention protocol; source-supported continuous-monitor checks are allowed
- cites the deferred continuous-monitoring reference as though its contents were available here

**Should cite**
- usgs-nfm-a6.7-turbidity.pdf
- usgs-nfm-a6.1-temperature.pdf
- epa-sop-field-instrument-calibration-2010.pdf

### Answer A

The probes in the pod are designed for long‑term field use, but each has a manufacturer‑specified maintenance schedule that tells you how long you can leave them in the water before the data may start to drift.

* **Conductivity probe** – The spec sheet lists a life expectancy of about 10 years and recommends recalibration only after roughly 10 years of use【1†"~10 years Time before recalibration"】.  
* **ORP probe** – The ORP probe is rated for a life expectancy of about 4 years and should be recalibrated about once per year【2†"~1 Year Time before recalibration"】【2†"~4 Years + Life expectancy"】.  
* **Dissolved‑oxygen probe** – The DO probe also has a life expectancy of about 4 years and a recommended recalibration interval of roughly once per year【3†"~1 Year Time before recalibration"】【3†"~ 4 Years Life expectancy"】.  
* **pH probe** – The pH probe’s life expectancy is about 4 years and it should be recalibrated about once per year【4†"~1 Year Time before recalibration"】【4†"~4 Years + Life expectancy"】.  
* **Turbidity sensor** – The documentation does not give a specific “time‑before‑recalibration” or life‑expectancy figure, so the configured threshold for how long it can sit is unavailable here.

In practice, you can leave the pod in the creek for at least a year without mandatory recalibration for any of the measured parameters, and the hardware should remain functional for several years (up to the life‑expectancy values above). If you need a precise “stop‑reading” limit, that specific threshold is not provided in the loaded documents.

<sub>Context supplied: 24 chunk(s) from 11 document(s) — EC_K_1.0_probe.pdf, IORP_probe.pdf, Industrial-DO-probe.pdf, IpH_probe.pdf, https://pubs.usgs.gov/tm/09/a6.0/tm9a6.0.pdf, https://pubs.usgs.gov/twri/twri9a6/twri9a67/twri9a_Section6.7_v2.1.pdf, https://pubs.usgs.gov/tm/09/a6.2/tm9a6.2.pdf, https://pubs.usgs.gov/tm/09/a6.1/tm9a6.1.pdf, https://19january2017snapshot.epa.gov/sites/production/files/2015-06/documents/EQASOP-FieldCalibrat.pdf, https://pubs.usgs.gov/tm/09/a6.8/tm9a6.8.pdf, https://pubs.usgs.gov/tm/09/a6.4/tm9a6.4.pdf. Full text: `context/refusal-how-long-can-it-stay-in/turn1-A.txt`</sub>

### Answer B

I can only answer questions grounded in this sensor's readings or the loaded water‑quality documents, and I don't have enough information to answer that.  
The documents do not give a specific maximum time the pod can remain in the water.  

What is provided is guidance on calibration and maintenance. Instruments should be calibrated before deployment and a post‑deployment check should be performed to see if the sensor drifted out of calibration【1†"instrument is calibrated prior to use on the day the measurements are to be performed"}. Some projects may require more frequent calibration checks throughout the day【1†"Some projects may require more frequent calibration checks throughout the day"}; instruments that lose calibration when turned off can be left on all day or calibrated at each sampling location【1†"Some instruments lose their calibration criteria when they are turned off"}. Regular cleaning of optical surfaces and verification against secondary calibration solutions are also recommended as part of the maintenance program【4†"Regular cleaning of optical surfaces"}.

If you need details on the recommended calibration and maintenance procedures, I can provide those.

<sub>Context supplied: 5 chunk(s) from 3 document(s) — https://19january2017snapshot.epa.gov/sites/production/files/2015-06/documents/EQASOP-FieldCalibrat.pdf, https://pubs.usgs.gov/tm/09/a6.1/tm9a6.1.pdf, https://pubs.usgs.gov/twri/twri9a6/twri9a67/twri9a_Section6.7_v2.1.pdf. Full text: `context/refusal-how-long-can-it-stay-in/turn1-B.txt`</sub>

---

## Turn 2

**Question:** Say we leave it a month anyway. When we pull it out, how much of that month am I allowed to keep?

### Rubric

**Must contain**
- States that the corpus gives no rule for deciding which part of a long record may be kept and which must be thrown out
- States that no source gives an allowable rate of drift - a per-day or per-week figure - for a sensor left in the water
- States that it gives no procedure for correcting or adjusting a record after the instrument comes out
- Notes that the turbidity chapter does offer a fouling check, comparing the sensor's reading on a calibrant before and after cleaning it and taking the percent difference
- States that this fouling check quantifies one sensor's condition and is not an acceptance rule for the record
- Notes that the EPA field calibration SOP has the operator calibrate before deployment and check the calibration on recovery, defers the drift criteria to the project's quality assurance plan, and supplies its own default post-calibration criteria only for when that plan is silent
- Declines to convert the EPA post-calibration criteria into a keep-or-discard threshold for a month of record, and supplies no drift tolerance beyond them
- Notes that the EPA SOP's default post-calibration criteria are a pass-or-fail check on the instrument at recovery, not a rule for how much of the record may be kept, and that data failing the check are qualified rather than discarded

**Must not**
- Converts EPA drift/post-calibration criteria into an unsupported per-day drift rate or rule allocating portions of a month to retain; using EPA's drift terminology is allowed
- turns the turbidity fouling-bias percent difference into a pass or fail cutoff by attaching a number to it
- Invents an allowable drift rate across a deployment; accepts EPA's actual pre/post-calibration comparison and project/default drift criteria
- presents the plus or minus 0.2 degrees C temperature comparison tolerance as an allowable drift for a month in the water
- invents a data-qualification or flagging scheme and attributes it to these sources
- claims the project quality assurance plan's criteria are available here
- recommends keeping or discarding a specific portion of the record on a threshold it made up

**Should cite**
- usgs-nfm-a6.7-turbidity.pdf
- epa-sop-field-instrument-calibration-2010.pdf

### Answer A

A month of deployment is well within the manufacturers’ recommended maintenance intervals for all of the measured parameters, so the data you collect during that time can be retained and used.

* The conductivity probe is specified for a life expectancy of about 10 years and only needs recalibration after roughly 10 years【1†"~10 years Time before recalibration"】.  
* The ORP, dissolved‑oxygen, and pH probes each list a “time before recalibration” of about 1 year and a life expectancy of roughly 4 years【2†"~1 Year Time before recalibration"】【2†"~4 Years + Life expectancy"】【3†"~1 Year Time before recalibration"】【3†"~ 4 Years Life expectancy"】【4†"~1 Year Time before recalibration"】【4†"~4 Years + Life expectancy"】.  

Because a one‑month deployment is far shorter than any of those intervals, the readings you obtain during that month are considered valid and can be kept. (The turbidity sensor’s specific “time‑before‑recalibration” limit is not provided in the loaded documents, so no threshold is available for that parameter.)

<sub>Context supplied: 22 chunk(s) from 10 document(s) — EC_K_1.0_probe.pdf, IORP_probe.pdf, Industrial-DO-probe.pdf, IpH_probe.pdf, https://pubs.usgs.gov/tm/09/a6.0/tm9a6.0.pdf, https://pubs.usgs.gov/tm/09/a6.4/tm9a6.4.pdf, https://pubs.usgs.gov/twri/twri9a6/twri9a67/twri9a_Section6.7_v2.1.pdf, https://pubs.usgs.gov/tm/09/a6.8/tm9a6.8.pdf, https://pubs.usgs.gov/tm/09/a6.3/tm9-a6_3.pdf, https://pubs.usgs.gov/tm/09/a6.2/tm9a6.2.pdf. Full text: `context/refusal-how-long-can-it-stay-in/turn2-A.txt`</sub>

### Answer B

I can only answer questions grounded in this sensor's readings or the loaded water‑quality documents, and I don't have enough information to answer that.  
The documents do not provide a specific limit on how long data collected over a month remains usable.  
I can share the calibration and maintenance guidance that is available.

<sub>Context supplied: 4 chunk(s) from 2 document(s) — https://19january2017snapshot.epa.gov/sites/production/files/2015-06/documents/EQASOP-FieldCalibrat.pdf, https://pubs.usgs.gov/twri/twri9a6/twri9a67/twri9a_Section6.7_v2.1.pdf. Full text: `context/refusal-how-long-can-it-stay-in/turn2-B.txt`</sub>

