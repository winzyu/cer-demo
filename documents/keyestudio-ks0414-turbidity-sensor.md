# Keyestudio KS0414 Turbidity Sensor V1.0 — Vendor Documentation

Source: Keyestudio Wiki, "KS0414 Keyestudio Turbidity Sensor V1.0",
https://wiki.keyestudio.com/KS0414_Keyestudio_Turbidity_Sensor_V1.0 (retrieved 2026-09-17).
This file reproduces the vendor's own description, specification and notices. Quoted text is the
vendor's; the section headings and the closing list of unstated properties describe this document.

## Description

The vendor describes the sensor as follows:

"The keyestudio turbidity sensor detects water quality by measuring level of turbidity. The
principle is to convert the current signal itself into the voltage output through the circuit. Its
detection range is 0%-3.5% (0-4550NTU), with an error range of ±05%F*S. When using, measure the
voltage value of sensor's Signal end; then work out the water's turbidity by simple calculation
formula."

"This turbidity sensor have both analog and digital signal output modes. The module has a slide
switch. When slide the switch to A end, connect the signal end to analog port, can read the analog
value to calculate the output voltage so as to get the turbidity degree of water. If slide to D
end, connect signal end to digital port, can detect the water whether is turbidity by outputting
HIGH or LOW level."

"You can turn the blue potentiometer on the sensor to adjust the sensitivity of sensor."

"Turbidity sensors can be used in measurement of water quality in rivers and streams, wastewater
and effluent measurements, sediment transport research and laboratory measurements."

## Specification

The vendor's specification list, verbatim:

- Operating Voltage: DC 5V
- Operating Current: about 11mA
- Detection Range: 0%--3.5% (0-4550NTU)
- Operating Temperature: -30°C~80°C
- Storage Temperature: -10°C~80°C
- Error Range: ±0.5%F*S
- Weight: 18g

## Output behaviour and unit conversion

Under the heading "Electrical Characteristic Curve", the vendor states:

"The corresponding table of output voltage and concentration shows that the higher the turbidity
value is, the lower the output voltage is."

That is, the sensor's voltage response is inverse: voltage falls as turbidity rises.

On converting the vendor's percentage scale to turbidity units, the vendor states:

"In the chart, many customers do not know how to convert the percent (%) to turbidity units (NTU).
The following conversion formula is obtained after verification: 10-6 (PPM)=1ppm=1mg/L=0.13NTU
(empirical formula) that is: 3.5%=35000ppm=35000mg/L=4550NTU"

The vendor labels this an empirical formula. It converts a suspended-solids mass concentration
(ppm, equivalently mg/L) to NTU at a fixed ratio of 0.13 NTU per mg/L. It is not a calibration
against turbidity standards, and the vendor publishes no equation relating output voltage to NTU;
the voltage-to-turbidity relationship appears on the page only as an unlabelled characteristic
curve.

## Vendor notices

"Note: the top of probe is not water-proof; can only place the transparent bottom part into water."

"Special Notice: 1) The top of probe is not water-proof; can only place the transparent part into
water. 2) Pay more attention to the power polarity when wiring. Avoid burning out the sensor due to
reversed connection. The voltage can only be DC5V; pay close attention to the voltage to prevent
overvoltage from burning the sensor."

## Properties this vendor documentation does not state

The Keyestudio wiki page for this sensor does not state any of the following, and no value for them
can be cited from this source:

- The light source type or its wavelength. Nothing on the page identifies the sensor as a white-light
  (visible) or an infrared instrument.
- The angle at which scattered light is detected, so the page does not establish whether the
  measurement is nephelometric (90-degree) or a transmission measurement.
- Compliance with, or design against, any turbidity measurement standard. Neither ISO 7027 nor EPA
  Method 180.1 is mentioned, and neither the unit FNU nor the term "formazin" appears.
- A calibration procedure, calibration standards, or a factory calibration claim.
- An equation converting the sensor's output voltage to NTU.
- Response time, settling time, linearity, minimum detection limit, resolution, temperature
  compensation, dimensions, connector pinout, or depth rating.
