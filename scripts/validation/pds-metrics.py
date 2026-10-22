#!/usr/bin/env python3
"""
Compute plagiarism-detection validation metrics from the full 45-pair evidence
table (docs/validation/plagiarism/results/all-pairs.json, produced by
repro-pds-scores.mjs and cross-checked against the engine's stored pairs).

Primary metric uses the FROZEN binary mapping:
  predicted suspicious  <=>  risk in {HIGH, MEDIUM}  <=>  combined >= 0.60
  predicted independent <=>  risk in {LOW, NONE}     <=>  combined <  0.60

A SECONDARY exploratory cutoff (LOW = 0.40) is reported separately and is NOT
the frozen primary metric (post-hoc; thresholds were frozen before the run).

Emits: results/metrics.json, results/pairs.csv
Usage: python3 scripts/validation/pds-metrics.py
"""
import csv
import json
import os
from collections import defaultdict

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
_PROVIDER = os.environ.get("AI_PROVIDER", "openai").strip().lower()
_BASE = os.path.join(ROOT, "docs", "validation", "plagiarism", "results")
# The local arm writes to results/local/ so the frozen OpenAI artefacts, which
# are the baseline being compared against, are never overwritten.
RES = os.environ.get("VALIDATION_RESULTS_DIR") or (
    os.path.join(_BASE, "local") if _PROVIDER == "local" else _BASE
)
os.makedirs(RES, exist_ok=True)


def load_pairs(path):
    """v1 artefacts are a bare array; newer runs wrap the pairs with provenance."""
    with open(path) as fh:
        data = json.load(fh)
    return data if isinstance(data, list) else data["pairs"]
SUBJECTS = ["geografi", "biologi", "agama"]


def confusion(rows, cutoff):
    TP = FP = FN = TN = 0
    for r in rows:
        pred = r["combined"] >= cutoff
        actual = r["label"] == "suspicious"
        if pred and actual: TP += 1
        elif pred and not actual: FP += 1
        elif not pred and actual: FN += 1
        else: TN += 1
    prec = TP / (TP + FP) if (TP + FP) else None
    rec = TP / (TP + FN) if (TP + FN) else None
    f1 = (2 * prec * rec / (prec + rec)) if (prec and rec) else (0.0 if (prec == 0 or rec == 0) else None)
    acc = (TP + TN) / len(rows) if rows else None
    return {"TP": TP, "FP": FP, "FN": FN, "TN": TN,
            "precision": prec, "recall": rec, "f1": f1, "accuracy": acc}


def main():
    rows = load_pairs(os.path.join(RES, "all-pairs.json"))

    metrics = {
        "design": {"pairs": len(rows), "suspicious": sum(r["label"] == "suspicious" for r in rows),
                   "independent": sum(r["label"] == "independent" for r in rows)},
        "frozen_thresholds": {"HIGH": 0.80, "MEDIUM": 0.60, "LOW": 0.40},
        "primary_cutoff": 0.60,
        "primary": {}, "secondary_low_cutoff_0.40": {},
        "per_transform_detected_at_0.60": {}, "per_transform_at_0.40": {},
        "independent_semantic_baseline": {}, "precision_at_10": None,
    }

    for subj in SUBJECTS + ["ALL"]:
        rs = rows if subj == "ALL" else [r for r in rows if r["subject"] == subj]
        metrics["primary"][subj] = confusion(rs, 0.60)
    metrics["secondary_low_cutoff_0.40"]["ALL"] = confusion(rows, 0.40)
    for subj in SUBJECTS:
        metrics["secondary_low_cutoff_0.40"][subj] = confusion([r for r in rows if r["subject"] == subj], 0.40)

    # per-transform detection (suspicious pairs only)
    for cut, key in [(0.60, "per_transform_detected_at_0.60"), (0.40, "per_transform_at_0.40")]:
        d = defaultdict(lambda: [0, 0])
        for r in rows:
            if r["label"] != "suspicious":
                continue
            d[r["transform"]][1] += 1
            if r["combined"] >= cut:
                d[r["transform"]][0] += 1
        metrics[key] = {k: {"detected": v[0], "total": v[1]} for k, v in sorted(d.items())}

    # independent-pair semantic baseline (uniformity)
    for subj in SUBJECTS:
        sem = [r["semantic"] for r in rows if r["subject"] == subj and r["label"] == "independent"]
        metrics["independent_semantic_baseline"][subj] = {
            "mean": round(sum(sem) / len(sem), 4), "min": min(sem), "max": max(sem)}

    # precision@10 (rank by combined, overall)
    top = sorted(rows, key=lambda x: -x["combined"])[:10]
    metrics["precision_at_10"] = sum(r["label"] == "suspicious" for r in top) / 10

    with open(os.path.join(RES, "metrics.json"), "w") as f:
        json.dump(metrics, f, indent=2)

    # flat per-pair CSV for the appendix
    with open(os.path.join(RES, "pairs.csv"), "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["subject", "pair", "transform", "label", "semantic", "lexical",
                    "z_semantic", "z_lexical", "combined", "risk", "predicted", "correct"])
        for r in sorted(rows, key=lambda x: (x["subject"], x["pair"])):
            w.writerow([r["subject"], r["pair"], r["transform"], r["label"], r["semantic"],
                        r["lexical"], r["z_semantic"], r["z_lexical"], r["combined"], r["risk"],
                        r["predicted"], "yes" if r["predicted"] == r["label"] else "no"])

    # console summary
    p = metrics["primary"]["ALL"]
    print("PRIMARY (frozen, combined>=0.60):")
    print(f"  ALL  TP={p['TP']} FP={p['FP']} FN={p['FN']} TN={p['TN']}  "
          f"P={p['precision']:.3f} R={p['recall']:.3f} F1={p['f1']:.3f} Acc={p['accuracy']:.3f}")
    print(f"  Precision@10={metrics['precision_at_10']:.2f}")
    print("wrote results/metrics.json, results/pairs.csv")


if __name__ == "__main__":
    main()
