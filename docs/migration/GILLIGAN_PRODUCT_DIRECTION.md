# Gilligan product direction and discovery handoff

Updated 2026-09-16 following the product interview and source-of-truth v2 review.
This records user decisions and planning findings, not an approved implementation specification.

## Reading this now

This is the discovery record of 2026-09-16 and 2026-09-17; the user decisions below still stand.
Its "continue discovery, do not implement" instruction was fulfilled by [`GILLIGAN_TARGET_ARCHITECTURE.md`](GILLIGAN_TARGET_ARCHITECTURE.md), which is where current plans and decisions D1-D12 live.
Superseded since:

- **Workspace and D1.** The OneDrive checkout and the WSL2 sandbox are gone; upstream code is written in the two `local` checkouts (D1 revised 2026-09-21, [`LOCAL_STACK.md`](LOCAL_STACK.md)).
- **Reports.** PDFs are no longer written to disk or guarded by token-hash sidecars; `POST /api/v1/reports` returns the bytes (`docs/SPECS.md` §10.7).
- **Pattern tags and the sewage rule.** Diel/tidal/trend classification landed on 2026-09-22, and the sewage rule follows water type since R2 (`docs/SPECS.md` §4b, §10.7).
- **Tools.** `list_pods` was added on 2026-09-21 ([`GILLIGAN_TOOL_ACCESS.md`](GILLIGAN_TOOL_ACCESS.md)).
- **`gemini-pro`.** Live-confirmed failing on 2026-09-21 (D9).
- **Trimmed 2026-09-23.** The implementation evidence, static findings, proposed approach (built as the catalogue, architecture §2d) and the discovery session's checks and costs were removed as stale; the full text is under tag `docs-tier2-archive-2026-09-23`. One finding from it is still unverified: some event classifications could not clear `CONFIDENCE_FLOOR`, and algal-bloom handling was inconsistent.

## Confirmed user decisions

- Replace Gilligan substantially within `../user-dashboard`, supported by the existing live `../clean-earth-rovers-server` backend.
- Target general availability through the dashboard on September 30, 2026, for approximately 10+ organizations with 5+ members each.
- First-release priorities are reports, organization-scoped live/historical sensor Q&A, and grounded education with basic scoped solutions.
- Organization membership determines pod access; a separate per-user pod-grant system was not requested.
- Cover pH, dissolved oxygen, temperature, ORP, electrical conductivity, and turbidity.
- Turbidity remains qualitative despite its numeric signal because current hardware is limited; future hardware may improve this.
- Preserve the supervisor's report structure in `report/datapod-water-quality-report-template.md (1).pdf`.
- Single-pod reports suffice initially; multi-pod reports are not essential.
- Reports summarize measurements and configured-threshold crossings; possible causes and recommended actions require applicable corpus support.
- Immediate PDF download suffices initially; persistent access to generated PDFs is not required for the first release.
- Preserve conversation history and continue saving new conversations.
- Pod users receive limited Gilligan access initially; exact limits and a future subscription model remain undecided.
- Education prioritizes measured metrics and related questions; broad general-water-quality expansion is not a release requirement.
- Supervisor-approved content may supplement the corpus, and the supervisor can review it within a few working days.
- Contextual CER referrals are desired, but actual services, contact details, and applicability require confirmation.
- Backend code, never the model, must enforce access to sensor data; telemetry stays separate from vector knowledge storage.

### Decisions recorded 2026-09-17

Target architecture, gap analysis and roadmap built on these: [`GILLIGAN_TARGET_ARCHITECTURE.md`](GILLIGAN_TARGET_ARCHITECTURE.md).

