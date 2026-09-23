# Legal Liability Mitigation — Options and Effort

Six options were raised for reducing legal exposure from chatbot answers. This records what
already exists in the codebase for each, what's missing, and a rough dev-time estimate for
closing the gap. Estimates assume one developer, working in this codebase's existing patterns.

## 1. Confidence-calibrated language in answers

**Exists today** (`src/prompt/systemPrompt.ts`): the model already refuses outright when context
doesn't support an answer (`REFUSAL_SENTENCE`), and is told never to fill gaps from general
knowledge or fabricate readings/citations. This is binary — refuse or answer — not graduated
hedging on a borderline-but-not-empty retrieval.

**Missing:** a middle state — "the context partially supports this, treated as uncertain" —
distinct from a clean answer or an outright refusal.

**Effort: 0.5–1 day** for the prompt wording itself. `buildSystemPrompt()` is no longer a pinned
control: the pin was released 2026-08-26 when ◆G7 split, and the hash pin in
`test/unit/prompt.test.ts` was replaced by the flag-additivity contract in `9d71113` (a tool flag
may only append to the base prompt). There are no captured arms left to void — every transcript
captured against the old pinned bytes was archived 2026-09-01. The real sequencing constraint: land
this prompt change before the Phase 3 generation-baseline capture (`EVAL_REBUILD.md`), not after,
since a prompt edit invalidates any capture made before it.

## 2. Source citation in-product

**Already built, end to end.** The API returns `citations` (the retrieved chunks) alongside every
answer (`ChatController.ts`), the prompt instructs the model to cite its source
(`systemPrompt.ts`), and the frontend renders a deduplicated citation list under each answer
(`frontend/js/render.js: renderCitations`, `frontend/js/provenance.js`). Nothing to build for the
baseline version of this option.

**Optional enhancement:** citations currently show the source *file*, not a page number or exact
quote. Chunks don't carry page metadata (`src/ingestion/chunk.ts`), so "per EPA factsheet X, p.4"
would need that added at ingestion time. **Effort: 0.5–1 day** if wanted; skippable otherwise.

## 3. Escalation paths for high-stakes answers

**Partially exists:** the prompt already refuses drink/swim safety questions and tells the user to
consult local public-health authorities (`systemPrompt.ts`). Out-of-range readings are detected
(`src/report/events.ts`, `src/devices/plausibility.ts`). The report narrative already escalates:
for any High-severity event above the confidence floor it tells the reader to notify the client and
relevant authority and to consider a qualified water-quality professional (`src/report/narrative.ts`).
Chat answers carry no such line yet.

**Effort: ~1 hr** — a prompt rule for out-of-range chat answers, batched with the other prompt work
(the `escalation` tier below). When advice reaches reports, the generic referral should become the
catalogue's Clean Earth Rovers referral (see "Adopted, reworded — the referral").

## 4. Human-in-the-loop review for high-stakes answers

**Does not exist.** The pipeline is fully autonomous end to end — no hold-back, queue, or approval
step anywhere between the LLM call and the response reaching the user.

**Effort: 1–2 weeks for an MVP** — this is the largest item, a new feature rather than a tweak:
- Classify which answers qualify (regulatory-compliance or animal-welfare-adjacent topics).
- Hold the answer instead of returning it immediately; persist it as pending.
- A minimal approve/edit/reject surface for a human reviewer (no polish needed for v1).
- A way to deliver the reviewed answer back to the requester (poll, webhook, or email).

A rougher manual version (e.g., a human spot-checks a daily log rather than gating every
high-stakes answer before delivery) is much cheaper — closer to **1–2 days** — but is after-the-fact
review, not pre-delivery gating, which is a materially weaker liability position.

## 5. Insurance and contractual terms

**Not a development task for the substance** — E&O/product liability insurance and ToS drafting
are legal/business work, not code. The one engineering piece is surfacing the terms in-product.

**Effort: 0.25–0.5 day** for a disclaimer banner or first-use modal ("advisory, not prescriptive")
gated behind an acknowledgment stored client-side. The legal text itself needs a lawyer, not a
dev-time estimate.

## 6. Logging and audit trails

> **Built since.** `src/services/auditLog.ts` writes one Firestore record per chat response behind
> `AUDIT_LOG` (default off), and for Gilligan the relay saves an `audit` field on each chat message
> instead (D4 in `migration/GILLIGAN_TARGET_ARCHITECTURE.md`), so `AUDIT_LOG` stays off. The
> assessment below is the one made before either existed.

