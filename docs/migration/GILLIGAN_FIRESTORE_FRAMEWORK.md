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

- Usage: a question costs three reads and two writes (the limit check, then a transaction each for the question count and its tokens); a report costs two reads and one write.
  At 300 users using every allowance every day that is about 21,000 reads and 13,500 writes a day, inside Firestore's free daily quota of 50,000 reads and 20,000 writes, and a few cents a day above it.
- Chats: one read and one write per message, unchanged from the Gemini-era design.
- Storage is negligible next to reads and writes.

## One risk to decide

A conversation is one document, and Firestore caps a document at 1 MiB.
The new answer details make each message larger, mostly through `tool_calls`, so a very long conversation could hit the cap and stop saving.
Before launch the message size will be measured from real local answers; if a conversation could reach the cap within a plausible use, either a new conversation starts automatically at a message limit, or `tool_calls` is trimmed to what the audit needs.

**Measured 2026-09-24: yes, a long conversation can reach the cap.**
Five live questions ran through a local cer-rag with the release settings (tools, reports and catalogue on), and each answer was passed through the CER server's own relay mapping and sized with Firestore's storage formula:

| question | saved message | largest part |
|---|---|---|
| a document question (no pod data) | 5.6 KB | citations 3.5 KB |
| a 30-day report for one pod | 6.6 KB | citations 3.9 KB |
| latest readings for every pod | 18.6 KB | `tool_calls` 11.1 KB |
| pH and oxygen at one pod over 7 days | 27.6 KB | `tool_calls` 21.3 KB |
| three parameters across all pods over 30 days | 179.7 KB | `tool_calls` 164.9 KB |

About 5 messages like the last one, or about 21 at this mix, fill one conversation document, and at 20 questions a day one busy conversation can do that in a day.
When it happens the save fails after the answer was generated and paid for.
`tool_calls` carries the raw readings and is over 90% of every data-heavy message.
Recommended: store `tool_calls` without the raw readings (tool name, arguments, row counts and the summary the answer rests on), which brings the largest message to a few kilobytes, and also start a new conversation when a save would pass about 900 KB, as a backstop.
Both are changes to the CER server's relay and are not in the release branch yet.
