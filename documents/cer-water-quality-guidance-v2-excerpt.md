# Clean Earth Rovers Water Quality Guidance v2.0 - Excerpt: Natural Cycles, Event Signatures, Sensor Faults, Parameter Coupling

Source: "DataPod Water Quality Source of Truth", version 2.0, last updated 2026-09-16, owner Clean
Earth Rovers, Inc. (CER). This is CER's own synthesis for interpreting DataPod data, not an external
standard. This excerpt reproduces Sections 5, 6, 7.1-7.2 and 11 in the document's own words; tables are
written one row per line. Omitted: rule 1 of Section 7.2 (identical timestamps across channels),
pending CER review. Sections referenced below but not included here: 2.4.1, 8, 9 and 10.

## 5. Natural Cycles and Look-Alike Events

Rule these out before declaring a pollution event.

### 5.1 Diel (24-Hour) Cycle

- Pattern: DO and pH rise through daylight, peak in mid to late afternoon, and fall overnight to a
  minimum just before dawn. Temperature follows solar heating. ORP shows a weaker version of the
  same pattern, partly because of temperature.
- Diagnostic: DO and pH move in phase, repeat each day, and change smoothly.
- Danger window: The pre-dawn DO minimum. Low-oxygen events and fish kills most often occur
  between about 03:00 and 07:00 local time.
- Caution: Solar-powered DataPods are also most likely to experience low battery voltage in the
  pre-dawn hours. Check battery voltage before interpreting a pre-dawn anomaly (Section 7).

### 5.2 Tidal Cycle

- Pattern: Southern California has mixed semidiurnal tides, with two unequal high tides and two
  unequal low tides per day (the main lunar period is about 12.42 hours). Salinity, temperature, and
  turbidity oscillate with tidal exchange. Turbidity often peaks near maximum current.
- Diagnostic: The change repeats on the tidal clock, not the solar clock, and shifts by about 50
  minutes per day.
- Method: Compare readings to the same tidal phase in the baseline, or remove tidal signal with
  harmonic analysis.
- Sensor exposure: Shallow DataPods may be exposed or nearly exposed at extreme low tides,
  creating fault signatures (Section 7).

### 5.3 Coastal Upwelling (Major False Positive)

- Cause: Winds push surface water offshore, bringing cold, low-oxygen, high-CO₂ deep water to the
  surface. In Southern California, upwelling is strongest in spring (roughly March through June) but
  can occur at other times.
- Signature: Temperature strongly down (2 to 6 °C over one to three days), DO down, pH down,
  salinity slightly up (about 0.1 to 0.3 PSU), ORP slightly down, turbidity little change.
- Why it matters: DO and pH fall together, which resembles organic pollution.
- Diagnostic: Temperature falls with DO and pH. Pollution does not cool the water. Salinity rises
  slightly instead of falling. The pattern often affects several nearby sites at once.

### 5.4 Internal Tides and Bores (Major False Positive)

- Cause: Internal waves carry cold, deeper water shoreward along the density interface.
- Signature: Temperature drops 1 to 5 °C within minutes to an hour, with DO and pH dropping at the
  same time, then recovery. Often recurs roughly twice daily during stratified conditions, most
  common in summer.
- Diagnostic: Sharp cold pulses, synchronized DO and pH drops, rapid recovery, and recurrence.

### 5.5 Seasonal Cycle

- Pattern: Temperature, stratification, rainfall, runoff, upwelling, and bloom risk shift through
  the year. The Southern California rainy season is roughly November through April.
- Method: Compare readings against the same month or season in the site baseline.

### 5.6 Marine Heatwaves

- Definition (literature, Hobday et al. 2016): Water temperature above the 90th percentile of the
  local seasonal climatology for at least 5 consecutive days.
- CER default without a long climatology: Temperature more than 2 °C above the same-week site
  baseline for at least 5 days.
- Consequences: Lower DO in mg/L, higher bloom risk, and higher chance of low pre-dawn DO. A
  heatwave is an environmental condition, not a discharge, but it raises the risk of hypoxia.

### 5.7 Rain Without Pollution

Rain falling directly on a water body lowers surface salinity and may slightly lower pH and
temperature without a turbidity spike. Stormwater runoff differs by bringing a turbidity spike and a
larger salinity drop near drains and outfalls.

### 5.8 The Test for a Real Event

A candidate pollution event should meet all of these conditions:

1. Passes the data quality checks in Sections 7 and 8.
2. Is a step change or sustained excursion that breaks the expected diel, tidal, and seasonal
   pattern.
3. Is not explained by upwelling, internal tides, heatwave, or direct rainfall.
4. Shows a correlated shift in two or more parameters consistent with a signature in Section 6.

