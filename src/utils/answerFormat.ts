/**
 * Post-processing for the visible answer text (`CHAT_UX_WORKPLAN.md` WS-5).
 *
 * `gpt-oss-20b` sometimes leaks its harmony `commentary` channel into the user-visible answer as
 * a `【commentary…】` marker. This is fixed **here, after the fact, and never in the system
 * prompt**: the prompt is a pinned control for the N2 bake-off while ◆G7 is open, and editing it
 * changes its SHA-256 and voids all three captured arms.
 */

/** Full-width `【` U+3010 — not the ASCII `[`. */
const OPEN = "【";

/** Full-width `】` U+3011. */
const CLOSE = "】";

/**
 * How far into a marker the channel-name probe looks. `【` plus a little slack is enough to see
 * `commentary`, and bounding it keeps the probe O(1) instead of copying the rest of the answer
 * once per marker.
 */
const PROBE_LENGTH = 32;

/**
 * The leaked channel marker, and *only* that.
 *
 * Full-width brackets carry more than commentary. The captured transcripts are full of citation
 * markers in the same brackets — `【1】`, `【5†L1-L3】`, `【Authoritative Normal Ranges】` — and
 * `invalid_citations` is a graded column in `GRADING_GUIDE.md`. Stripping every bracketed span
 * would delete the evidence the grading packet scores, so the match is anchored to the channel
 * name and everything else passes through byte-for-byte.
 */
const COMMENTARY_HEAD = /^【\s*commentary/i;

const opensCommentary = (text: string, open: number): boolean => (
  COMMENTARY_HEAD.test(text.slice(open, open + PROBE_LENGTH))
);

const isHorizontalSpace = (char: string | undefined): boolean => char === " " || char === "\t";

/**
 * Index just past the marker that starts at `open`.
 *
 * Nesting-aware, because a leaked marker can contain another one and matching the first `】`
 * would leave the outer marker's tail behind as garbage prose. An **unclosed** marker consumes
 * the rest of the string: the usual cause is `max_tokens` cutting the answer off mid-marker, and
 * everything after the opener is commentary either way.
 */
const markerEnd = (text: string, open: number): number => {
  let depth = 0;
  let index = open;

  while (index < text.length) {
    const char = text[index];
    if (char === OPEN) {
      depth += 1;
    } else if (char === CLOSE) {
      depth -= 1;
      if (depth === 0) {
        return index + 1;
      }
    }
    index += 1;
  }

  return text.length;
};

/**
 * Removes `【commentary…】` markers from an answer, leaving the surrounding prose alone.
 *
 * Two behaviors the callers depend on:
 *
 * - **An answer that is entirely markers comes back as `""`.** It is not padded, and no marker's
 *   contents are promoted into the answer — a fabricated answer is worse than a visibly empty
 *   one, which the caller can report honestly.
 * - **Text with no marker is returned unchanged**, whitespace included. The trim below only runs
 *   when something was actually removed, so passthrough is exact.
 */
export const stripCommentaryMarkers = (text: string): string => {
  // Fast path, and the guarantee that unmarked answers are never reformatted.
  if (!text.includes(OPEN)) {
    return text;
  }

  let out = "";
  let cursor = 0;
  let removed = false;

  while (cursor < text.length) {
    const open = text.indexOf(OPEN, cursor);

    if (open === -1) {
      out += text.slice(cursor);
      cursor = text.length;
    } else if (!opensCommentary(text, open)) {
      // A citation or ordinary prose. Copied through with its bracket; the scan resumes just
      // after the opener so a marker nested inside it is still found.
      out += text.slice(cursor, open + OPEN.length);
      cursor = open + OPEN.length;
    } else {
      out += text.slice(cursor, open);
      cursor = markerEnd(text, open);
      removed = true;

      // A mid-sentence marker usually has a space on each side. Removing the marker alone would
      // leave both, so the run after it is dropped and the one before it kept — one space, as
      // the sentence had before the model interrupted itself.
      if (isHorizontalSpace(out[out.length - 1])) {
        while (cursor < text.length && isHorizontalSpace(text[cursor])) {
          cursor += 1;
        }
      }
    }
  }

  // Only when a marker went: a leading or trailing marker otherwise leaves the answer starting
  // or ending in the whitespace that used to separate it from the prose.
  return removed ? out.trim() : out;
};
