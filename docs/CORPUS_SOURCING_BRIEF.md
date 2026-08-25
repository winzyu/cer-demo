# Corpus sourcing brief

**Purpose:** a self-contained briefing for a research session that has no other context about this
project. Paste it whole. It describes what the product is, exactly what it measures, what its
assistant must and must not answer, what the document corpus is for, what is still missing, and —
importantly — what *not* to bring back.

Written 2026-08-21. Facts here are verified against the running system, not summarized from memory;
where a number was measured, the measurement is named.

---

## 1. What the product is

**Clean Earth Rovers** sells the **DataPod™**, a solar-powered smart buoy for continuous surface
water-quality monitoring. Customers are water managers: marinas, harbors, ports, municipalities,
estuarine research reserves.

**This project is a rebuild of "Gilligan,"** the AI assistant bundled with the DataPod's dashboard.
It answers water-quality questions grounded in exactly two sources:

1. **Live sensor readings** from a customer's own pods, fetched through a backend tool call.
2. **A corpus of authoritative water-quality documents** — retrieved and injected as context.

It is a retrieval-grounded assistant, not a general chatbot. It is explicitly forbidden from
answering out of prior knowledge. **The corpus is the only thing standing between a user's question
and a refusal**, which is why sourcing it well is the whole job of this brief.

A later phase generates a six-section water-quality **report**, on a strict compute-then-narrate
rule: every number is computed deterministically in code, and the language model only narrates
pre-computed facts.

---

## 2. What the hardware actually measures

**Six parameters. Nothing else.** This is the single most important constraint on sourcing.

| parameter | unit | notes |
|---|---|---|
| Dissolved oxygen | mg/L | |
| ORP (oxidation-reduction potential) | mV | **0 is a valid reading — never treat 0 as an error** |
| pH | *(unitless)* | |
| Conductivity | µS/cm | |
| Temperature | °F normalized | |
| Turbidity | **NTU** | **0 is valid.** Derived from a raw voltage by a *provisional, uncalibrated* conversion |

**Operating characteristics** (vendor FAQ + Atlas Scientific, sampling interval independently
verified against recorded production data — median gap 1801 s over 47 readings):

- **Sampling: every 30 minutes** ⇒ 48 readings/day, 336/week, ~1,440/month.
- **Calibration: once every 3–6 months.**
- **Deployment: 9 of 12 months per year** (year-round in tropical climates), **depths under 50 ft**.
- **Fresh *and* salt water** — both are live deployments, and their normal ranges differ.
- Solar, 3.5 V, 2 ft × 1 ft, 10 lb.

**Probes:** four Atlas Scientific units — conductivity (K 1.0), industrial ORP, industrial pH,
industrial dissolved oxygen. Temperature comes with the Atlas suite. **Turbidity is not an Atlas
part** — it is a bolt-on from an unidentified vendor, which is why its behavior is the least
documented thing on the pod.

**Operator-authoritative normal ranges** (these outrank any document — see §3):

| parameter | freshwater | saltwater |
|---|---|---|
| pH | 6.5 – 8.5 | 6.5 – 8.5 |
| ORP | 200 – 400 mV | 200 – 400 mV |
| Dissolved oxygen | 5 – 14 mg/L | 5 – 14 mg/L |
| Temperature | 32 – 95 °F | 32 – 95 °F |
| Conductivity | 0 – 1,500 µS/cm | 40,000 – 50,000 µS/cm |
| Turbidity | 0 – 25 NTU | 0 – 10 NTU |

---

## 3. What the assistant must do, and must refuse

**Must answer:**

- *Definitional* — what a parameter is, what it indicates.
- *Threshold* — at what value something is a concern.
- *Precedence* — when a document disagrees with the operator ranges above, **the operator range
  wins** and the discrepancy is noted.
- *Event signature* — what a combination of movements across parameters suggests (sewage,
  stormwater runoff, saltwater intrusion, hypoxia, algal bloom).
- *Instrument behavior* — calibration intervals, drift, biofouling, "is the probe broken or is the
  water actually doing this?"
- *Sensor readings* — current values, aggregates, trends, first/last readings, per-pod.

**Must refuse, by design:**