**Does not exist.** Logging today is `morgan` request logs plus a tagged console logger
(`src/utils/logger.ts`, `docs/SPECS.md` §8) — ephemeral, not queryable, and not tied to what was
retrieved or why. The `citations` returned to the caller are never persisted server-side.

**Effort: 1–2 days** for the basic version: write one record per chat response (query, retrieved
chunks/sources, final answer, model, mode, caller identity, timestamp) to Firestore, reusing the
existing lazy client (`src/config/database.ts`) the same way `FirestoreCorpusSource` already does.
**+0.5–1 day** for a simple lookup/export path so a record can actually be pulled if a claim is
litigated — without one, the data exists but isn't retrievable under time pressure.

## Summary

| # | Option | State | Est. effort |
|---|---|---|---|
| 1 | Confidence-calibrated language | partial (binary refuse/answer) | 0.5–1 day + bake-off rework |
| 2 | Source citation in-product | **done** | 0 (0.5–1 day optional) |
| 3 | Escalation paths | partial | 0.5–1 day |
| 4 | Human-in-the-loop review | none | 1–2 weeks (MVP); 1–2 days (after-the-fact only) |
| 5 | Insurance / ToS | none (dev slice only) | 0.25–0.5 day (dev slice); legal work not estimated |
| 6 | Logging and audit trails | none at the time; built since (§6) | 1.5–3 days |

**Everything except #4 totals roughly 3–6 developer-days.** Item 4 dominates the schedule — a
real pre-delivery review gate is a new feature, not a hardening pass on what's already built. A
lighter after-the-fact review (spot-check a log rather than gate delivery) is far cheaper but is a
materially weaker position if the point is to catch a bad answer before it reaches someone.

## Phased rollout

A four-phase plan was proposed, gating specificity/confidence to how much is at stake if the bot
is wrong, rather than to what the model happens to know. Directionally sound, and it composes
cleanly with the options above. Qualified against what's actually in the codebase:

**Phase 1 — Education only, no reference to the user's own sensor data.**
Closer to already-built than it looks: `SENSOR_TOOL` (default **off**, `src/config/index.ts`)
already means the model has no access to this deployment's live readings at all — it can only
answer from document CONTEXT and the `REFUSAL_SENTENCE`. This has since gone further than this
paragraph anticipated: the prompt's `AUTHORITATIVE NORMAL RANGES` block was deleted outright on
2026-09-13 (see the reconciliation note below), so the "is this reading normal" framing this
paragraph worried about leaking is no longer in the prompt to leak. **Effort: under a day** —
mostly prompt-scoping and a fixture or two, not new infrastructure.

**Phase 2 — Diagnosis + escalation, no DIY fixes.**
This is options 1 and 3 above, combined, plus one explicit new constraint: the current prompt has
no rule against suggesting a fix once it identifies an out-of-range reading — it just isn't asked
to. "No DIY fix recommendations" needs to be a stated prohibition, not an absence of instruction,
or the model will fill the gap the first time a user asks "so what do I do about it." **Effort:
folds into options 1 + 3's 1–2 days**, plus explicit no-fix wording and a support-contact line.

**Phase 3 — Low-stakes, reversible DIY suggestions.**
The plan's own framing ("hard to mess up, low consequence if wrong") is the right test, but a
free-text LLM answer is a bad way to enforce it — asking the model to self-limit to "genuinely
low-risk" suggestions through prompt wording alone is exactly the kind of instruction that erodes
under paraphrase and follow-up questions. **This phase needs a curated, fixed list of pre-approved
suggestions the model may select from (tied to specific trigger conditions), not open generation
hedged by instruction.** That's a real, scoped feature: an allowlist keyed to event types the
report pipeline already detects (`src/report/events.ts`), plus prompt rules that route to it
instead of free generation. **Effort: 2–4 days** — most of it is enumerating and wording the
allowlist carefully, not the plumbing.

**Phase 4 — Broader prescriptive advice.**
Correctly gated on insurance, legal sign-off, and accuracy benchmarking, all outside dev time. One
thing worth noting: this repo already has the benchmarking infrastructure that phase would need —
`eval/`, `src/eval/gates/`, `GRADING_GUIDE.md` — so "some human-reviewed accuracy benchmarking"
isn't a new system to build, it's running the existing eval apparatus against a Phase 4 prompt and
having a human grade the packet before sign-off. **Effort: not a dev estimate** (gated on
non-engineering approvals) beyond re-running the existing eval harness once those approvals exist.

