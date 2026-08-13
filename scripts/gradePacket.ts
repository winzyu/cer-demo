/**
 * Builds the blind grading packet from captured transcripts.
 *
 * `RETRIEVAL_BAKEOFF.md` §7b requires grading to run over saved transcripts with **arm labels
 * stripped and order randomized**, so neither a human nor a judge model can tell which retrieval
 * strategy produced an answer. This script is what makes that possible: it emits one markdown
 * sheet per fixture with the three arms' answers relabelled `A`/`B`/`C`, shuffled independently
 * per fixture, plus the context each answer was actually given — without which groundedness
 * cannot be graded at all (§7a).
 *
 *   npm run grade:packet                 # build from eval/transcripts/warm
 *   npm run grade:packet -- --pass=cold
 *   npm run grade:packet -- --sample=6   # only the calibration subset
 *
 * Outputs under `eval/grading/<pass>/`:
 *
 *   packet/<fixture>.md      what the judge reads
 *   context/<fixture>/…txt   full context per answer, referenced from the sheet
 *   scores.csv               the sheet the judge fills in
 *   KEY.json                 label → arm. **The judge must not open this.**
 *
 * The shuffle is seeded from the fixture id, so re-running produces the same packet rather than
 * a new random assignment that would invalidate scores already collected against the old one.
 */

import { promises as fs } from "fs";
import path from "path";
import { loadFixtures } from "../src/eval/fixtures";

const ARMS = ["firestore-direct", "pgvector-rag", "firestore-vector"] as const;
const LABELS = ["A", "B", "C"] as const;

interface Args { pass: string; sample?: number; outRoot: string; }

const parseArgs = (argv: string[]): Args => {
  const args: Args = { pass: "warm", outRoot: path.join(process.cwd(), "eval", "grading") };
  argv.forEach((arg) => {
    const [flag, value] = [arg.split("=")[0], arg.split("=").slice(1).join("=")];
    if (flag === "--pass") args.pass = value;
    else if (flag === "--sample") args.sample = Number(value);
    else if (flag === "--out") args.outRoot = path.resolve(value);
    else throw new Error(`Unknown argument: ${arg}`);
  });
  if (!["cold", "warm"].includes(args.pass)) {
    throw new Error(`--pass must be cold or warm (got "${args.pass}")`);
  }
  return args;
};

/** FNV-1a. Cheap, and it avalanches — `id * 31` does not, for short similar strings. */
const hashSeed = (input: string): number => {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
};

