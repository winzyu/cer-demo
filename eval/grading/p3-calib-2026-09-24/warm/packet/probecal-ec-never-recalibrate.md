# probecal-ec-never-recalibrate

**Class:** `probe-calibration` · **Turns:** 2

> Answers below are labelled A/B in an order specific to this fixture. The
> same letter means a **different** system on another sheet. Do not compare letters across
> fixtures.

---

## Turn 1

**Question:** The vendor sheet for our conductivity sensor says the plates do not change and it never really needs recalibrating after the first time. Is that how we should be running it on a station that reports data, or is there something we still have to do?

### Rubric

**Must contain**
- Acknowledges the manufacturer's position that these sensors hold their calibration and frequent recalibration is generally unnecessary
- States that the sensor must still be checked or calibrated before every field trip
- States that accuracy must be verified at the field site against a standard before measurements are made
- Gives the acceptance criterion as within plus or minus 5 microsiemens per centimetre at or below 100 microsiemens per centimetre, or plus or minus 3 percent above that
- States that the meter is recalibrated when the check fails

**Must not**
- Concludes that no recalibration or field verification is ever needed after the first calibration
- Treats the datasheet's approximately 10 year figure as the governing field practice for a reporting station
- invents an acceptance criterion that appears in no source

**Should cite**
- usgs-nfm-a6.3-specific-conductance.pdf
- EC_K_1.0_probe.pdf

### Answer A

The vendor’s sheet says the graphite plates stay stable, so after you do the first calibration the probe can stay in service without a regular recalibration schedule. The document notes that “the plates do not go bad, or change, so recalibration is not necessary. After the first calibration your conductivity probe is good to go”【1†"the plates do not go bad, or change, so recalibration is not necessary. After the first calibration your conductivity probe is good to go"} and that the typical “Time before recalibration” is on the order of ~10 years【1†"~10 years	Time before recalibration"}.

In practice you can run the sensor continuously after that initial calibration, but you should still:

* Keep the entire sensing area fully submerged and watch for air bubbles, which can throw off results【1†"watch out for air bubbles, as they can get caught between the two graphite plates and throw off your results"}.
* Periodically clean the plates if they become dirty or develop deposits, because “over time conductivity probes can become dirty and covered in deposits, which can change the basic electrical properties of the probe and cause inaccurate readings”【1†"Over time conductivity probes can become dirty and covered in deposits, which can change the basic electrical properties of the probe and cause inaccurate readings"}.

So, after the first calibration you do not need a scheduled recalibration unless the probe shows drift or you reach the ~10‑year interval, but regular visual checks, bubble removal, and occasional cleaning are still recommended.

<sub>Context supplied: 22 chunk(s) from 10 document(s) — EC_K_1.0_probe.pdf, IORP_probe.pdf, Industrial-DO-probe.pdf, IpH_probe.pdf, https://pubs.usgs.gov/tm/09/a6.3/tm9-a6_3.pdf, https://19january2017snapshot.epa.gov/sites/production/files/2015-06/documents/EQASOP-FieldCalibrat.pdf, https://pubs.usgs.gov/tm/09/a6.2/tm9a6.2.pdf, https://pubs.usgs.gov/tm/09/a6.1/tm9a6.1.pdf, https://pubs.usgs.gov/tm/09/a6.8/tm9a6.8.pdf, https://pubs.usgs.gov/twri/twri9a6/twri9a65/twri9a_6.5_v_1.2.pdf. Full text: `context/probecal-ec-never-recalibrate/turn1-A.txt`</sub>

### Answer B

The vendor’s sheet notes that the graphite plates “do not go bad, or change, so recalibration is not necessary” after the first calibration【6†"The plates do not go bad, or change, so recalibration is not necessary."】. In practice, many users still perform periodic verification checks—especially before field trips or after long deployments—to confirm the probe is still measuring accurately. USGS guidance says “Specific conductance meters must be checked or calibrated before every field trip to ensure that the meter and probe are working properly”【2†"Specific conductance meters must be checked or calibrated before every field trip to ensure that the meter and probe are working properly."】, and that measurements within the accepted tolerance “do not warrant recalibration”【3†"Measurements of specific conductance standards that are within ±5 μS/cm ... are considered accurate and do not warrant recalibration."】. So you can run the sensor continuously without routine recalibration, but it’s advisable to periodically verify its accuracy against a known standard and recalibrate only if the check falls outside those tolerances.

<sub>Context supplied: 8 chunk(s) from 2 document(s) — EC_K_1.0_probe.pdf, https://pubs.usgs.gov/tm/09/a6.3/tm9-a6_3.pdf. Full text: `context/probecal-ec-never-recalibrate/turn1-B.txt`</sub>

