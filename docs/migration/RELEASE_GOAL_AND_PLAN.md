# Gilligan release goal

Written 2026-09-18 and sent to the supervisor on 2026-09-19 as question A1 of [`SUPERVISOR_QUESTIONS_SEND.md`](SUPERVISOR_QUESTIONS_SEND.md); no reply as of 2026-09-22.
Recovered on 2026-09-22 after the old machine's commits were lost (tag `old-machine-recovery-2026-09-19`).
Only the goal is kept here.
The original outcomes, release checklist, task hierarchy and timeline are at that tag; the live task list is `../STATUS.md` and the roadmap in [`GILLIGAN_TARGET_ARCHITECTURE.md`](GILLIGAN_TARGET_ARCHITECTURE.md) §4.

## Final goal

On September 30, 2026, a signed-in member of a customer organization can open Gilligan in the CER dashboard, choose one of their organization's pods, and hold a conversation in which every answer is one of the following:

1. **A data answer** that is correct against that pod's readings for the stated time window.
2. **An education answer** grounded in cited corpus documents or supervisor-approved guidance.
3. **A clarifying question** when the request is ambiguous, after which the conversation continues with the answer to it.
4. **An honest limitation**: what Gilligan cannot answer or measure, and why.
5. **A single-pod PDF report** that downloads immediately.

No answer ever uses another organization's data, and every answer respects the usage limits.
The service runs in CER's GCP project, and hiding the page is a tested rollback.

Explicitly not part of the goal: streaming, phone layout, multi-pod reports, quantitative turbidity, automatic chat titles, daily and tidal pattern detection, and broad general water-quality education.
