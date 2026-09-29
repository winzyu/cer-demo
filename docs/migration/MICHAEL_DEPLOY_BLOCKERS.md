# Michael's deploy blockers: checklist

Every deploy (L5 onwards) waits on these; the setup steps are in [`GILLIGAN_DEPLOYMENT_RUNBOOK.md`](GILLIGAN_DEPLOYMENT_RUNBOOK.md) §2.1.
Each command is read-only and prints no secret values; run it in Claude Code with the `!` prefix.
A permission error means your roles cannot see that resource: ask Michael to confirm instead.

| # | Blocker | Done when |
|---|---|---|
| 1 | `cer-gilligan-runtime` exists and you can act as it | [ ] |
| 2 | Fireworks secret stored, readable by the runtime account only | [ ] |
| 3 | Service-key secret stored, readable by the runtime and default compute accounts | [ ] |
| 4 | `gilligan` database exists; runtime granted on it alone | [ ] |
| 5 | TTL policy on `gilligan_usage.expireAt` | [ ] |
| 6 | Organization policy allows unauthenticated invocation | [ ] |
| 7 | `cer-ui` trigger `8ad67b17` disabled | [ ] |
| 8 | `DEVICE_API_TOKEN` rotated | [ ] |

## 1. Runtime account

```
! gcloud iam service-accounts describe cer-gilligan-runtime@conductive-fold-343604.iam.gserviceaccount.com --format='value(email,disabled)'
! gcloud iam service-accounts get-iam-policy cer-gilligan-runtime@conductive-fold-343604.iam.gserviceaccount.com
```

Pass: the first prints the email and `False`; the second lists your account under `roles/iam.serviceAccountUser`.

## 2. Fireworks secret

```
! gcloud secrets describe cer-gilligan-fireworks-api-key --project=conductive-fold-343604 --format='value(name,createTime)'
! gcloud secrets get-iam-policy cer-gilligan-fireworks-api-key --project=conductive-fold-343604
```

Pass: the secret exists, and `roles/secretmanager.secretAccessor` lists `cer-gilligan-runtime` and no other service account.

## 3. Service-key secret

Its name is not recorded yet (runbook §4.2 `[FILL]`); list the secrets to find it, then check its readers.

```
! gcloud secrets list --project=conductive-fold-343604 --format='value(name,createTime)'
! gcloud secrets get-iam-policy <service-key secret> --project=conductive-fold-343604
```

Pass: `roles/secretmanager.secretAccessor` lists both `cer-gilligan-runtime` and `98242557946-compute@developer.gserviceaccount.com`.
Record the name in the runbook's `[FILL]` markers.

## 4. Gilligan database and grants

```
! gcloud firestore databases describe --database=gilligan --project=conductive-fold-343604 --format='value(name,locationId,type)'
! gcloud projects get-iam-policy conductive-fold-343604 --flatten=bindings --filter='bindings.members:cer-gilligan-runtime' --format='table(bindings.role,bindings.condition.expression)'
```

Pass: the database exists in Native mode (`FIRESTORE_NATIVE`); the runtime account's only Firestore role is `roles/datastore.user`, with a condition naming the `gilligan` database, and it has no role on `(default)`.
If Michael chose another database name, use it in both commands.

## 5. TTL policy

```
! gcloud firestore fields ttls list --database=gilligan --project=conductive-fold-343604
```

Pass: a row for collection `gilligan_usage`, field `expireAt`, state `ACTIVE` (or `CREATING`); none on `updatedAt`.

## 6. Unauthenticated invocation

```
! gcloud org-policies describe iam.allowedPolicyMemberDomains --project=conductive-fold-343604 --effective
```

Pass: no `allowedValues` restriction (an empty policy or a "not found" error both mean no restriction).
If it lists domains, `allUsers` cannot be granted Invoker; use the runbook §2.1 item 6 fallback, which turns off Cloud Run's invoker check instead.
That fallback works only if the second policy below is not enforced:

```
! gcloud org-policies describe run.managed.requireInvokerIam --project=conductive-fold-343604 --effective
```

Pass for the fallback: not enforced (it is off by default).
After cer-gilligan exists, confirm the grant with `! gcloud run services get-iam-policy cer-gilligan --project=conductive-fold-343604 --region=us-central1`, which should show `allUsers` under `roles/run.invoker`.

## 7. `cer-ui` build trigger

```
! gcloud builds triggers describe 8ad67b17-5439-4507-9718-5b2b5eb4abe9 --project=conductive-fold-343604 --region=us-central1 --format='value(name,disabled)'
```

Pass: prints `True` after the name.
If it reports "not found", run it again without `--region` (the trigger may be global).

## 8. `DEVICE_API_TOKEN` rotation

The token is a superadmin token with no expiry, signed with cer-api's `ACCESS_TOKEN_SECRET` (server `src/services/AuthService.ts`), so it stays valid until that secret changes; changing it signs every user out once.
gcloud cannot prove the old token is dead; ask Michael to confirm the change, then check that a new cer-api revision picked it up:

```
! gcloud run services describe cer-api --project=conductive-fold-343604 --region=us-central1 --format='value(status.latestReadyRevisionName,metadata.annotations."serving.knative.dev/lastModifier")'
! gcloud run revisions list --service=cer-api --project=conductive-fold-343604 --region=us-central1 --limit=3
```

Pass: the newest ready revision was created after 2026-09-28 and after Michael's change.
