#!/usr/bin/env python3
"""Consolidate every calibration/final run log into complete per-config metrics for reporting.

Parses docs/validation/automated-grading/results/{calib-*.log, final-*.log}, recomputes full
per-subject metrics for each config, and writes:
  - results/all-configs-detail.csv   (one row per answer per config: runs, median, gap, spread)
  - results/all-configs-metrics.csv  (one row per config x subject + cross-subject)
and prints a markdown comparison table.

NOTE on config v0: it ran BEFORE the score-scale fix; its logged `native` uses the naive ÷100
interpretation (which is exactly what exposed the scale bug). Treat v0 metrics as the
"pre-fix" baseline. Configs v1+ use the pinned scale=100 (consistent native).
"""
import csv
import glob
import math
import os
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
RES = ROOT / "docs/validation/automated-grading/results"

SUBJ_MAX = {"geografi": 5, "biologi": 5, "agama": 15}
SUBJ_TOL = {"geografi": 1, "biologi": 1, "agama": 2}
CONFIG_ORDER = ["v0", "v1", "v1.1", "v1.2", "v1.3", "v1.4", "final"]

HEAD_RE = re.compile(r"===\s*(geografi|biologi|agama):")
LINE_RE = re.compile(r"(\w+-S\d+)\s+run(\d+):\s+raw=(\S+)\s+native=(\S+)\s+\(guru=(\d+)\)")

def label_from_name(name):
    base = os.path.basename(name)
    m = re.match(r"(?:calib|final)-(v[\d.]+|FROZEN).*\.log", base)
    if base.startswith("final-"):
        return "final"
    return base.replace("calib-", "").replace(".log", "")

def parse_log(path):
    """-> {subject: {student: {'guru':int, 'runs':[native,...]}}}"""
    out = {}
    subj = None
    for line in Path(path).read_text(encoding="utf-8").splitlines():
        h = HEAD_RE.search(line)
        if h:
            subj = h.group(1)
            out.setdefault(subj, {})
            continue
        m = LINE_RE.search(line)
        if m and subj:
            sc, _run, _raw, native, guru = m.groups()
            nat = None if native == "None" else int(native)
            rec = out[subj].setdefault(sc, {"guru": int(guru), "runs": []})
            rec["runs"].append(nat)
    return out

def median(xs):
    a = sorted(x for x in xs if x is not None)
    if not a:
        return None
    n = len(a)
    return a[n // 2] if n % 2 else (a[n // 2 - 1] + a[n // 2]) / 2

def agama_band(s):
    if s is None: return None
    return "SB" if s >= 13 else "B" if s >= 10 else "C" if s >= 7 else "K"

def metrics(records, subj):
    """records: {student:{guru,runs}} -> dict of metrics"""
    rows = []
    for sc, r in records.items():
        med = median(r["runs"])
        valid = [x for x in r["runs"] if x is not None]
        spread = (max(valid) - min(valid)) if valid else None
        rows.append((sc, r["guru"], med, spread, r["runs"]))
    gaps = [med - g for _, g, med, _, _ in rows if med is not None]
    n = len(gaps)
    mae = sum(abs(x) for x in gaps) / n
    rmse = math.sqrt(sum(x * x for x in gaps) / n)
    exact = sum(1 for _, g, med, _, _ in rows if med == g) / n
    w1 = sum(1 for _, g, med, _, _ in rows if med is not None and abs(med - g) <= 1) / n
    w2 = sum(1 for _, g, med, _, _ in rows if med is not None and abs(med - g) <= 2) / n
    spreads = [s for _, _, _, s, _ in rows if s is not None]
    band = None
    if subj == "agama":
        band = sum(1 for _, g, med, _, _ in rows if agama_band(med) == agama_band(g)) / n
    return {
        "n": n, "MAE": round(mae, 2), "RMSE": round(rmse, 2),
        "exact_pct": round(exact * 100), "within1_pct": round(w1 * 100), "within2_pct": round(w2 * 100),
        "band_acc_pct": round(band * 100) if band is not None else "",
        "spread_mean": round(sum(spreads) / len(spreads), 2) if spreads else 0,
        "spread_max": max(spreads) if spreads else 0,
        "rows": rows,
    }

def main():
    logs = sorted(glob.glob(str(RES / "calib-*.log")) + glob.glob(str(RES / "final-*.log")))
    configs = {}  # label -> {subject: parsed}
    for lg in logs:
        configs[label_from_name(lg)] = parse_log(lg)

    detail_rows, metric_rows = [], []
    for label in [c for c in CONFIG_ORDER if c in configs] + [c for c in configs if c not in CONFIG_ORDER]:
        data = configs[label]
        norm_gaps = []
        for subj in ["geografi", "biologi", "agama"]:
            if subj not in data or not data[subj]:
                continue
            mx = SUBJ_MAX[subj]
            mt = metrics(data[subj], subj)
            metric_rows.append({
                "config": label, "subject": subj, "max": mx, "n": mt["n"],
                "MAE": mt["MAE"], "RMSE": mt["RMSE"], "exact_%": mt["exact_pct"],
                "within±1_%": mt["within1_pct"], "within±2_%": mt["within2_pct"],
                "band_acc_%": mt["band_acc_pct"], "spread_mean": mt["spread_mean"], "spread_max": mt["spread_max"],
            })
            for sc, g, med, spread, runs in mt["rows"]:
                detail_rows.append({
                    "config": label, "subject": subj, "student": sc, "max": mx,
                    "guru": g, "median_native": med, "gap": (med - g) if med is not None else "",
                    "spread": spread, "runs": "|".join(str(x) for x in runs),
                })
                if med is not None:
                    norm_gaps.append(med / mx * 100 - g / mx * 100)
        if norm_gaps:
            nmae = sum(abs(x) for x in norm_gaps) / len(norm_gaps)
            nrmse = math.sqrt(sum(x * x for x in norm_gaps) / len(norm_gaps))
            metric_rows.append({
                "config": label, "subject": "CROSS (norm 0-100)", "max": 100, "n": len(norm_gaps),
                "MAE": round(nmae, 2), "RMSE": round(nrmse, 2), "exact_%": "", "within±1_%": "",
                "within±2_%": "", "band_acc_%": "", "spread_mean": "", "spread_max": "",
            })

    with (RES / "all-configs-metrics.csv").open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=list(metric_rows[0].keys())); w.writeheader(); w.writerows(metric_rows)
    with (RES / "all-configs-detail.csv").open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=list(detail_rows[0].keys())); w.writeheader(); w.writerows(detail_rows)

    # markdown table to stdout
    print("| config | subject | n | MAE | RMSE | exact% | ±1% | ±2% | band% | spread(mean/max) |")
    print("|---|---|---|---|---|---|---|---|---|---|")
    for r in metric_rows:
        sp = f"{r['spread_mean']}/{r['spread_max']}" if r["spread_mean"] != "" else ""
        print(f"| {r['config']} | {r['subject']} | {r['n']} | {r['MAE']} | {r['RMSE']} | "
              f"{r['exact_%']} | {r['within±1_%']} | {r['within±2_%']} | {r['band_acc_%']} | {sp} |")
    print(f"\nwrote {(RES/'all-configs-metrics.csv').relative_to(ROOT)} and all-configs-detail.csv")

if __name__ == "__main__":
    main()