## Decided 2026-09-09 — advice content comes from a prompt-carried allowlist

> **Implemented as the guidance catalogue** (`src/catalogue/`, `SPECS.md` §4b): one supervisor-approved
> file shared by chat (behind `CATALOGUE_PROMPT`) and reports. The `ADVICE_TIER` flag recommended
> below was not built; whether the catalogue keeps tiers is still open.

The product goal widened to answering with broad solutions. Three ways to supply that content were
considered and the allowlist wins on a technical argument, not a preference.

**Grounding is defined as the union of the retrieval context, the system prompt, the user's
question and any tool results** — which is why the operator normal ranges were quotable, while the
prompt still carried them, without being scored as fabricated. So an approved-suggestion list carried *in the system prompt*
is grounded by construction, and the pre-registered ≤2% ungrounded-turn ceiling survives untouched.

The two rejected alternatives:

- **Advice from the model's own knowledge.** Ungrounded by definition. The ceiling is ≤2% of turns,
  about one turn in 92, so any real advice tier fails it immediately. Shipping this means moving a
  pre-registered threshold, which is the failure the eval rebuild exists to prevent.
- **A new corpus tier of remediation documents.** Grounded, but a sourcing project of months. The
  corpus is measurement method and instrument specification only; no document in it says what to do
  about a reading. `CORPUS_SOURCING_BRIEF.md` has no remediation material queued.

**Consequence: the corpus does not change for this.** No sourcing, no re-ingest, no re-chunk, and
every retrieval label stays valid.

**What the allowlist still needs, and it is not engineering:** the suggestions themselves, each tied
to a trigger condition the report pipeline already detects (`src/report/events.ts`), authored by the
operator. The `prescriptive` tier stays gated on legal sign-off per §5 above.

**Structural recommendation:** implement the phase as an explicit config flag (e.g.
`ADVICE_TIER=education|escalation|diy-hints|prescriptive`), following the pattern `SENSOR_TOOL` and
`REPORT_TOOL` already establish in this codebase — a flag that changes the system prompt and is
pinned/tested per state, rather than a soft distinction left to prompt wording alone. That gives
every phase transition the same guarantee this repo already relies on for its retrieval bake-off:
a byte-identical, hash-pinned prompt per state, so "which phase was this answer generated under" is
never ambiguous after the fact.

---

# Operator meeting — reconciliation against the codebase

Action items raised in an operator/product meeting, decoded into what they mean here. Several are
existing project decisions in different words; one collides with a documented constraint. Recorded
so the same ground is not re-covered, and so the reasons a proposal was reshaped survive.

## Adopted, with a changed mechanism

**"Pull ranges directly from the database via a tool call rather than from a document or the
source-of-truth."** This is ◆G3 and the open half of Phase N4. The report path already does it:
`src/report/operatorThresholds.ts` reads per-device `thresholds.min/maxTemperature` and
`operatingEnvironment` from the backend device registry (`migration/BACKEND_FIELDS.md`). The chat
path does not — it still reads one global `WATER_TYPE`, because per-device ranges mean editing the
system prompt.

**Do not implement it as stated.** The prompt's `AUTHORITATIVE NORMAL RANGES` block is static
deliberately, and three things depend on that:

- **Prompt caching.** Static content first, dynamic last, is what makes the cached-input discount
  work (`timeline.md`, Phase N1). A per-request range block breaks byte-identical prompts.
- **Grounding.** A figure is grounded if it appears in the retrieval context, the system prompt, the
  user's question, or a tool result. The ranges are quotable today *because they are in the prompt*.
  Moving them to a tool result keeps them grounded — but only when the tool actually ran.
- **The `precedence` fixture class**, which tests that an operator range outranks a document. Wave 1
  declares no `requires`, so every fixture runs with `SENSOR_TOOL` off. Sourcing ranges from a tool
  makes that class depend on a capability the default configuration does not have.

**The version that works:** keep the prompt block as the default, and have `query_sensor_data`
surface the device's registry thresholds in its result, flagging disagreement — the pattern the tool
already uses for the `WATER_TYPE`-vs-`operatingEnvironment` mismatch. It lands after the generation
baseline is captured, batched with the other prompt work.