- **Pathogens and bacteria** — fecal coliform, E. coli, "is it safe to swim." No such sensor.
- **Nutrients** — nitrate, phosphorus.
- **Metals, pesticides, hydrocarbons, PCBs.**
- Weather and tide forecasts.
- Anything the provided context does not support. It refuses with a fixed sentence rather than
  guessing.

**Never fabricates a zero.** An empty query window must report "no readings" / "silent since
<date>", never `0`, because the upstream API returns zeros for all six metrics on an empty window
and a fabricated zero is an automatic disqualification in evaluation.

> **A live tension worth knowing.** The vendor's public marketing claims more than the hardware
> does — that the turbidity sensor "identifies bacteria and algae presence," and that the system
> gives early warning of "bacterial outbreaks" and harmful algal blooms. Customers read that before
> they open the chat. The assistant must decline these **without contradicting the vendor or
> telling the customer they are wrong**. Documents that help explain *what the six parameters can
> and cannot indicate about a bloom* are therefore valuable; documents *about* blooms as a
> phenomenon are not.

---

## 4. What the corpus is, right now

Documents are parsed once into a single artifact that all retrieval strategies read from, chunked
at 3,200 characters with 400 overlap. **~314K tokens across 18 documents today** — far larger than
any context window, which is the point: retrieval has to choose.

### Tier 1 — company-specific (5 docs, ~9.4K tokens) — do not source, we have these
Operator-written source-of-truth document plus the four Atlas Scientific probe datasheets. These
are fed to the model *whole* on every request in one retrieval mode.

### Tier 2 — USGS National Field Manual, Chapter A6 (9 docs) — the method backbone
One chapter per parameter: 6.0 general guidelines, 6.1 temperature, 6.2 dissolved oxygen,
6.3 specific conductance, 6.4 pH, 6.5 ORP, 6.6 alkalinity, 6.7 turbidity, 6.8 multiparameter
instruments. **All confirmed current editions.**

### Tier 3 — regulatory / calibration (2 docs)
EPA Water Quality Standards Handbook Ch. 3; EPA SOP for calibration of field instruments (2010).

### Tier 4 — situational (2 docs)
EPA floatable debris; NOAA harmful-algal-bloom observing network framework.

### Under review for removal (~124K tokens, 39% of the corpus)
`epa-wqs-handbook-ch3` (regulatory *process*, not thresholds), `epa-assessing-floatable-debris`,
`noaa-nhabon` (governance and funding), `usgs-nfm-a6.6-alkalinity` (titration procedure for a
parameter the pod does not measure). **Do not source replacements in these veins.**

### Already excluded, deliberately
EPA aquatic-life criteria (metals/pesticides), recreational water criteria (pathogens), nutrient
criteria, superseded DO references, and a broad 1997 EPA volunteer stream-monitoring manual
superseded per-parameter by Tier 2.

---

## 5. What to look for — the actual research ask

Ordered by value.

### Priority 1 — the turbidity gap
1. **A datasheet for a non-Atlas-Scientific turbidity probe** suitable for a small solar buoy, that
   states its **light source wavelength**. This is the biggest hole in the corpus. The pod reports
   NTU, but NTU (white light, ~400–680 nm) and FNU (infrared, ~780–900 nm) are **not
   interchangeable**, and nothing on hand describes *this* sensor's optics.
2. **Authoritative treatment of NTU vs FNU vs other turbidity units** — reporting conventions,
   why conversion between them is invalid, ISO 7027 vs EPA Method 180.1 as design bases.
3. **Turbidity from a raw voltage** — calibration of analog turbidity sensors, formazin standards,
   what an uncalibrated voltage-derived NTU can and cannot claim.

### Priority 2 — interpretation, not method
The corpus is strong on *how to measure* and weak on *what a pattern means*. Wanted:
4. **Pollution-event signatures expressed in these six parameters** — what a sewage discharge,
   stormwater surge, or saltwater intrusion does to DO / ORP / pH / conductivity / turbidity, and
   how to tell them apart.
5. **Diel (24-hour) cycles** in DO and pH — photosynthesis/respiration swings, and how to
   distinguish a normal daily swing from an event.
