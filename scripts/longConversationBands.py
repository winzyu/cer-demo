#!/usr/bin/env python3
"""Correctness by conversation position for the long-conversation fixtures.

Usage: python3 scripts/longConversationBands.py JUDGE_RUN... [--fixtures=eval/fixtures-long]

Each JUDGE_RUN names data/results/judge/<run>/; with several runs a turn's score is the mean of its
passes. Turn roles come from the "Turn roles:" line in each fixture's notes (eval/fixtures-long/_BRIEF.md).
Bands, as fixed before the capture in docs/EVAL_REBUILD.md:
  early           turns with role early (turns 1-3)
  late            turns 9-12, excluding capped-back-reference and refusal turns
  back-reference  turns with a back-reference(n) role
  capped          turns with a capped-back-reference(n) role, reported apart
Refusal turns are left out of every band and listed on their own. No model calls.
"""
import glob
import json
import os
import re
import statistics as st
import sys

ROLE_LINE = re.compile(r"Turn roles:\s*(.+?)\.?\s*$", re.M)


def turn_roles(fixture_dir):
    out = {}
    for path in sorted(glob.glob(os.path.join(fixture_dir, "*.json"))):
        fixture = json.load(open(path))
        match = ROLE_LINE.search(fixture["notes"])
        if not match:
            sys.exit(f"{path}: no 'Turn roles:' line in notes")
        for entry in match.group(1).split(";"):
            turn, roles = entry.strip().split("=", 1)
            out[(fixture["id"], int(turn))] = roles.strip().split("+")
        missing = [i + 1 for i in range(len(fixture["turns"])) if (fixture["id"], i + 1) not in out]
        if missing:
            sys.exit(f"{path}: turn roles missing for turns {missing}")
    return out


def scores(runs):
    by_turn = {}
    for run in runs:
        for path in glob.glob(os.path.join("data/results/judge", run, "*.jsonl")):
            for line in open(path):
                row = json.loads(line)
                if row.get("dimension") == "correctness" and row.get("score") is not None:
                    by_turn.setdefault((row["fixtureId"], row["turn"]), []).append(row["score"])
    return {key: st.mean(values) for key, values in by_turn.items()}


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    fixture_dir = next((a.split("=", 1)[1] for a in sys.argv[1:] if a.startswith("--fixtures=")),
                       "eval/fixtures-long")
    if not args:
        sys.exit(__doc__)
    roles = turn_roles(fixture_dir)
    score = scores(args)
    missing = sorted(set(roles) - set(score))
    if missing:
        print(f"warning: {len(missing)} turns have no score: {missing[:5]}")

    def has(key, prefix):
        return any(r.startswith(prefix) for r in roles[key])

    bands = {
        "early": [k for k in roles if has(k, "early") and not has(k, "refusal")],
        "late (9-12)": [k for k in roles if k[1] >= 9 and not has(k, "capped") and not has(k, "refusal")],
        "back-reference": [k for k in roles if has(k, "back-reference(") and not has(k, "refusal")],
        "capped back-reference": [k for k in roles if has(k, "capped")],
        "switch": [k for k in roles if has(k, "switch")],
        "return": [k for k in roles if has(k, "return")],
        "cross-document": [k for k in roles if has(k, "cross-document")],
        "all non-refusal": [k for k in roles if not has(k, "refusal")],
    }
    print(f"{'band':24} {'turns':>5} {'mean':>6}")
    for name, keys in bands.items():
        values = [score[k] for k in keys if k in score]
        mean = f"{st.mean(values):.2f}" if values else "-"
        print(f"{name:24} {len(values):>5} {mean:>6}")
    early = st.mean([score[k] for k in bands["early"] if k in score])
    for name in ("late (9-12)", "back-reference"):
        values = [score[k] for k in bands[name] if k in score]
        print(f"gap early - {name}: {early - st.mean(values):+.2f}")

    print("\nby turn index")
    for turn in range(1, 1 + max(k[1] for k in roles)):
        values = [v for k, v in score.items() if k[1] == turn and k in roles and not has(k, "refusal")]
        print(f"  turn {turn:>2}: {st.mean(values):.2f} (n={len(values)})" if values else f"  turn {turn:>2}: -")

    refusals = [k for k in roles if has(k, "refusal")]
    for key in refusals:
        print(f"refusal {key[0]} t{key[1]}: {score.get(key, '-')}")


if __name__ == "__main__":
    main()
