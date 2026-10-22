#!/usr/bin/env python3
"""Compute validation metrics from a run-grading results file.

Usage: python3 scripts/validation/metrics.py --set calib   (reads results-<set>.json)

Per subject (native scale): MAE, RMSE, exact-match, within-tolerance, inter-run consistency,
plus band/category accuracy for Agama. Cross-subject: normalize to 0-100, pooled MAE/RMSE.
Targets (0-100): MAE <= 10, RMSE <= 15.
"""
import argparse
import os
import json
import math
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]

def agama_band(score):
    if score is None: return None
    if score >= 13: return "Sangat Baik (13-15)"
    if score >= 10: return "Baik (10-12)"
    if score >= 7: return "Cukup (7-9)"
    return "Kurang (<7)"

def stats(gaps):
    n = len(gaps)
    mae = sum(abs(g) for g in gaps) / n
    rmse = math.sqrt(sum(g * g for g in gaps) / n)
    return mae, rmse

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--set", default="calib")
    ap.add_argument("--file", default=None)
    args = ap.parse_args()
    # The local arm writes to results/local/ so the frozen OpenAI artefacts —
    # the baseline these numbers are compared against — are never overwritten.
    provider = os.environ.get("AI_PROVIDER", "openai").strip().lower()
    base = ROOT / "docs/validation/automated-grading/results"
    results_dir = Path(os.environ["VALIDATION_RESULTS_DIR"]) if os.environ.get("VALIDATION_RESULTS_DIR") \
        else (base / "local" if provider == "local" else base)
    path = Path(args.file) if args.file else results_dir / f"results-{args.set}.json"
    data = json.loads(path.read_text(encoding="utf-8"))

    print(f"\n=== METRICS — set={data['set']} config={data['config_label']} runs={data['runs']} ===")
    print(f"source: {path.relative_to(ROOT)}\n")

    norm_gaps = []          # cross-subject normalized 0-100
    all_large = []

    for subj, blk in data["subjects"].items():
        recs = [r for r in blk["records"] if r["median_native"] is not None]
        miss = len(blk["records"]) - len(recs)
        maxs, tol = blk["max_score"], blk["tolerance"]
        gaps = [r["gap_native"] for r in recs]
        mae, rmse = stats(gaps)
        exact = sum(1 for r in recs if r["median_native"] == r["score_teacher"]) / len(recs)
        within = sum(1 for r in recs if abs(r["gap_native"]) <= tol) / len(recs)
        spreads = [r["spread_native"] for r in recs if r["spread_native"] is not None]
        mean_spread = sum(spreads) / len(spreads) if spreads else 0
        max_spread = max(spreads) if spreads else 0

        print(f"── {subj} (max {maxs}, native) — n={len(recs)}" + (f"  [{miss} failed]" if miss else ""))
        print(f"   MAE={mae:.2f}  RMSE={rmse:.2f}  exact={exact*100:.0f}%  within±{tol}={within*100:.0f}%")
        print(f"   inter-run spread (native): mean={mean_spread:.2f}  max={max_spread}")
        if subj == "agama":
            cat = sum(1 for r in recs if agama_band(r["median_native"]) == agama_band(r["score_teacher"])) / len(recs)
            print(f"   band/category accuracy={cat*100:.0f}%")
        # collect normalized + large gaps
        for r in recs:
            norm_gaps.append(r["median_native"] / maxs * 100 - r["score_teacher"] / maxs * 100)
            all_large.append((abs(r["gap_native"]), subj, r["student_code"], r["score_teacher"], r["median_native"], r["runs_native"]))
        print()

    if norm_gaps:
        nmae, nrmse = stats(norm_gaps)
        ok = "PASS" if (nmae <= 10 and nrmse <= 15) else "REVIEW"
        print(f"── CROSS-SUBJECT (normalized 0-100) — n={len(norm_gaps)}")
        print(f"   MAE={nmae:.2f} (target ≤10)  RMSE={nrmse:.2f} (target ≤15)  → {ok}\n")

    all_large.sort(reverse=True)
    print("── Largest gaps (native) — candidates for case analysis:")
    for absg, subj, code, t, m, runs in all_large[:8]:
        print(f"   {subj:9s} {code:9s} guru={t} median_AI={m} gap={m-t:+d} runs={runs}")

if __name__ == "__main__":
    main()
