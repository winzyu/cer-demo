import type { ToolInvocation } from "../types/tool.types";

/** Shared response/evaluation contract. Offsets always refer to the original answer. */
export interface CitationAudit {
  original_answer: string;
  corrections: { marker: string; replacement: string; offset: number; from: number; to: number }[];
  report_periods?: { handle?: string; expected: string; present: boolean }[];
  invalid_citations: { marker: string; reason: string; offset: number }[];
}

export interface CitationEvidence {
  tool_calls?: Partial<ToolInvocation>[];
  tool_round_cap_reached?: boolean;
  audit?: CitationAudit;
}

// Do not consume across another opener or a newline. Legacy quote closers are consumed as
// one marker, including doubled closers, but audited as malformed rather than silently accepted.
const MARKERS = /【(?:[^【】\n]*】|\s*\d+\s*(?:[†‡:|,;–—-]\s*)?["“”„‟″][^【】\n]*?["“”„‟″]\s*[}\]]+(?:】)?|[^【】\n]*(?=[\n【]|$))/g;
const DOCUMENT = /^【\s*(\d+)\s*(?:(?:[†‡:|,;–—-]\s*)?["“”„‟″]([^【】\n]*?)["“”„‟″]|†\s*L(\d+)(?:\s*-\s*L?(\d+))?)?\s*】$/;

export const normalizeHyphens = (text: string): string => text.replace(/[\u2010-\u2015\u2212\ufe63\uff0d]/g, "-");

export const assessCitations = (
  original: string,
  context: { text: string }[],
  tools: { handle?: string; result?: unknown }[] = [],
): { answer: string; audit: CitationAudit; total: number; valid: number } => {
  const audit: CitationAudit = {
    original_answer: original, corrections: [], invalid_citations: [],
  };
  const reportPeriods = tools.flatMap((tool) => {
    const result = tool.result as { report_period?: unknown } | null;
    if (typeof result?.report_period !== "string") return [];
    return [{
      ...(tool.handle ? { handle: tool.handle } : {}),
      expected: result.report_period,
      present: normalizeHyphens(original).includes(normalizeHyphens(result.report_period)),
    }];
  });
  if (reportPeriods.length > 0) audit.report_periods = reportPeriods;
  let total = 0;
  const answer = original.replace(MARKERS, (marker: string, offset: number) => {
    // Commentary has its own filter; it is not evidence.
    if (/^【commentary\b/i.test(marker)) return marker;
    total += 1;
    const invalid = (reason: string): string => {
      audit.invalid_citations.push({ marker, reason, offset });
      return "";
    };
    const tool = /^【(T[1-9]\d*)】$/.exec(marker);
    if (tool) return tools.some((call) => call.handle === tool[1]) ? marker : invalid("unknown tool handle");
    const doc = DOCUMENT.exec(marker);
    if (!doc) return invalid("malformed citation marker");
    let index = Number(doc[1]);
    let corrected = marker;
    const quote = doc[2];
    if (quote !== undefined && quote.trim() === "") return invalid("empty citation quote");
    if (quote && !context[index - 1]?.text.includes(quote)) {
      const matches = context.flatMap((chunk, i) => (chunk.text.includes(quote) ? [i + 1] : []));
      if (matches.length === 1) {
        const to = matches[0];
        corrected = marker.replace(/^(【\s*)\d+/, `$1${to}`);
        audit.corrections.push({
          marker, replacement: corrected, offset, from: index, to,
        });
        index = to;
      }
    }
    const chunk = context[index - 1];
    if (!chunk || index < 1) return invalid(`points at context #${index}, but ${context.length} chunk(s) were supplied`);
    if (doc[3]) {
      const from = Number(doc[3]);
      const to = Number(doc[4] ?? doc[3]);
      const lines = chunk.text.split("\n").length;
      if (from < 1 || to < from || to > lines) return invalid(`cites lines ${from}-${to}, of an excerpt which has ${lines} lines`);
    }
    return corrected;
  });
  return {
    answer, audit, total, valid: total - audit.invalid_citations.length,
  };
};
