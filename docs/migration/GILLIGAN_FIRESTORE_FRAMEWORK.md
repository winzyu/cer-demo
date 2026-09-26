# Gilligan data in Firestore

For the supervisor's approval (stakeholder item 23), written 2026-09-24.
It lists everything Gilligan keeps in the production Firestore database, what changes for the release, and what stays optional.
Nothing here touches the existing users, organizations, devices or water-data collections.

## Summary

The release needs **one new collection**, `gilligan_usage`, for the daily limits.
It also keeps using the existing `chats` collection, adding answer details to each saved message.
The document library ships inside the Gilligan service itself, so the two corpus collections are optional and not planned for launch.

## Collections

| collection | status | one document per | fields | written by | read by | size and retention |
|---|---|---|---|---|---|---|
| `chats` | existing, used since before the release | conversation | `user`, `assistant` (`"rag"` for the new Gilligan), `creationDate`, `lastInteraction`, `messages`: each message holds the question (text, date, the pod data sent with it) and the answer (text, date, and from the release `citations`, `audit`, `reports`, `tool_calls`, `tool_round_cap_reached`) | CER server, when an answer comes back | CER server, for the chat's own author | Kept indefinitely (decided 2026-09-24). See the size limit below. |
| `gilligan_usage` | **new, needed for launch** | user per UTC day | `userId`, `organizationId`, `day` (YYYY-MM-DD), `questions`, `reports`, `tokens`, `updatedAt` | Gilligan service, one update per question or report | Gilligan service, to check the limits and show "N questions left" | About 200 bytes each. Can be deleted after 90 days by a Firestore TTL policy on `updatedAt`. |
| `corpus_documents` | optional, not planned for launch | library document (8 today) | `filename`, `title`, `sourceUrl`, `text` and document metadata | a one-off seeding script | Gilligan service, if configured to read the library from Firestore | Largest document about 480 KB, under Firestore's 1 MiB limit. Replaced whenever the library is re-seeded. |
| `corpus_chunks` | optional, not planned for launch | library passage (446 today) | `filename`, `title`, `sourceUrl`, `chunkIndex`, `contentHash`, `text`, `embedding` (a search vector) | a one-off seeding script | Gilligan service, for vector search | A few KB each, needs a Firestore vector index. Replaced on re-seed. |

`chat_audit_log` exists in the Gilligan code but is switched off and will not be created; audit details live on each chat message instead.

## What the answer details hold

- `citations`: the documents and data lookups an answer quoted.
- `audit`: the model, the approved-content version, the answer before citation cleanup, and any citation corrections.
- `reports`: the report offered in the answer, if any (the PDF itself is not stored).
- `tool_calls`: the pod data lookups behind the answer, including the readings returned.

Chats therefore hold customer questions and pod readings, as they already did before the release.
Who besides the author may read a chat is still open (stakeholder item 21).

## Access

- The Gilligan service's own service account gets read and write on `gilligan_usage` only, plus read on the corpus collections if they are ever used.
- `chats` stays with the CER server's existing credentials; the Gilligan service never reads or writes it.
- The browser never talks to these collections directly; everything goes through the CER server.

## Cost

- Usage: one read and one write per question or report, inside a transaction.
  At 300 users using every allowance every day that is about 7,500 reads and 7,500 writes a day, well inside Firestore's free daily quota of 50,000 reads and 20,000 writes.
- Chats: one read and one write per message, unchanged from the Gemini-era design.
- Storage is negligible next to reads and writes.

## One risk to decide

A conversation is one document, and Firestore caps a document at 1 MiB.
The new answer details make each message larger, mostly through `tool_calls`, so a very long conversation could hit the cap and stop saving.
Before launch the message size will be measured from real local answers; if a conversation could reach the cap within a plausible use, either a new conversation starts automatically at a message limit, or `tool_calls` is trimmed to what the audit needs.

## Corrections, 2026-09-25

Two statements above are wrong and need correcting before the supervisor approves the table (F2).

- **Retention.** A Firestore TTL policy deletes a document once its TTL field is in the past, so a policy on `updatedAt` would delete the current day's usage counter within about a day and reset that user's limits.
  `gilligan_usage` needs an `expireAt` field set 90 days after `updatedAt`, with the policy on `expireAt`; `feat/service-release` (`cc8a300`) does not write it yet.
- **Access.** Firestore IAM cannot grant access to one collection: the Datastore User role covers every collection in a database.
  The promise that Gilligan touches only `gilligan_usage` holds only if Gilligan's data lives in its own Firestore database with the role granted on that database alone; the user chose that on 2026-09-25 (branch `docs/l2-inputs`, `9d448f8`, not yet on `dev`), and the new database needs the supervisor's approval as well.
