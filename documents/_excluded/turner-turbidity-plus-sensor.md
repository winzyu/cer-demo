# Turner Designs Turbidity Plus Submersible Sensor — Vendor Documentation

Sources, all retrieved 2026-09-17:

- Product page, "Turbidity Plus Submersible Sensor", https://www.turnerdesigns.com/turbidity-plus-submersible-sensor
- Product datasheet, https://www.turnerdesigns.com/_files/ugd/9a5dca_6d195f5834d74ab3b52623350504c0ac.pdf
- User's Manual, P/N 998-2187, Revision J, December 10, 2020, https://docs.turnerdesigns.com/t2/doc/manuals/998-2187.pdf

This file reproduces the vendor's own description, specifications and procedures. Quoted text is the
vendor's; the section headings and the closing list of unstated properties describe this document.

## Description

"Turbidity Plus is an accurate single-channel turbidity sensor with an integrated, user-controlled
wiper motor. It is designed for integration with multiparameter systems and dataloggers from which
it receives power and wiper motor triggers at user-defined intervals. Turbidity Plus is available in
two linear ranges up to 500 or 3,000 NTU with minimum detection limits of 0.05 or 0.5 NTU
respectively. It delivers a voltage response proportional to the turbidity of the sample which can
be correlated to nephelometric turbidity unit (NTU) concentrations by calibrating the sensor using
AMCO Clear Turbidity Standards. Deployable to 200 meters, Turbidity Plus is available in a variety
of configurations to facilitate integration." (998-2187 Rev. J §1.1)

## Optical configuration

From the specification table (998-2187 Rev. J, Attachment A):

- Light Source: Light Emitting Diode
- Excitation Wavelength: IR
- Detector: Photodiode

The vendor states the excitation wavelength as "IR" (infrared) without a numeric value in
nanometres, and reports the sensor's output in NTU. "Sampling focal point is in front of the sensor
face."

## Performance specifications

For the two available ranges, verbatim from the specification table:

- MDL: 0.5 NTU (3,000 NTU model); 0.05 NTU (500 NTU model)
- Range: 0-3000 NTU; 0-500 NTU
- Precision, 3,000 NTU model: 0 - 10 (± 0.1 NTU); 10 - 1000 (± 0.4 NTU); > 1000 (± 0.04% of NTU
  Concentration)
- Precision, 500 NTU model: 0-50 NTU (± 0.05 NTU); 50-500 NTU (± 0.25 NTU)
- Linearity (full range): 0.99 R2
- Settling time from power on: T99 = < 3 seconds

The vendor qualifies accuracy and resolution: "Accuracy is determined by the user's correlation
between the 0-5 V output and the 0-3000 NTU range. Resolution is determined by the datalogger.
Turbidity Plus are not factory calibrated."

## Electrical and physical specifications

- Input Voltage: 3 - 15 VDC
- Signal Output: Single gain, 0 - 5 VDC Analog
- Power Draw: "@ 12V: Max 140mW (180mW for 500NTU) signal only"; "@ 12V: Typical 230mW (280mW for
  500NTU) while wiper rotates. Power draw increases if there is resistance to the wiper."
- Wiper Trigger: "Pulse to zero (ground) for wiper rotation"; Minimum Pulse Width for Wiper Trigger:
  50 milliseconds
- Temperature Range: "Ambient: 0 to 50 C"; "Water Temp: -2 to +50 C"
- Housing Material: Delrin
- Dimensions: "L - Housing only: 4.35 in., 11.05 cm"; "L - Housing with connector and wiper: 6.10
  in., 15.49 cm"; "D: 1.185 in., 3.01 cm"
- Weight with Connector and Wiper: 4.9 oz; 138 gm
- Depth Rating: 200 meters
- "No data averaging - analog signal output"

## Calibration

The vendor's direct-concentration calibration procedure (998-2187 Rev. J §3.1) converts raw voltage
to NTU through a correlation factor derived from a blank and one standard:

"Calibrating Turbidity Plus is a simple process that requires calibration standards to create a
correlation factor which is used to convert raw voltage data to NTU concentrations."

Steps, condensed from the vendor's numbered procedure: connect the sensor to a power source and
multimeter; measure the voltage of a blank in a darkened beaker (the vendor recommends ultra-pure or
deionized water); replace the blank with a standard of known concentration and measure its voltage;
then apply the vendor's equations:

"[(CStd)/(VoltsStd - VoltsBlank)] = Correlation Factor" where "CStd = Concentration value of standard
used for calibration", "VoltsStd = Voltage reading from standard concentration" and "VoltsBlank =
Voltage reading from blank".

"CSample = (Correlation Factor) * (VoltsSample - VoltsBlank)" where "Csample = Concentration of
sample".

Recommended standards are AMCO Clear Turbidity Standards, available from GFS Chemicals under part
numbers 8506 (10 NTU), 8507 (100 NTU), 8620 (1000 NTU) and 8621 (3000 NTU). The vendor describes
them as "non-toxic safe solutions consisting mainly of deionized water that come prepared in a broad
range of concentrations and have a shelf life guaranteed for one year."

Two vendor notes qualify the procedure:

"Note: Calibration of Turbidity Plus is not required, but recommended."

"Note: There is no Temperature Compensation built into Turbidity Plus. The average percentage change
of blank adjusted voltage is -0.45% mv/degree C of signal."

On cleanliness: "Note: To make accurate and repeatable measurements it is important to keep the
sensor clean". The integrated wiper is the vendor's mechanism for this, triggered by the host
datalogger at user-defined intervals.

## Properties this vendor documentation does not state

The product page, datasheet and user manual do not state any of the following, and no value for them
can be cited from these sources:

- A numeric wavelength for the infrared source. The specification table gives only "IR".
- The angle at which scattered light is detected. The vendor uses the term "nephelometric turbidity
  unit (NTU)" for the output unit but does not state a 90-degree, or any other, detection geometry.
- Compliance with, or design against, ISO 7027 or EPA Method 180.1. Neither standard is named, and
  the unit FNU does not appear in these documents.
- A factory calibration. The vendor states the sensors are not factory calibrated, so the
  voltage-to-NTU relationship is whatever the user's own correlation establishes.