- **Merge path:** build the complete, quality-checked product first, demo it to the supervisor, and the supervisor approves merging it into the upstream repositories. Where that code is written is D1 below.
- **Integration shape:** the dashboard keeps calling the upstream Gilligan routes; the upstream server calls this service over HTTP (`INTEGRATION_PLAN.md` Shape C, archived under tag `docs-archive-2026-09-23`). Moving this code into the upstream server is an option if time allows.
- **Hosting:** the upstream owners create their own Fireworks API key for `gpt-oss-120b`. The document corpus is expected to live in their Firestore.
- **Data handling is a launch requirement.** Fireworks documents that it does not log or store prompts or generations for open models unless the account opts in, which covers the serverless models used here (checked below).
- **Phase 3 capture spend is approved**, to be run in a separate session.
- **Usage limits:** left to Claude's design, for about 50 users at launch and sized for several hundred. Proposal in the architecture document.
- **Pod scope:** the selected pod is a default the assistant may change within the caller's organization, not a hard boundary.
- **Answers arrive whole at launch.** Streaming is a later item.
- **Reports:** single pod, generated by this service, downloaded immediately through an upstream route, no stored copies.
- **Phone and tablet layout (◆G5)** is a later item.
- **Content:** v2 is source material for a small supervisor-approved catalogue shared by chat and reports, not added to the search corpus. The catalogue may be kept in a light text format to save tokens.
- **CER referrals:** four CER services are offered for matching problems: algal bloom cleanup, fish kill cleanup, debris capture and oil spill response. Everything else is referred to a separate solution. Contact details below await supervisor confirmation.

Follow-up answers, 2026-09-17:

- **Where upstream code is written (D1):** revised 2026-09-21; see "Reading this now". The user demos the result, and the supervisor approves transferring it into the real repositories.
- **Gemini-era conversations (D2):** ignored entirely; the replacement neither shows nor continues them.
- **Launch quality bar (D3):** aim for every Phase 3 check, but launch on best effort: where answers are known to be weak, say so with a caveat or refuse the question rather than delay the release.
- **Supervisor questions:** the three v2 questions and the referral contacts are items 17-20 in `docs/STAKEHOLDER_QUESTIONS.md`.

- **Audit trail (D4):** option B, audit details (cited sources, model, catalogue version, tool calls) saved inside each chat message; the separate `AUDIT_LOG` collection stays off.

### Research recorded 2026-09-17