---

## Turn 2

**Question:** Fine - so what do I carry to check it with? Our water runs somewhere around 700 µS/cm in the summer.

### Rubric

**Must contain**
- States that potassium chloride solutions traceable to NIST are the standards used
- States that the standard should be near, or bracket, the expected value in the water being measured
- Recommends staying above 200 microsiemens per centimetre because dilute standards are easily contaminated or diluted
- Selects compatible certified standards near or bracketing approximately 700 µS/cm, such as 500 for a one-point check or 500 and 1,413 for multipoint calibration; these examples are not exclusive
- Applies ±5 µS/cm at or below a standard value of 100 µS/cm, or ±3 percent above 100 µS/cm, to the check standard rather than the sample value

**Must not**
- Recommends deionized water as a calibration standard
- Presents dilute standards below 200 µS/cm as generally preferred without accounting for contamination risk or instrument requirements
- Invents an unsupported or incompatible standard; allows other certified, instrument-compatible values

**Should cite**
- usgs-nfm-a6.3-specific-conductance.pdf

### Answer A

You can carry a **conductivity check standard** that is close to the value you expect in the field.  
The USGS guidance says you should “choose the SC standard(s) nearest to and/or that bracket(s) the expected measurement or range”【11†"choose the SC standard(s) nearest to and/or that bracket(s) the expected measurement or range"} and that for measurements above 100 µS/cm the acceptable check‑standard tolerance is “±3 percent”【5†"±3 percent for measurements >100 μS/cm"}—which at 700 µS/cm corresponds to about ±21 µS/cm.  

So a portable conductivity standard solution around 700 µS/cm (or a pair that brackets 600–800 µS/cm) can be used to verify the probe’s response before or during a deployment.  

The vendor sheet notes the graphite plates “do not go bad, or change, so recalibration is not necessary. After the first calibration your conductivity probe is good to go”【1†"the plates do not go bad, or change, so recalibration is not necessary. After the first calibration your conductivity probe is good to go"} and that the typical “Time before recalibration” is about 10 years【1†"~10 years	Time before recalibration"}; however, periodic checks with a standard solution are still recommended to catch any drift or fouling.  

In practice, bring a small bottle of a certified 700 µS/cm (or similar) standard solution and a handheld meter that can read the standard; compare the reading to the known value to confirm the probe is still performing correctly.

<sub>Context supplied: 24 chunk(s) from 9 document(s) — EC_K_1.0_probe.pdf, IORP_probe.pdf, Industrial-DO-probe.pdf, IpH_probe.pdf, https://pubs.usgs.gov/tm/09/a6.3/tm9-a6_3.pdf, https://pubs.usgs.gov/tm/09/a6.8/tm9a6.8.pdf, https://pubs.usgs.gov/tm/09/a6.0/tm9a6.0.pdf, https://pubs.usgs.gov/tm/09/a6.1/tm9a6.1.pdf, https://19january2017snapshot.epa.gov/sites/production/files/2015-06/documents/EQASOP-FieldCalibrat.pdf. Full text: `context/probecal-ec-never-recalibrate/turn2-A.txt`</sub>

### Answer B

To verify the probe you should bring a **known conductivity standard** (a KCl solution) that is close to the conductivity you expect in the field. USGS guidance recommends using standards that “bracket the expected specific conductance of the samples” and that “should be greater than 200 µS/cm”【5†"recommended to calibrate specific conductance with standards with values that are greater than 200 µS/cm."】.  

For water that is about **700 µS/cm**, a convenient choice is a standard near that value—e.g., a **500 µS/cm** standard (which is lower) or a **1,413 µS/cm** standard (which is higher). Using both would bracket the 700 µS/cm reading, allowing you to confirm the probe’s accuracy. When you measure the standard, the result should be within **±3 percent** of the certified value for measurements >100 µS/cm【3†"Measurements of specific conductance standards that are within … ±3 percent of the certified values for measurements >100 µS/cm are considered accurate."】.  

So, carry at least one certified KCl conductivity standard (e.g., 500 µS/cm or 1,413 µS/cm) and check the probe against it before or after a deployment. If the measured value falls within the ±3 % tolerance, no recalibration is needed.

<sub>Context supplied: 8 chunk(s) from 2 document(s) — EC_K_1.0_probe.pdf, https://pubs.usgs.gov/tm/09/a6.3/tm9-a6_3.pdf. Full text: `context/probecal-ec-never-recalibrate/turn2-B.txt`</sub>

