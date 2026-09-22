# Secondary checks and limitations

The coordinator checked the following findings directly against mechanically extracted source passages after the worker reviews.
These checks concentrate on materially wrong requirements, numerical scope, and contradictory evidence.
The primary reports for batches 5 and 9 were completed by the coordinator after worker usage failures and are not presented as independently double-reviewed.

| Finding or sample | Evidence checked | Result |
|---|---|---|
| Settling versus flocculation | Turbidity A6.7:998-1000 and 1190-1196 | Confirmed: ordinary settling/resuspension is allowed; a settled layer alone does not prove flocculation. |
| Logging versus reporting | Multiparameter A6.8:901-919 | Confirmed: reporting increments coexist with retention of extra digits in NWIS. |
| White-light unit names | Turbidity A6.7:418-427 | Confirmed: BU/AU contradict the universal N-prefix requirement; calibration-standard equivalence does not imply environmental interchangeability. |
| Low-conductance pH check | Multiparameter A6.8:1059-1061 and pH A6.4:1363-1372 | Confirmed: the example-form criteria and final-buffer 0.05 check are real, distinct instructions. |
| Alternate pH slope upper bound | Multiparameter A6.8:1061 and pH A6.4:1359-1361 | Confirmed: 95-102 and 95-101 coexist; the rubric must select or accommodate the intended standard. |
| Brackish correction input | DO A6.2:11804-11825 and 12453-12484 | Confirmed: 0.8235 corresponds to 20 °C and 50,000 µS/cm referenced to 25 °C, not arbitrary raw conductivity. |
| Surface-water versus groundwater subsamples | FIELD A6.0:959-980 and 1583-1604 | Confirmed: the qualifier rule used in the creek fixture belongs to groundwater; surface-water turbidity subsamples are expressly permitted with conditions. |
| High-turbidity stabilization branch | Multiparameter A6.8:714-722 | Confirmed: >100 TU uses 10%, while ≤100 uses 0.5 TU or 5%, whichever is greater. |
| DO-last exception | DO A6.2:621-631 | Confirmed: two-point optical DO calibration follows other sensors because of sodium-sulfite interference. |
| Temperature verification choices | Temperature A6.1:700-727 | Confirmed: 6/10 °C is an example satisfying the rules, and quarterly checks are explicitly allowed. |
| EPA correction/qualification | EPA:151-168 and 583-612 | Confirmed: midday qualification is conditioned on recalibration; per-location calibration has a post-check exception; drift is explicitly evaluated against project/default criteria. |
| Precedence policy versus facts | System prompt:199-208; pH A6.4:337-347; turbidity A6.7:1732-1738; DO A6.2:1088-1099 | Confirmed: the prompt itself conflates unavailable and unconfigured limits; source descriptions do not identify pod settings. |
| DO table comparison | EPA chart headers/20 °C row:762-785; DO table values cited in batch 8; DO A6.2:1088-1099 | EPA 9.06 was directly checked; significance must stay tied to the cited procedure, and the worker's USGS-cell verification is retained as primary evidence. |
| KEEP sample: air DO calibration | EPA:334-398 | Confirmed humid-air procedure, instrument-accuracy qualification, zero-solution check and project/instrument adjustment. |
| KEEP sample: bottle mixing/storage | Turbidity A6.7:1429-1439 and 1510-1516 | Confirmed 25 inversions/one-second cycle, rapid transfer, amber/no sunlight, ≤4 °C and maximum 24-hour storage. |
| KEEP sample: buffer handling | pH A6.4:732-735 and 1240-1256 | Confirmed decant/discard, metadata and refreshing dedicated bottles each field trip. |
| KEEP sample: conductivity cleaning | SC A6.3:543-551 | Confirmed 5% v/v HCl, up to two hours, DIW rinse and manufacturer/material qualifications. |

Additional direct checks underlying batches 5 and 9 establish the minimum 90-day ZoBell stability wording, the particular reference-electrode pair for 44±5 mV, qualified subsample reporting, actual continuous-monitor procedures, and the explicit NTU application label.
The reviewer did not inspect every source PDF image independently of extraction.
The EPA text has imperfect OCR symbols, so the reports preserve uncertainty and do not claim to have revalidated every glyph against the PDF.
The restored corpus and fixture hashes are pinned in the manifest, so these findings do not silently transfer to future re-ingestion or revised fixtures.

No independent second agent report was available for the last two batches after the usage limit.
The condition-coverage checker verifies identifiers and input integrity, not the correctness of an agent's judgment.
Human verification and judge calibration remain separate unfinished activities.