## 6. Event Signature Library

### 6.1 Direction Vocabulary

- Strong increase / strong decrease: Large change relative to site variability (CER default:
  robust z-score magnitude above 5).
- Increase / decrease: Moderate change (CER default: robust z-score magnitude 3 to 5).
- Slight increase / slight decrease: Small but consistent change.
- Variable: Direction depends on the source or conditions.
- Little change: Within normal variability.

### 6.2 Summary Matrix (Marine Receiving Water)

Each row gives the event, then Temperature; DO; ORP; Salinity / SC; pH; Turbidity; Key
discriminator.

- Raw sewage spill: Temperature variable, often slight increase; DO decrease, delayed; ORP
  decrease; Salinity / SC decrease; pH slight decrease; Turbidity increase. Key discriminator:
  freshening plus turbidity plus oxygen demand, not tied to rain or daylight.
- Treated effluent (chlorinated): Temperature slight increase; DO little change or slight decrease;
  ORP increase; Salinity / SC decrease; pH little change or slight decrease; Turbidity little
  change. Key discriminator: freshening with rising ORP.
- Stormwater runoff: Temperature variable; DO variable, often decrease; ORP slight decrease;
  Salinity / SC strong decrease near outfalls; pH decrease; Turbidity strong increase. Key
  discriminator: coincides with rainfall; turbidity spike.
- Dry-weather urban runoff: Temperature variable; DO little change; ORP little change; Salinity /
  SC slight decrease; pH slight decrease; Turbidity slight increase. Key discriminator: no rain;
  near drains; may follow irrigation timing.
- Algal bloom (active): Temperature often increase; DO large daily swings, above 120 % sat
  afternoon, low pre-dawn; ORP variable; Salinity / SC little change; pH large daily swings in phase
  with DO; Turbidity increase. Key discriminator: in-phase DO and pH oscillation.
- Bloom collapse or die-off: Temperature variable; DO strong decrease, day and night; ORP strong
  decrease; Salinity / SC little change; pH decrease; Turbidity variable. Key discriminator: oxygen
  crash without freshening; follows a bloom.
- Upwelling (natural): Temperature strong decrease; DO decrease; ORP slight decrease; Salinity / SC
  slight increase; pH decrease; Turbidity little change. Key discriminator: water cools.
- Internal tide or bore (natural): Temperature sharp decrease, pulsed; DO decrease, pulsed; ORP
  slight decrease; Salinity / SC slight increase or little change; pH decrease, pulsed; Turbidity
  little change. Key discriminator: rapid cold pulses with recovery.
- Thermal discharge: Temperature strong increase; DO decrease in mg/L, % sat roughly unchanged; ORP
  little change; Salinity / SC little change; pH little change; Turbidity little change. Key
  discriminator: warming only, other chemistry flat.
- Marine heatwave (natural): Temperature sustained increase; DO decrease in mg/L; ORP little
  change; Salinity / SC little change or slight increase; pH little change; Turbidity variable. Key
  discriminator: regional, lasts days to weeks.
- Industrial or chemical discharge: Temperature variable; DO variable; ORP variable, can be strong;
  Salinity / SC variable, often decrease; pH variable, can be strong; Turbidity variable. Key
  discriminator: abrupt step change with no natural explanation.
- Alkaline input (concrete washwater): Temperature little change; DO little change; ORP decrease;
  Salinity / SC slight increase near source; pH strong increase; Turbidity increase. Key
  discriminator: pH rise with turbidity near construction.
- Dredging or construction resuspension: Temperature little change; DO slight decrease; ORP slight
  decrease; Salinity / SC little change; pH slight decrease; Turbidity strong increase. Key
  discriminator: turbidity during working hours, often weekdays.
- Hypoxia or fish-kill conditions: Temperature often increase; DO near zero; ORP strong decrease,
  negative; Salinity / SC little change; pH decrease; Turbidity variable. Key discriminator: DO and
  ORP bottoming out together.
- Oil or fuel spill: Temperature little change; DO little change; ORP little change; Salinity / SC
  little change; pH little change; Turbidity little change or slight increase. Key discriminator:
  largely undetectable with DataPod sensors (Section 10).

### 6.3 Freshwater Receiving Water Differences

In freshwater, several directions reverse or change:

- Raw sewage: Conductivity increases instead of decreasing.
- Stormwater runoff: Conductivity may decrease (dilution by rain) or increase (road salt, first
  flush of dissolved pollutants).
- Industrial discharge: Conductivity usually increases strongly.
- Saltwater intrusion: Conductivity strong increase, tied to tide, drought, or low river flow; pH
  little change or slight increase; other parameters little change.
