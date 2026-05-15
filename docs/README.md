# Document corpus

The PDFs/markdown files that live in this directory are excluded from git (see `.gitignore`). They are public EPA/USGS resources; download them manually before running `seed.py`. The authoritative list of expected files, with download URLs and use cases, is in the project root's `README.md` §5.

Quick checklist of expected filenames (must match exactly so `seed.DOC_META` resolves):

- `rwqc2012.pdf`
- `ambient-wqc-dissolved-oxygen-1986.pdf` — scanned PDF; OCR is automatic on ingest
- `aquatic-life-criteria-table.md`
- `volunteer_stream_monitoring_a_methods_manual.pdf`
- `tm9a6.2.pdf`
- `tm9a6.8.pdf`
- `Dissolved Oxygen and Water _ U.S. Geological Survey.pdf`
- `nutrient-lakes-reservoirs-factsheet-final.pdf`
- `nutrient-lakes-reservoirs-report-final.pdf`
- Sensor manufacturer datasheet(s) — still TODO per `README.md` §16 #7

After dropping these in, run `python -m backend.seed` from the project root with the venv active.