- Fireworks data handling (https://docs.fireworks.ai/guides/security_compliance/data_handling): no logging or storage of prompt or generation data for open models without explicit opt-in; the Responses API stores conversations for 30 days unless `store=False`; prompt caching keeps some prompt data in volatile memory for minutes. The page does not mention a DPA.
- Fireworks pricing (https://docs.fireworks.ai/serverless/pricing): `gpt-oss-120b` is $0.15 input, $0.015 cached input and $0.60 output per million tokens. No free tier or free credits are documented, so "free tier" should not be assumed.
- Fireworks rate limits (https://docs.fireworks.ai/serverless/rate-limits): adaptive tokens-per-minute limits per account and model, split into prompt, uncached prompt and generated tokens; 429 when exceeded, 503 when overloaded; current limits are returned in `X-Ratelimit-Limit-Tokens-*` headers. A third-party page (https://www.morphllm.com/fireworks-alternative) says accounts without a payment method are capped at 10 requests per minute; this is not confirmed by Fireworks' own docs.
- CER public contact (https://www.cleanearthrovers.com/ and /contact): email info@cleanearthrovers.com; a "Schedule a Call" booking link, https://calendar.app.google/b4asoD6b6vuae7Qj6; no phone number or address is listed. The site names oil collection, debris capture, algal bloom spraying and vegetation cutting; a third-party profile (https://bluerobotics.com/service-providers/clean-earth-rovers/) lists oil spill cleanup, fish kill and algae bloom removal and marine debris cleanup, with service in Southern California and Ohio. All unconfirmed by the supervisor.

## Tentative and open decisions

Preserve the existing pod-to-Firestore collection process and storage for this release.
The inspected application code reads telemetry; the physical-device write pipeline was not located, which does not mean it is absent.
The integration shape is settled for launch (2026-09-17, above): this assistant sits behind the existing Gilligan backend route.
The user requested advance notice before any task warrants a stronger model or higher reasoning effort; no escalation was proposed or performed.

Pending supervisor clarification: distinguish hardware relocation, replacement at the same site, and transfer between organizations.
Decide whether reports follow the physical pod or the monitoring deployment, who retains earlier readings, and how testing/maintenance periods are excluded.
Who sees earlier readings was decided on 2026-09-23: only an organization known to own them, so cross-organization history is withheld (`SPECS.md` §10.3c, `STAKEHOLDER_QUESTIONS.md` item 22).
Historical observations in `POD_RELOCATION_EVIDENCE.md` show hardware histories spanning states and a merged Old Woman Creek chain containing mostly readings from other locations.
Those observations are not a current database census.

## Source-of-truth v2 review

File: `water-quality-source-of-truth-v2.pdf` at repository root, version 2.0, dated 2026-09-16, 21 pages.
All pages were read; the document was not ingested or modified.
The user also explicitly authorized reviewing the earlier excluded source-of-truth document, which was read from Git history without restoring it.

V2 substantially supports education, troubleshooting, qualified causes, confirmation steps, and detection limitations.
It reduces the need to author a broad new advice document, but does not establish CER's service catalogue or implement its analytical methods.
Useful sections are site baselines (§4), natural explanations (§5), event signatures (§6), fault signatures/metadata (§7), QC (§8), confidence tiers (§9), and detection limits/alternative measurements (§10).
Compared with v1, marine sewage signatures now involve falling conductivity and ORP is no longer described as reliably preceding DO changes in oxygenated water.
Existing event code contains older assumptions.

### Where current code diverges from v2 (checked 2026-09-16 at `1a8c744`)

- `classify()` in `src/report/events.ts` ignores water-body type: its sewage rule scores highest (0.7) when conductivity rises, which is v2's freshwater signature (§6.3), while v2's default for coastal pods is the marine one, where conductivity falls (§6.2, "freshening").
- A marine sewage pattern therefore scores 0.5, which only just meets `CONFIDENCE_FLOOR`, and its rationale calls the missing conductivity rise the gap in the match.
- `EventType` (`src/report/types.ts`) has no treated effluent, dry-weather runoff, bloom collapse, upwelling or internal tide, all of which v2 §6.2 lists, and three of which are natural explanations v2 says to rule out before proposing pollution.
- v2 classifies the environment by salinity in PSU (§0 rule 2), while pods report conductivity in µS/cm and the registry carries `operatingEnvironment`; a conversion or an explicit mapping is needed before v2's thresholds can drive code.
- v2's §0 is written as rules addressed to the model. If the document is ingested, those rules would compete with the system prompt's policy, including where they conflict with the qualitative-turbidity and no-substitute-ranges decisions above.
- The missing diel/tidal classifier (`pattern: "unknown"` on live data) blocks v2 §0 rule 4 (rule out natural cycles) as well as the existing bloom detector.

### Resolve before adopting v2 as governing material

1. Generic fallback ranges conflict with the current policy against substituting document ranges for absent configured thresholds.
2. Quantitative turbidity ranges, typical accuracy, and assumed FNU units conflict with the qualitative-only release policy.
3. Page 19, Example 1 says percent saturation falls less because colder water holds more oxygen, contradicting its own formula: falling measured DO and rising saturation concentration increase the relative saturation decline under otherwise comparable conditions.
4. Example 2's claim that no rain rules out stormwater exceeds the observations supplied; antecedent/catchment rainfall is not established.
5. Example 3 moves from suspected sensor failure to marking measurements failed without sufficiently explicit confirmation criteria.
6. Simultaneous timestamps/changes alone do not identify a fault; synchronized sampling and cadence matter.
7. Baseline implementation needs minimum sample requirements, zero-MAD handling, missing-context behavior, and consistent confidence terminology.
8. Scientific claims lack a full bibliography, and CER-specific empirical claims need supporting analyses.

Keep operator-configured thresholds, statistically observed baselines, and published scientific/regulatory references distinct.
V2 supports baseline rebuilding after relocation/replacement, but does not decide historical access rights.
The review was a product/implementation assessment with selective primary-source checking, not full scientific validation of every claim.
USGS documents saturation inputs and methods at https://www.usgs.gov/tools/dotables and https://water.usgs.gov/water-resources/software/DOTABLES/.

### Three focused supervisor questions

- Are generic fallback ranges educational only, or intended to change report assessments when configured thresholds are absent?
- Can the current qualitative turbidity hardware be explicitly exempted from quantitative ranges and assumed units?
- Can the supervisor review the example concerns and confirm which follow-up recommendations are approved for customers?
