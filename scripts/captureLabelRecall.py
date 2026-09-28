#!/usr/bin/env python3
"""Score the excerpts captured runs actually sent against retrieval label sets, beside correctness.

For each run, recall is the share of a turn's labelled chunks that appear in the context the capture
recorded (`eval/transcripts/<run>/warm/<arm>/*.json`), and correctness is the mean of the run's judge
passes (`data/results/judge/<run>/` and `<run with -rejudge>/`). Refusal fixtures are left out: both
label sets give them the same explicit evidence. No model calls.

    python3 scripts/captureLabelRecall.py RUN [RUN ...]
    python3 scripts/captureLabelRecall.py --pair RUN_A RUN_B   # turns where A's recall is higher, equal, lower

Label directories default to eval/retrieval-labels and eval/retrieval-labels-per-turn; pass
--labels=DIR,DIR to choose others.
"""
import glob
import json
import os
import statistics as st
import sys


def load_labels(directory):
    out = {}
    for path in glob.glob(os.path.join(directory, "*.json")):
        fixture = json.load(open(path))
        if fixture["fixtureClass"] == "refusal":
            continue
        for turn in fixture["turns"]:
            out[(fixture["fixtureId"], turn["turn"])] = {c["chunkId"] for c in turn["relevant"]}
    return out


def judge_scores(run):
    rejudge = run.replace("-2026-", "-rejudge-2026-", 1)
    scores = {}
    for name in (run, rejudge):
        path = f"data/results/judge/{name}/warm.jsonl"
        if not os.path.exists(path):
            continue
        for line in open(path):
            row = json.loads(line)
            if row.get("dimension") == "correctness":
                scores.setdefault((row["fixtureId"], row["turn"]), []).append(row["score"])
    if not scores:
        raise SystemExit(f"no correctness scores for {run}")
    return {key: st.mean(values) for key, values in scores.items()}


def contexts(run):
    out = {}
    for path in glob.glob(f"eval/transcripts/{run}/warm/*/*.json"):
        capture = json.load(open(path))
        for turn in capture["turns"]:
            out[(capture["fixtureId"], turn["index"] + 1)] = [c["id"] for c in turn["context"]]
    if not out:
        raise SystemExit(f"no transcripts for {run}")
    return out


def recall(context, relevant):
    return len(set(context) & relevant) / len(relevant)


def ranks(values):
    order = sorted(range(len(values)), key=lambda i: values[i])
    result = [0.0] * len(values)
    i = 0
    while i < len(order):
        j = i
        while j + 1 < len(order) and values[order[j + 1]] == values[order[i]]:
            j += 1
        for m in range(i, j + 1):
            result[order[m]] = (i + j) / 2
        i = j + 1
    return result


def spearman(a, b):
    return st.correlation(ranks(a), ranks(b))


def runs_report(runs, label_sets):
    names = list(label_sets)
    print(f"{'run':44}{'turns':>6}{'correct':>8}" + "".join(f"{n:>28}" for n in names))
    rows, pooled = [], {n: [] for n in names}
    for run in runs:
        scores, context = judge_scores(run), contexts(run)
        keys = [k for k in label_sets[names[0]] if k in scores and k in context]
        row = [st.mean(scores[k] for k in keys)]
        for n in names:
            row.append(st.mean(recall(context[k], label_sets[n][k]) for k in keys))
            pooled[n] += [(k, recall(context[k], label_sets[n][k]), scores[k]) for k in keys]
        rows.append(row)
        print(f"{run:44}{len(keys):>6}{row[0]:>8.2f}" + "".join(f"{r:>28.1%}" for r in row[1:]))
    for i, n in enumerate(names, 1):
        points = pooled[n]
        by_turn = {}
        for key, r, s in points:
            by_turn.setdefault(key, []).append((r, s))
        dr, ds = [], []
        for values in by_turn.values():
            mr, ms = st.mean(v[0] for v in values), st.mean(v[1] for v in values)
            dr += [v[0] - mr for v in values]
            ds += [v[1] - ms for v in values]
        run_level = spearman([r[i] for r in rows], [r[0] for r in rows]) if len(rows) > 2 else float("nan")
        print(f"\n[{n}] run-level Spearman {run_level:.2f}; turn-level Spearman "
              f"{spearman([p[1] for p in points], [p[2] for p in points]):.3f}; "
              f"within-turn Pearson {st.correlation(dr, ds) if len(rows) > 1 else float('nan'):.3f}")
        for label, lo, hi in [("none", 0, 1e-9), ("under half", 1e-9, 0.5), ("half or more", 0.5, 1 - 1e-9), ("all", 1 - 1e-9, 2)]:
            s = [p[2] for p in points if lo <= p[1] < hi]
            print(f"  recall {label:13} n={len(s):4}  mean correctness {st.mean(s) if s else float('nan'):.2f}")


def pair_report(a, b, label_sets):
    sa, sb, ca, cb = judge_scores(a), judge_scores(b), contexts(a), contexts(b)
    for n, labels in label_sets.items():
        groups = {"higher": [], "equal": [], "lower": []}
        for key, relevant in labels.items():
            ra, rb = recall(ca[key], relevant), recall(cb[key], relevant)
            group = "higher" if ra > rb else "lower" if ra < rb else "equal"
            groups[group].append(sa[key] - sb[key])
        print(f"[{n}] {a} minus {b}")
        for group, diffs in groups.items():
            print(f"  A's recall {group:7} n={len(diffs):3}  mean correctness difference {st.mean(diffs) if diffs else float('nan'):+.2f}")


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--labels=")]
    dirs = next((a.split("=", 1)[1].split(",") for a in sys.argv[1:] if a.startswith("--labels=")),
                ["eval/retrieval-labels", "eval/retrieval-labels-per-turn"])
    label_sets = {os.path.basename(d.rstrip("/")): load_labels(d) for d in dirs}
    if args and args[0] == "--pair":
        pair_report(args[1], args[2], label_sets)
    elif args:
        runs_report(args, label_sets)
    else:
        raise SystemExit(__doc__)


if __name__ == "__main__":
    main()
