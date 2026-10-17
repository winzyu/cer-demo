# Release doc fixes, 2026-09-29

Branch `cloud/release-doc-fixes`, cut from `origin/dev` at `0de9059`.
The local `dev` checkout was 213 commits behind `origin/dev` and lacked the guide and the runbook, so the branch starts from the remote.

## GILLIGAN_MANUAL_TEST_GUIDE.md

K12 now checks that a weak in-scope answer carries the standing caveat instead of a refusal.
It asks the cross-document question from `crossdoc-warm-week-oxygen-drop`, because cross-document is the weakest class (0.83), and expects an answer with citations and K20's caveat line, not a refusal.
It then asks an out-of-scope question and expects the verbatim refusal sentence with no caveat line, since the caveat replaced refusals only for weak answers inside the scope.
Its Needs and Cost now match K20: the dashboard with U7, wording pending the user, two paid questions.
Verified against `timeline.md` (E4 decision, 2026-09-27), the release plan's E4 and U7 rows, and `REFUSAL_SENTENCE` in `src/prompt/systemPrompt.ts`.

## GILLIGAN_DEPLOYMENT_RUNBOOK.md

§3.1 now says its table and the note under it predate the release candidate, and points to `RELEASE_CANDIDATE.md` (not yet written) for the commits that ship.
The table rows are unchanged.

§4.1 adds `PREDECESSOR_PERIOD_HANDOFF: "false"` to the env file, with a line explaining why it is set explicitly.
`src/config/index.ts` line 495 reads it with `readBool("PREDECESSOR_PERIOD_HANDOFF", false)`, so the value matches the default.

`DEFAULT_TOP_K=20` was not added to the env file.
`src/config/index.ts` does not read it, and nothing else in `src/` or `scripts/` reads it from the environment: it is the constant `DEFAULT_TOP_K = 20` in `src/retrieval/options.ts` line 26 (`timeline.md`, 2026-09-24: "A code constant, not an environment setting").
An env entry would have no effect and would suggest the depth can be changed at deploy time.
Instead §4.1 states that it is a code constant, why it is absent from the file, and asks L4 to confirm the release candidate still sets 20.
If you want the line in the YAML anyway, it is a one-line addition.

§2.1 item 6 now has a fallback.
Check whether `iam.allowedPolicyMemberDomains` applies, since it rejects `allUsers`.
If it does, turn off Cloud Run's invoker check with `--no-invoker-iam-check`, which grants nothing to `allUsers`.
If `run.managed.requireInvokerIam` blocks that too, Michael asks for a project exception and L5 waits.
If no exception comes, the §5 identity-token change (cer-api mints tokens; the default compute account gets Invoker) moves before launch, which is unbuilt server work and delays the release.
The service-key check stays under every option.

## SECURITY_FINDINGS.md

§5 item 1 now names the three routes that do use `findOrganizationDevices` (`/water/last/:device`, `/water/average/:duration/:unit`, `/water/average/many-devices`, from §1's table).
It also says the CSV export does not check organization, per §7's 2026-09-27 correction and item 7.
§8 now lists the leaked fields as id, name, userName, email and device list, and says role and organization are not included.

## Not verified

- §8's field list is taken from the task and the reset brief (`GILLIGAN_RESET_2026-09-28.md`).
  `clean-earth-rovers-server` is not in this container or in the session's reachable repositories, so `UserDTO.format` at `b2074b8` was not read.
- The two organization-policy constraint names and `--no-invoker-iam-check` are from Cloud Run and Resource Manager behavior as I know it.
  They were not checked against current Google Cloud documentation or against the project's actual policies, which would be live reads.
- Not edited, same overstatement: §1 of `SECURITY_FINDINGS.md` ("Every sibling device-scoped route performs the membership check") and §7 ("while every sibling has both") still say every sibling checks organization, qualified only by §7's correction paragraph.
- K12 is a table row, so "one sentence per line" cannot apply inside it.
- No tests, typecheck or lint were run; the changes are Markdown only.
