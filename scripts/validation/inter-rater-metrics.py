#!/usr/bin/env python3
"""Teacher-vs-teacher agreement, and the AI measured against each teacher.

Usage:
  python3 scripts/validation/inter-rater-metrics.py [--ai results.json ...] [--part A|B|all] [--json out.json]

Reads teacher 1 from dataset.json and teacher 2 from second-rater/scores.json.
The teacher-1 vs teacher-2 numbers are the human ceiling: an AI whose error
against teacher 1 is within the two teachers' disagreement grades as
consistently as a second human would. Each --ai file (run-grading output) is
also scored against teacher 2 and against the rounded teacher mean. All rows
are restricted to answers both teachers scored, so they share one denominator.
"""
import argparse
import importlib.util
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
AG = ROOT / "docs/validation/automated-grading"

# Reuse the exact agreement maths of the study metrics.
_spec = importlib.util.spec_from_file_location("lv2", Path(__file__).with_name("local-v2-metrics.py"))
lv2 = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(lv2)


def agreement(a, b, maxs, tol):
    pairs = [(x, y) for x, y in zip(a, b) if x is not None and y is not None]
    if not pairs:
        return None
    a, b = [p[0] for p in pairs], [p[1] for p in pairs]
    gaps = [x - y for x, y in pairs]
    n = len(pairs)
    q = lv2.qwk(a, b, maxs)
    rho = lv2.pearson(lv2.ranks(a), lv2.ranks(b))
    return {
        "n": n,
        "MAE": round(sum(abs(g) for g in gaps) / n, 3),
        "bias": round(sum(gaps) / n, 3),
        "exact_pct": round(sum(1 for g in gaps if g == 0) / n * 100, 1),
        "within_tol_pct": round(sum(1 for g in gaps if abs(g) <= tol) / n * 100, 1),
        "QWK": None if q is None else round(q, 3),
        "spearman": None if rho is None else round(rho, 3),
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--ai", nargs="*", default=[])
    ap.add_argument("--part", default="A", choices=["A", "B", "all", "heldout"],
                    help="A = calib+final, B = pool, heldout = final+pool (never used for local-v2 selection)")
    ap.add_argument("--json", default=None)
    args = ap.parse_args()

    dataset = json.loads((AG / "dataset.json").read_text())["subjects"]
    t2 = json.loads((AG / "second-rater/scores.json").read_text())["subjects"]
    manifest = json.loads((AG / "second-rater/manifest.json").read_text())["subjects"]
    ai_runs = [json.loads(Path(f).read_text()) for f in args.ai]

    report = {}
    for subj, s in dataset.items():
        m = manifest[subj]
        if args.part == "heldout":
            codes = [a["student_code"] for a in s["answers"] if a["set"] in ("final", "pool")]
        else:
            codes = m["part_a"] if args.part == "A" else m["part_b"] if args.part == "B" else m["part_a"] + m["part_b"]
        t1 = {a["student_code"]: a["score_teacher"] for a in s["answers"]}
        # Every comparison uses the same answers: those both teachers scored.
        # Otherwise an AI-vs-teacher-1 row would cover answers teacher 2 skipped
        # and could not be read against the teacher-vs-teacher ceiling.
        codes = [c for c in codes if t2[subj]["scores"].get(c) is not None]
        v1 = [t1[c] for c in codes]
        v2 = [t2[subj]["scores"].get(c) for c in codes]
        mean = [None if y is None else int(round((x + y) / 2 + 1e-9)) for x, y in zip(v1, v2)]
        row = {"teacher1_vs_teacher2": agreement(v2, v1, s["max_score"], s["tolerance"])}
        for run in ai_runs:
            recs = {r["student_code"]: r["median_native"] for r in run["subjects"].get(subj, {}).get("records", [])}
            ai = [None if recs.get(c) is None else int(round(recs[c])) for c in codes]
            label = run.get("config_label", "ai")
            row[f"{label}_vs_teacher1"] = agreement(ai, v1, s["max_score"], s["tolerance"])
            row[f"{label}_vs_teacher2"] = agreement(ai, v2, s["max_score"], s["tolerance"])
            row[f"{label}_vs_mean"] = agreement(ai, mean, s["max_score"], s["tolerance"])
        report[subj] = row

    cols = ["n", "MAE", "bias", "exact_pct", "within_tol_pct", "QWK", "spearman"]
    for subj, row in report.items():
        print(f"\n## {subj} (part {args.part})")
        print(f"{'comparison':<34}" + "".join(f"{c:>15}" for c in cols))
        for name, m in row.items():
            if m is None:
                print(f"{name:<34}  (no overlapping scores)")
                continue
            print(f"{name:<34}" + "".join(f"{str(m[c]):>15}" for c in cols))

    if args.json:
        Path(args.json).write_text(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
