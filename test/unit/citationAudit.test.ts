import { assessCitations } from "../../src/utils/citations";
import { checkCitations, checkFigures } from "../../src/eval/gates/checks";

const context = [{ id: "one", text: "shared quote\nfirst text" }, { id: "two", text: "shared quote\nunique evidence" }];
it("corrects only a unique verbatim match before validation and retains the original", () => {
  const original = 'Unique 【9†"unique evidence"】 ambiguous 【9†"shared quote"】 unchanged 【1†"SHARED quote"】';
  const result = assessCitations(original, context);
  expect(result.audit.original_answer).toBe(original);
  expect(result.audit.corrections).toEqual([{ marker: '【9†"unique evidence"】', replacement: '【2†"unique evidence"】', offset: 7, from: 9, to: 2 }]);
  expect(result.audit.invalid_citations).toHaveLength(1);
  expect(result.answer).toContain('【1†"SHARED quote"】');
  expect(checkCitations({ answer: result.answer, context, audit: result.audit })).toMatchObject({ total: 3, valid: 2 });
});
it("shares interpretation of mixed and malformed markers with deterministic assessment", () => {
  const answer = 'Good 【1】 【T1】 bad 【T9】 【】 【?】 【0】 【3】 【1†L2-L1】 【1†"first text"}】 end';
  const tools = [{ handle: "T1" }];
  const result = assessCitations(answer, context, tools);
  expect(result.total).toBe(9);
  expect(result.valid).toBe(2);
  expect(result.answer).toBe('Good 【1】 【T1】 bad        end');
  expect(checkCitations({ answer: result.answer, context, tool_calls: tools, audit: result.audit }).issues).toEqual(result.audit.invalid_citations);
});
it("does not swallow prose after a legacy quote closer", () => {
  expect(assessCitations('before 【1†"first text"} after 【2】', context).answer).toBe("before  after 【2】");
});
it("compares report periods with Unicode hyphens without rewriting the answer", () => {
  const original = "2026‑09‑01 to 2026‑09‑08 【T1】";
  const checked = assessCitations(original, [], [{ handle: "T1", result: { report_period: "2026-09-01 to 2026-09-08" } }]);
  expect(checked.answer).toBe(original);
  expect(checked.audit.report_periods?.[0].present).toBe(true);
});
it("does not invent evidence for legacy tool markers", () => {
  expect(checkCitations({ answer: "【T1】", context: [] })).toMatchObject({ total: 1, valid: 0 });
});

it("uses recorded tool results in figure assessment without fabricating null measurements", () => {
  expect(checkFigures({ answer: "The reading is 42.", context: [], tool_calls: [{ handle: "T1", result: { value: 42 } }] }).issues).toEqual([]);
  expect(checkFigures({ answer: "The reading is 42.", context: [], tool_calls: [{ handle: "T1", result: { value: null } }] }).issues).toHaveLength(1);
});