- Acidic input (acid mine drainage, acid spill): pH strong decrease, conductivity increase, ORP
  increase, turbidity increase; unlikely to be detectable in seawater unless near source.
- Algal bloom: pH swings much larger (afternoon above 9 is common) because freshwater is weakly
  buffered.

### 6.4 Detailed Signatures

#### Raw Sewage Spill (Marine)

- Timing: Unrelated to daylight or tide. Often follows pump station failures, line breaks, or heavy
  rain overwhelming a system.
- Leading indicators: Salinity decrease and turbidity increase appear first. DO and ORP decline
  over the following hours as oxygen demand is exerted, most clearly where flushing is poor.
- Magnitude check: Estimate the freshwater fraction with Section 2.4.1. Raw sewage carries roughly
  200 to 300 mg/L of BOD. A 1 percent sewage mix carries roughly 2 to 3 mg/L of oxygen demand,
  exerted over days.
- Confounders: Stormwater (same freshening and turbidity, but coincides with rain), dry-weather
  runoff, treated effluent (ORP rises instead).
- Confirmation: Grab samples for fecal indicator bacteria (Enterococcus), notify the relevant
  agency per site protocol.

#### Stormwater Runoff (Marine)

- Timing: Within hours of rainfall onset. The first significant storm after the dry season (first
  flush) carries the highest pollutant load.
- Signature: Strong turbidity increase and salinity decrease near outfalls, pH decrease, DO
  variable.
- Contamination note: Southern California stormwater routinely carries bacteria, metals, and
  hydrocarbons. Treat a stormwater signature as a likely contamination event even though DataPods
  cannot measure those contaminants.

#### Active Algal Bloom

- Signature: DO above 120 percent saturation in afternoon, low pre-dawn DO, pH moving in phase with
  DO, turbidity elevated, usually during warm, calm, stratified conditions.
- Southern California context: Dinoflagellate blooms (red tides) can become dense enough to drive
  low oxygen and fish kills when respiration and decomposition exceed photosynthesis.
- Risk indicator: Watch the pre-dawn minimum trend. Falling pre-dawn minimums over several nights
  indicate rising hypoxia risk.
- Limitation: Toxin-producing blooms may not produce a DO signature (Section 10).

#### Bloom Collapse

- Signature: DO drops and stays low through daylight, ORP falls, pH falls, and salinity does not
  change.
- Why it matters: This resembles sewage. The discriminator is stable salinity plus a preceding
  bloom period.

#### Thermal Discharge

- Signature: Temperature rises with proportional DO decline in mg/L, while percent saturation stays
  roughly constant. Specific conductance and salinity stay flat. Raw uncorrected conductivity will
  rise, which is why corrected values must be used.

#### Industrial or Chemical Discharge

- Signature: Abrupt step changes in conductivity, pH, or ORP with no diel, tidal, or rainfall
  explanation. Directions depend on the effluent.
- Discriminator from sensor faults: A real discharge usually affects more than one parameter in a
  chemically consistent way and changes gradually as a plume arrives. A fault often affects one
  channel, or all channels at the identical timestamp.

#### Dredging or Construction

- Signature: Strong turbidity increase with slight decreases in DO, ORP, and pH from resuspended
  reduced sediment.
- Timing cue: Occurs during working hours and on working days and stops at night and weekends.

#### Hypoxia or Fish-Kill Conditions

- Signature: DO near zero, ORP negative versus Ag/AgCl, pH decreasing. Often warm, calm, stratified
  conditions following a bloom or large organic load.
- Urgent response: Treat as high priority regardless of cause. First verify the DO sensor is not
  faulted (galvanic flow dependence and electrolyte depletion can mimic hypoxia).

## 7. Sensor Fault Signatures (Check First)

### 7.1 Fault Matrix

Each row gives the fault, then the channels affected; signature; key discriminator.

- Sensor exposed (out of water): Channels affected: all. Signature: specific conductance drops to
  near zero or becomes erratic; temperature tracks air with a larger daily range; DO jumps to about
  100 % sat air reading or becomes erratic; pH and ORP drift or become noisy. Key discriminator:
  coincides with extreme low tide or wave troughs.
- Galvanic DO electrolyte or anode depletion: Channels affected: DO. Signature: DO flatlines or
  declines slowly; stops responding to temperature and daylight; may stick at a low value (for
  example 1.5 to 2 mg/L). Key discriminator: DO no longer moves with pH on the daily cycle; DO moves
  opposite to what temperature predicts.
