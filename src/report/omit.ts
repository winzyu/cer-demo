/**
 * Notes and sections a requester may leave out of a report PDF, for a copy they share outside
 * their organization (`SPECS.md` §10.7).
 *
 * A report includes everything by default; a group is left out only when the request names it.
 * The names are a closed list so the model can only choose, never write: what each group removes
 * is fixed here and in `narrative.ts`/`renderPdf.ts`, and the same list always renders the same
 * PDF. Every number, flag, status and recommendation stays; only explanatory notes go, and the
 * metadata table says which groups were left out.
 */

export const REPORT_OMIT_GROUPS = [
  "turbidity_notes",
  "sensor_fault_notes",
  "threshold_notes",
  "data_quality",
] as const;

export type ReportOmitGroup = typeof REPORT_OMIT_GROUPS[number];

/** What each group removes, in the words the tool description and the PDF use. */
export const REPORT_OMIT_DESCRIPTIONS: Record<ReportOmitGroup, string> = {
  turbidity_notes: "the notes explaining that turbidity is an uncalibrated relative index with no "
    + "range (the clarity band and its numbers stay)",
  sensor_fault_notes: "the turbidity notes about off-scale or all-zero readings that may point at "
    + "a sensor fault",
  threshold_notes: "the notes on where each parameter's threshold comes from, and why a "
    + "parameter has none or cannot detect an excursion",
  data_quality: "the whole Data Quality section",
};

/** How the metadata table names a left-out group. */
const OMIT_LABELS: Record<ReportOmitGroup, string> = {
  turbidity_notes: "turbidity notes",
  sensor_fault_notes: "sensor fault notes",
  threshold_notes: "threshold notes",
  data_quality: "Data Quality section",
};

/** A bound on what is parsed; duplicates are tolerated, so this is above the group count. */
const MAX_OMIT_ENTRIES = 10;

const isGroup = (value: unknown): value is ReportOmitGroup => (
  typeof value === "string" && (REPORT_OMIT_GROUPS as readonly string[]).includes(value)
);

/**
 * Validates a requested `omit` list. Absent, null or empty means leave nothing out. Returns the
 * groups deduplicated and in `REPORT_OMIT_GROUPS` order, so equivalent requests render alike, or
 * an error naming the allowed values.
 */
export const parseReportOmit = (
  value: unknown,
): { omit: ReportOmitGroup[]; error?: undefined } | { error: string } => {
  if (value === undefined || value === null) {
    return { omit: [] };
  }
  if (!Array.isArray(value) || value.length > MAX_OMIT_ENTRIES || !value.every(isGroup)) {
    return {
      error: `"omit" must be a list drawn from: ${REPORT_OMIT_GROUPS.join(", ")}.`,
    };
  }
  return { omit: REPORT_OMIT_GROUPS.filter((group) => value.includes(group)) };
};

/** The metadata row's value, or undefined when nothing was left out. */
export const omittedNotice = (omit: readonly ReportOmitGroup[]): string | undefined => (
  omit.length > 0
    ? `${omit.map((group) => OMIT_LABELS[group]).join(", ")} (at the requester's request)`
    : undefined
);