**Overtaken 2026-09-13 — the supervisor directed exactly the implementation above, and it was
built.** The prompt's `AUTHORITATIVE NORMAL RANGES` block is deleted outright rather than kept as a
default: every range in the operator's source-of-truth document is vetoed, and a limit may now be
stated only from a tool result (`get_pod_thresholds`, reading validated registry thresholds through
the backend device API with the caller's token; rejected values return a reason, never the number;
no fallback table). The three objections raised above were re-checked against the built version, not
waived:

- **Prompt caching.** Static-first, dynamic-last prompt assembly is unaffected — the range block is
  removed, not replaced by a per-request block. A tool result is not part of the cached prompt
  prefix at all, so caching is not a consideration here; there is no static content this change
  makes dynamic.
- **Grounding.** Still satisfied — a tool result is one of the defined grounding sources alongside
  retrieval context, the system prompt and the user's question, and it is grounded only when the
  tool actually ran, exactly the caveat noted above.
- **The `precedence` fixture class.** Rewritten rather than left dependent on a capability the
  default configuration lacks: the class no longer tests "operator range outranks a document" — it
  now tests that a range a corpus document describes is background, not the pod's configured limit,
  and that with no configured threshold available the assistant says so rather than substituting the
  document's range. Three fixtures, down from four (`EVAL_REBUILD.md`, `timeline.md` "Eval
  rebuild").

The consequence not previously anticipated in this reconciliation: the operator source-of-truth
document's ranges were woven into its prose, so the document itself left the corpus rather than
just the prompt block, and the registry values it displaced are operator-set **alert limits**, not
ecological ranges — several pods have limits that make a real event undetectable in one direction
(`timeline.md` "Eval rebuild", 2026-09-13 rows). Operator review of those limits is an open
follow-up, tracked there, not here.

**"Generalized ranges could stay, with what is normal for this location derived from historical
data."** This is ◆G3's question stated precisely: is the site baseline the operator-provided range
or computed from history. **◆G3 was resolved 2026-09-13** — the pod's registry threshold, by
supervisor direction (see the reconciliation note above) — but the instinct here, refine per site
from history, is not thereby closed off: rolling-percentile baselines from historical data remain a
possible later refinement to the registry-threshold answer, unbuilt and not a gate.

**"Educational tool — explain what this data means."** This is the `education` tier, and it is
approximately what ships today.

**"Keeping it generic is good; it gives operators freedom to find their own contractors and
solutions."** Direct support for the allowlist decision above. Generic, non-prescriptive suggestions
are what a curated list carries safely, and the tier that needs no legal sign-off.

**"Low dissolved oxygen in fresh water — a valid instruction would be to install a fountain. In a
harbor that does not make sense."** The clearest available statement of what the allowlist is: entries
keyed to **(event type, water-body type)**. Note the dependency it creates — the fountain example only
works if the system knows fresh water from harbor *per device*, which is the same registry field as
the first item. These two action items are one feature.

## Adopted, reworded — the referral

**"'You're going to have an algal bloom' → refer the operator to Clean Earth Rovers for cleanup."**

The referral is worth building. The prediction is not, and must not ship in that form:

- The six measured parameters cannot detect or forecast a bloom. There is no such sensor.
- The vendor's public marketing already overclaims this (turbidity "identifies bacteria and algae
  presence", early warning of "bacterial outbreaks"), and `CORPUS_SOURCING_BRIEF.md` §3 is explicit
  that the assistant must decline these **without contradicting the vendor or telling the customer
  they are wrong**.
- An assistant that announces a coming bloom is making the least defensible claim available to it.

**What survives:** an allowlist entry fired by a *measured* event signature the report pipeline
already detects, worded as conditions consistent with a concern, paired with the referral line.
Detection, never prophecy.

## Deferred — right idea, wrong moment

**"Update the prompt to emphasise the importance of the Firestore data."** Reasonable, but it is a
precedence rule, and precedence is already specified and tested. It is a prompt edit, so it batches
with quote-based citations and the tier flag and lands once — every prompt change invalidates every
capture made before it.

## Not carried forward

**"What tools are available."** Ambiguous between "tell operators what Clean Earth Rovers offers" —
which is allowlist and referral content, not engineering — and "expose the model's tool inventory to
users", which nobody asked for and which the prompt deliberately omits (promising tools that do not
exist invites the model to announce lookups it cannot perform). Treated as the former; no
engineering item.