- Galvanic DO flow dependence: Channels affected: DO. Signature: DO reads low in still water and
  recovers with current or waves. Key discriminator: low DO coincides with slack tide or calm night
  conditions; readings rise when a probe is stirred or flow increases.
- DO membrane fouling: Channels affected: DO. Signature: gradual DO decline over weeks, or damped
  daily range. Key discriminator: resets after cleaning; follows maintenance interval.
- Biofilm photosynthesis on DO sensor: Channels affected: DO. Signature: unrealistically high midday
  DO. Key discriminator: extreme afternoon peak not matched by pH.
- pH electrode aging (reduced slope): Channels affected: pH. Signature: compressed daily pH range;
  slow drift. Key discriminator: daily DO range unchanged while pH range shrinks; calibration slope
  below about 90 percent of theoretical.
- pH reference junction clogging: Channels affected: pH. Signature: slow response, offset, noisy
  readings. Key discriminator: offset changes after cleaning; response time increases.
- ORP platinum fouling or sulfide poisoning: Channels affected: ORP. Signature: sluggish or stuck
  ORP. Key discriminator: fails to recover when DO recovers; resets after cleaning.
- Conductivity cell fouling: Channels affected: conductivity. Signature: gradual false decrease in
  conductivity and salinity. Key discriminator: slow freshening trend over weeks without rain;
  resets after cleaning.
- Turbidity window fouling or wiper failure: Channels affected: turbidity. Signature: steadily
  rising baseline. Key discriminator: rise does not match other parameters; resets after cleaning.
- Bubbles, fish, debris: Channels affected: turbidity (also conductivity). Signature: single-sample
  spikes. Key discriminator: spike lasts one to a few samples; fails spike test.
- Temperature sensor fault: Channels affected: temperature plus all corrected values. Signature:
  temperature error propagates into salinity, DO saturation, pH compensation, and ORP residual. Key
  discriminator: several derived values shift together at the same moment.
- Low battery or power brownout: Channels affected: multiple. Signature: simultaneous step change,
  noise, or dropouts across several channels. Key discriminator: coincides with falling battery
  voltage, often pre-dawn on solar systems or after cloudy days.
- Clock or timestamp drift: Channels affected: all. Signature: daily cycles appear shifted in time.
  Key discriminator: afternoon DO peak appears at unusual hours; compare to sunrise and sunset.
- Stuck or repeated values: Channels affected: any. Signature: identical values for many
  consecutive samples. Key discriminator: fails flat-line test.
- Post-maintenance step: Channels affected: serviced channels. Signature: abrupt offset at a
  maintenance timestamp. Key discriminator: matches maintenance log.

### 7.2 Fault-Versus-Event Rules

Rule 1 is omitted from this excerpt; the numbering below is the document's own.

2. One channel moving alone suggests a fault. Real events almost always affect at least two
   parameters.
3. Broken couplings suggest a fault. For example, if pH keeps its daily cycle but DO stops cycling,
   suspect the DO sensor.
4. Check battery voltage for any pre-dawn anomaly.
5. Check the maintenance log for any step change.
6. Check tide height for any sudden conductivity collapse.
7. Gradual multi-week drift is a fouling or calibration issue first and an environmental signal
   second.
8. Neighbor comparison: If a nearby DataPod does not show the change and the plume could not
   plausibly be local, suspect a fault.

## 11. Parameter Coupling Reference

Each row gives the coupling, then the relationship; diagnostic use.

- Temperature and DO: Inverse: warmer water holds less oxygen and consumes it faster. Diagnostic
  use: Expect mg/L DO to fall as temperature rises. If DO falls with falling temperature, suspect
  upwelling or an internal tide.
- Temperature and conductivity: Raw conductivity rises about 2 percent per °C. Diagnostic use:
  Always use specific conductance or salinity.
- Temperature and ORP: ORP electrode response varies with temperature. Diagnostic use: Use
  temperature-residual ORP.
- DO and ORP: Weak coupling while oxygen is present; strong once DO nears zero. Diagnostic use: ORP
  explains conditions below the DO floor.
- DO and pH: In phase on the daily cycle through photosynthesis and respiration. Diagnostic use:
  In-phase swings indicate biology. Loss of this coupling suggests a sensor fault or a strong
  external input.
- Turbidity and DO/pH: Particles block light and add oxygen demand. Diagnostic use: High turbidity
  damps daytime DO and pH rise.
- Turbidity and contaminants: Particles carry nutrients, metals, hydrocarbons, bacteria. Diagnostic
  use: Turbidity spike is a loading proxy.
- Salinity and everything else: Salinity changes only through mixing. Diagnostic use: Use salinity
  to separate dilution from chemical or biological change.
