#!/usr/bin/env python3
"""Metrics for the local-v2 calibration study.

Usage:
  python3 scripts/validation/local-v2-metrics.py <results.json> [<results.json> ...] [--json out.json]

One results file = one config. Several files are printed side by side so
calibration iterations can be compared on identical answers.

Per subject (native scale): n, MAE, RMSE, signed bias, exact, within tolerance,
the AI's distinct scores, QWK, Spearman rho, and the best-constant baseline. A
high within-tolerance rate on a /5 scale is not evidence of grading skill on its
own, so QWK and the constant baseline are the honest discrimination tests.
Cross-subject: MAE/RMSE on the normalized 0-100 scale.

agreement and constant-baseline logic ported from the Fork worktree's
final-test-metrics.py (agreement_stats / trivial_baseline) so local-v2 reports
the same statistics as the frozen OpenAI final test.
"""
import argparse
import json
import math
from pathlib import Path


def qwk(a, t, maxs):
    k = maxs + 1
    O = [[0] * k for _ in range(k)]
    for x, y in zip(a, t):
        O[x][y] += 1
    ha = [a.count(i) for i in range(k)]
    hb = [t.count(i) for i in range(k)]
    n = len(a)
    num = den = 0.0
    for i in range(k):
        for j in range(k):
            w = ((i - j) ** 2) / ((k - 1) ** 2)
            num += w * O[i][j]
            den += w * ha[i] * hb[j] / n
    return None if den == 0 else 1 - num / den


def ranks(v):
    order = sorted(range(len(v)), key=lambda i: v[i])
    r = [0.0] * len(v)
    i = 0
    while i < len(order):
        j = i
        while j + 1 < len(order) and v[order[j + 1]] == v[order[i]]:
            j += 1
        for q in range(i, j + 1):
            r[order[q]] = (i + j) / 2 + 1
        i = j + 1
    return r


def pearson(x, y):
    mx, my = sum(x) / len(x), sum(y) / len(y)
    d = math.sqrt(sum((u - mx) ** 2 for u in x) * sum((v - my) ** 2 for v in y))
    return None if d == 0 else sum((u - mx) * (v - my) for u, v in zip(x, y)) / d


def subject_metrics(records, maxs, tol):
    recs = [r for r in records if r["median_native"] is not None]
    if not recs:
        return None
    # Medians of an even run count can be x.5; QWK needs integer categories.
    a = [int(round(r["median_native"])) for r in recs]
    t = [r["score_teacher"] for r in recs]
    gaps = [x - y for x, y in zip(a, t)]
    n = len(recs)
    best_c, best_mae = min(((c, sum(abs(c - y) for y in t) / n) for c in range(maxs + 1)), key=lambda z: z[1])
    ai_mae = sum(abs(g) for g in gaps) / n
    q = qwk(a, t, maxs)
    rho = pearson(ranks(a), ranks(t))
    return {
        "n": n,
        "MAE": round(ai_mae, 3),
        "RMSE": round(math.sqrt(sum(g * g for g in gaps) / n), 3),
        "bias": round(sum(gaps) / n, 3),
        "exact_pct": round(sum(1 for g in gaps if g == 0) / n * 100, 1),
        "within_tol_pct": round(sum(1 for g in gaps if abs(g) <= tol) / n * 100, 1),
        "ai_scores": sorted(set(a)),
        "QWK": None if q is None else round(q, 3),
        "spearman": None if rho is None else round(rho, 3),
        "best_constant": best_c,
        "constant_MAE": round(best_mae, 3),
        "beats_constant": ai_mae < best_mae - 1e-9,
        "nulls": len(records) - n,
    }


def file_metrics(path):
    data = json.loads(Path(path).read_text())
    out = {"file": str(path), "label": data.get("config_label"), "set": data.get("set"), "subjects": {}}
    norm_gaps = []
    for subj, s in data["subjects"].items():
        m = subject_metrics(s["records"], s["max_score"], s["tolerance"])
        out["subjects"][subj] = m
        for r in s["records"]:
            if r["median_native"] is not None:
                norm_gaps.append((r["median_native"] - r["score_teacher"]) / s["max_score"] * 100)
    if norm_gaps:
        out["cross_norm_MAE"] = round(sum(abs(g) for g in norm_gaps) / len(norm_gaps), 2)
        out["cross_norm_RMSE"] = round(math.sqrt(sum(g * g for g in norm_gaps) / len(norm_gaps)), 2)
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("files", nargs="+")
    ap.add_argument("--json", default=None)
    args = ap.parse_args()
    results = [file_metrics(f) for f in args.files]

    cols = ["n", "MAE", "bias", "exact_pct", "within_tol_pct", "QWK", "spearman", "constant_MAE", "ai_scores"]
    for res in results:
        print(f"\n## {res['label']}  ({Path(res['file']).name}, set={res['set']})")
        print("subject   " + "  ".join(f"{c:>14}" for c in cols))
        for subj, m in res["subjects"].items():
            if m is None:
                print(f"{subj:<10}  (no scored records)")
                continue
            print(f"{subj:<10}" + "  ".join(f"{str(m[c]):>14}" for c in cols))
        print(f"cross-subject normalized: MAE {res.get('cross_norm_MAE')}  RMSE {res.get('cross_norm_RMSE')}")

    if args.json:
        Path(args.json).write_text(json.dumps(results, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