/** mulberry32 — small, well-distributed, and deterministic from a seed. */
const rngFrom = (seed: number): (() => number) => {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

/**
 * Deterministic per-fixture shuffle.
 *
 * Seeded from the fixture id rather than `Math.random` so the packet is reproducible: a judge
 * who has already scored half the set must not have the labels move under them on a rebuild.
 *
 * **The distribution is load-bearing, not cosmetic.** The first implementation used
 * `seed * 31 + charCode` with an LCG, which put `pgvector-rag` at label A in 22 of 28 sheets and
 * `firestore-direct` at A in none. A judge grading a handful of sheets would have learned "A is
 * the one that refuses" and the blinding would have been worthless — while the packet still
 * looked correctly shuffled. `unit/gradePacket.test.ts` asserts the balance for that reason.
 */
const shuffleFor = (fixtureId: string): readonly string[] => {
  const random = rngFrom(hashSeed(fixtureId));
  const order = [...ARMS] as string[];
  for (let i = order.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  return order;
};

export const __testing = { shuffleFor, hashSeed };

interface Turn {
  index: number; question: string; answer: string;
  context?: Array<{ id: string; source: string; score?: number; text?: string }>;
  usage?: { promptTokens?: number; completionTokens?: number };
}

const readTranscript = async (
  root: string, pass: string, arm: string, fixtureId: string,
): Promise<{ turns: Turn[] } | null> => {
  const file = path.join(root, pass, arm, `${fixtureId}.json`);
  try {
    return JSON.parse(await fs.readFile(file, "utf8")) as { turns: Turn[] };
  } catch {
    return null;
  }
};

const bullets = (items: string[] | undefined, prefix: string): string => (
  (items ?? []).map((i) => `${prefix} ${i}`).join("\n")
);

const main = async (): Promise<void> => {
  const args = parseArgs(process.argv.slice(2));
  const transcriptRoot = path.join(process.cwd(), "eval", "transcripts");
  const outRoot = path.join(args.outRoot, args.pass);
  const packetDir = path.join(outRoot, "packet");
  const contextDir = path.join(outRoot, "context");

  const fixtures = loadFixtures().filter((f) => f.runnable);
  // Sorted so --sample takes a stable subset rather than a different one each run.
  const selected = [...fixtures].sort((a, b) => a.id.localeCompare(b.id))
    .slice(0, args.sample ?? fixtures.length);

  await fs.mkdir(packetDir, { recursive: true });

  const key: Record<string, Record<string, string>> = {};
  const scoreRows: string[] = ["fixture,class,turn,label,correctness_0_1_2,ungrounded_claims,invalid_citations,notes"];
  let written = 0;

  for (const fixture of selected) {
    const order = shuffleFor(fixture.id);
    key[fixture.id] = Object.fromEntries(LABELS.map((l, i) => [l, order[i]]));

    // eslint-disable-next-line no-await-in-loop
    const transcripts = await Promise.all(
      order.map((arm) => readTranscript(transcriptRoot, args.pass, arm, fixture.id)),
    );
    if (transcripts.some((t) => t === null)) {
      process.stdout.write(`  skip ${fixture.id} — missing transcript for one or more arms\n`);
      continue;
    }

    const lines: string[] = [
      `# ${fixture.id}`,
      "",
      `**Class:** \`${fixture.class}\` · **Turns:** ${fixture.turns.length}`,
      "",
      "> Answers below are labelled A/B/C in an order specific to this fixture. The same letter",
      "> means a **different** system on another sheet. Do not compare letters across fixtures.",
      "",
    ];

    for (let ti = 0; ti < fixture.turns.length; ti += 1) {
      const turnSpec = fixture.turns[ti];
      lines.push("---", "", `## Turn ${ti + 1}`, "", `**Question:** ${turnSpec.content}`, "");
      lines.push("### Rubric", "");
      lines.push("**Must contain**", bullets(turnSpec.rubric.must_contain, "-"), "");
      if (turnSpec.rubric.must_not?.length) {
        lines.push("**Must not**", bullets(turnSpec.rubric.must_not, "-"), "");
      }
      if (turnSpec.rubric.cite?.length) {
        lines.push("**Should cite**", bullets(turnSpec.rubric.cite, "-"), "");
      }
      if (turnSpec.rubric.notes) lines.push(`**Notes:** ${turnSpec.rubric.notes}`, "");

      for (let ai = 0; ai < LABELS.length; ai += 1) {
        const label = LABELS[ai];
        const turn = transcripts[ai]!.turns.find((t) => t.index === ti);
        lines.push(`### Answer ${label}`, "");
        if (!turn || !turn.answer) {
          lines.push("_(no answer recorded for this turn)_", "");
        } else {
          lines.push(turn.answer.trim(), "");
          const sources = [...new Set((turn.context ?? []).map((c) => c.source))];
          const ctxName = `${fixture.id}/turn${ti + 1}-${label}.txt`;
          lines.push(
            `<sub>Context supplied: ${(turn.context ?? []).length} chunk(s) from `
            + `${sources.length} document(s) — ${sources.join(", ") || "none"}. `
            + `Full text: \`context/${ctxName}\`</sub>`,
            "",
          );
          const body = (turn.context ?? [])
            .map((c) => `### ${c.source} (chunk ${c.id}${c.score !== undefined ? `, score ${c.score}` : ""})\n\n${c.text ?? ""}`)
            .join("\n\n---\n\n");
          // eslint-disable-next-line no-await-in-loop
          await fs.mkdir(path.join(contextDir, fixture.id), { recursive: true });
          // eslint-disable-next-line no-await-in-loop
          await fs.writeFile(path.join(contextDir, fixture.id, `turn${ti + 1}-${label}.txt`), body, "utf8");
        }
        scoreRows.push(`${fixture.id},${fixture.class},${ti + 1},${label},,,,`);
      }
    }

    // eslint-disable-next-line no-await-in-loop
    await fs.writeFile(path.join(packetDir, `${fixture.id}.md`), `${lines.join("\n")}\n`, "utf8");
    written += 1;
  }

  await fs.writeFile(path.join(outRoot, "scores.csv"), `${scoreRows.join("\n")}\n`, "utf8");
  await fs.writeFile(
    path.join(outRoot, "KEY.json"),
    `${JSON.stringify({
      note: "Label -> arm mapping. DO NOT open before grading is complete and scores.csv is filled in.",
      pass: args.pass,
      generatedAt: new Date().toISOString(),
      key,
    }, null, 2)}\n`,
    "utf8",
  );

  process.stdout.write(
    `\nPacket written: ${written} fixture sheet(s) -> ${path.relative(process.cwd(), packetDir)}\n`
    + `Score sheet:    ${path.relative(process.cwd(), path.join(outRoot, "scores.csv"))} (${scoreRows.length - 1} rows)\n`
    + `Key:            ${path.relative(process.cwd(), path.join(outRoot, "KEY.json"))} — do not open until scoring is done\n\n`
    + "Grading instructions: docs/GRADING_GUIDE.md\n",
  );
};

// Guarded so the shuffle can be unit-tested by importing this module without building a packet.
if (require.main === module) {
  main().catch((error: Error) => {
    process.stderr.write(`\nPacket build failed: ${error.message}\n`);
    process.exit(1);
  });
}