6. **Hypoxia** — onset thresholds, duration, ecological consequence, in estuarine and freshwater
   settings.
7. **HAB early-warning indicators *as expressed in DO, pH and turbidity*** — the physical/chemical
   signature, not bloom biology, taxonomy, toxins, or program governance.
8. **Biofouling and sensor drift** — how each probe type degrades in months-long deployment, what
   the drift looks like in the data, cleaning intervals.

### Priority 3 — baselines and context
9. **Typical / expected ranges by water-body type** — estuary, harbor, marina, freshwater river,
   Great Lakes nearshore. Especially anything with defensible numbers.
10. **How to establish a site baseline** from historical monitoring data (rolling percentiles,
    seasonal normalization) — this is an open design decision.
11. **NOAA data products usable as external context for event detection** — which historical
    datasets exist, what they contain, how they're accessed.
12. **Temperature probe datasheet** (thermistor/RTD for submerged continuous deployment).

---

## 6. What qualifies as a usable source

A candidate must clear **all** of these:

- **Free and publicly downloadable.** No paywall, no institutional login, no registration.
  *(Standard Methods for the Examination of Water and Wastewater is known-paywalled — skip it.)*
- **Real extractable text.** A PDF whose text layer is empty is scanned images and needs OCR before
  it can be used. Flag these; don't silently discard them.
- **The current edition.** See §7 — this is where sourcing most often goes wrong.
- **About the six parameters**, densely. A useful rule of thumb from auditing the existing corpus:
  a good document mentions the six parameters **50+ times**; the ones being cut mention them
  **0–34 times across 120K+ characters**.
- **Numbers, procedures or mechanisms** — not policy process, not program administration.
- Preferably **one parameter in depth** over a broad survey of water quality generally.

**Good publishers:** USGS, EPA (technical/method documents), NOAA/NCCOS (science, not governance),
state environmental agencies, NERRS/estuarine reserves, instrument manufacturers (Atlas Scientific,
YSI/Xylem, In-Situ, Hach, Campbell Scientific) for probe behavior, and free ISO/ASTM summaries.

---

## 7. Verification protocol — please actually run this

Every one of these failure modes occurred while assembling the current corpus. All returned
HTTP 200 and looked fine.

1. **Confirm the file is what its label says.** One link circulated as "the full combined chapter"
   was 9 pages of table of contents. Check page count and opening text.
2. **Confirm it is not superseded.** *Five of nine* USGS chapter links in circulation pointed at
   retired editions, which USGS still serves at their original URLs. For USGS, the publications API
   records this explicitly:
   `https://pubs.usgs.gov/pubs-services/publication/?q=<indexId>&mimetype=json` — look for a
   `SUPERSEDED_BY` relation. The stakes are real: the 1998 turbidity chapter contains the string
   "FNU" **zero** times; the 2005 edition has it ten times.
3. **Confirm text extracts.** `pdftotext file.pdf -` returning nothing means scanned images.
4. **Confirm it is not a landing page.** Several agency "documents" are HTML pages whose actual PDF
   sits one link deeper. Follow it.
5. **Reject navigation and hub pages.** Index pages, reference libraries and program hubs are link
   lists, not source material.
6. **Count parameter mentions** before recommending it, per §6.

**Deliver for each candidate:** direct file URL · publisher and date/edition · page count · whether
text extracts · which of the §5 gaps it fills · rough count of six-parameter mentions · one line on
why it beats what's already held.

---

## 8. Useful background facts

- Two cleared test pods: **Algalita Pod** (saltwater, Southern California) and **Old Woman Creek
  2026** (freshwater, Lake Erie, Ohio — a National Estuarine Research Reserve site, fourth
  consecutive season). They are different water types, which is an unsolved configuration problem.
- Algalita reads **54,100–60,200 µS/cm** against a stated saltwater normal of 40,000–50,000 — an
  open question for the operator, not a software bug.
- A pod's first-ever reading can be a **boot artifact** (pH 13.58, −1809 °F) whose hardware error
  flags are *not* set, so it survives fault filtering. Plausibility limits per parameter are wanted.
- The vendor's own marketing lists the sensor suite inconsistently (two different sets of five).
  The FAQ's "6-sensor suite" is correct and matches the implementation.
