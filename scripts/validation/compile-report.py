#!/usr/bin/env python3
"""Compile a complete, persisted calibration+final report from the run logs.

Reads results/*.log (one per config), recomputes per-subject + cross-subject metrics
consistently, and emits for the thesis report:
  report/calibration-per-answer.csv   (every answer, every config: guru, runs, median, gap)
  report/calibration-metrics.csv      (per config x subject + cross-subject)
  report/CALIBRATION-LOG.md           (narrative: what changed each config + metric tables)

Metrics use the native score AS SHOWN in the logs (i.e. exactly what each config produced).
v0 is flagged invalid (score-scale bug — see note).
"""
import csv
import json
import math
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
RES = ROOT / "docs/validation/automated-grading/results"
OUT = ROOT / "docs/validation/automated-grading/report"
DATASET = ROOT / "docs/validation/automated-grading/dataset.json"

SUBJ = {"GEO": ("geografi", 5, 1), "BIO": ("biologi", 5, 1), "AGM": ("agama", 15, 2)}

# config -> (log file, what-changed description, valid?)
CONFIGS = [
    ("v0", "calib-v0.log", "Baseline: gpt-4o-mini, default prompt, rubric max_score=native(5/15).", False),
    ("v1", "calib-v1.log", "FIX scale ambiguity: pin rubric max_score=100 (model now scores 0-100 consistently).", True),
    ("v1.1", "calib-v1.1.log", "Agama grounding nudge: strengthen band guidance + narrow irrelevance veto (Agama only; Geo/Bio unchanged from v1).", True),
    ("v1.2", "calib-v1.2.log", "Lenient system prompt: explicit generous 0-100 bands, narrowed veto.", True),
    ("v1.3", "calib-v1.3.log", "Switch model -> gpt-5.4-nano + prompt top-band nudge (award 95-100 for clearly correct answers).", True),
    ("v1.4", "calib-v1.4.log", "Revert model -> gpt-4o-mini, keep top-band nudge. >>> FROZEN config v1.4.", True),
    ("final", "final-v1.4.log", "Held-out FINAL test on frozen v1.4, 9/subject x 3 runs (median).", True),
]

LINE = re.compile(r"^\s*([A-Z]+)-S(\d+)\s+run(\d+):\s+raw=(-?\d+)\s+native=(-?\d+)\s+\(guru=(-?\d+)\)")

def band(s):
    if s >= 13: return "SangatBaik"
    if s >= 10: return "Baik"
    if s >= 7: return "Cukup"
    return "Kurang"

def median(xs):
    a = sorted(xs); n = len(a); m = n // 2
    return a[m] if n % 2 else (a[m - 1] + a[m]) / 2

def parse_log(path):
    """-> {subj_prefix: {student: {'guru':g, 'runs':{run:native}}}}"""
    data = {}
    for ln in path.read_text(encoding="utf-8").splitlines():
        m = LINE.match(ln)
        if not m: continue
        pre, sid, run, raw, native, guru = m.group(1), m.group(2), int(m.group(3)), int(m.group(4)), int(m.group(5)), int(m.group(6))
        code = f"{pre}-S{sid}"
        d = data.setdefault(pre, {}).setdefault(code, {"guru": guru, "runs": {}})
        d["runs"][run] = native
    return data

def subj_metrics(students, max_score, tol):
    rows = []
    for code, d in students.items():
        natives = list(d["runs"].values())
        med = median(natives)
        rows.append((code, d["guru"], natives, med, med - d["guru"], max(natives) - min(natives)))
    n = len(rows)
    gaps = [r[4] for r in rows]
    mae = sum(abs(g) for g in gaps) / n
    rmse = math.sqrt(sum(g * g for g in gaps) / n)
    exact = sum(1 for r in rows if r[3] == r[1]) / n
    within = sum(1 for r in rows if abs(r[4]) <= tol) / n
    spreads = [r[5] for r in rows]
    m = {"n": n, "MAE": mae, "RMSE": rmse, "exact": exact, "within": within,
         "tol": tol, "spread_mean": sum(spreads) / n, "spread_max": max(spreads)}
    if max_score == 15:
        m["band_acc"] = sum(1 for r in rows if band(round(r[3])) == band(r[1])) / n
    return m, rows

def main():
    OUT.mkdir(exist_ok=True)
    dataset = json.loads(DATASET.read_text(encoding="utf-8"))["subjects"]
    set_of = {a["student_code"]: a["set"] for s in dataset.values() for a in s["answers"]}

    per_answer = []        # rows for CSV
    metrics_rows = []      # rows for metrics CSV
    compiled = {}          # config -> subj -> metrics

    for cfg, fname, desc, valid in CONFIGS:
        path = RES / fname
        if not path.exists():
            continue
        parsed = parse_log(path)
        compiled[cfg] = {}
        norm_gaps = []
        for pre, (subj, mx, tol) in SUBJ.items():
            if pre not in parsed:
                continue
            m, rows = subj_metrics(parsed[pre], mx, tol)
            compiled[cfg][subj] = m
            for code, guru, natives, med, gap, spread in rows:
                per_answer.append({
                    "config": cfg, "subject": subj, "student": code,
                    "set": set_of.get(code, "?"), "guru": guru, "max_score": mx,
                    "runs_native": "|".join(map(str, natives)), "median_native": med,
                    "gap": gap, "spread": spread,
                })
                norm_gaps.append(med / mx * 100 - guru / mx * 100)
            mrow = {"config": cfg, "subject": subj, "valid": valid, **{k: round(v, 3) if isinstance(v, float) else v for k, v in m.items()}}
            metrics_rows.append(mrow)
        if norm_gaps:
            nmae = sum(abs(g) for g in norm_gaps) / len(norm_gaps)
            nrmse = math.sqrt(sum(g * g for g in norm_gaps) / len(norm_gaps))
            compiled[cfg]["_cross"] = {"n": len(norm_gaps), "MAE": nmae, "RMSE": nrmse}
            metrics_rows.append({"config": cfg, "subject": "CROSS-normalized", "valid": valid,
                                 "n": len(norm_gaps), "MAE": round(nmae, 3), "RMSE": round(nrmse, 3)})

    # ---- CSVs ----
    with (OUT / "calibration-per-answer.csv").open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=["config", "subject", "student", "set", "guru", "max_score", "runs_native", "median_native", "gap", "spread"])
        w.writeheader(); w.writerows(per_answer)
    with (OUT / "calibration-metrics.csv").open("w", newline="", encoding="utf-8") as f:
        cols = ["config", "subject", "valid", "n", "MAE", "RMSE", "exact", "within", "tol", "band_acc", "spread_mean", "spread_max"]
        w = csv.DictWriter(f, fieldnames=cols, extrasaction="ignore")
        w.writeheader(); w.writerows(metrics_rows)

    # ---- Markdown ----
    md = ["# Calibration & Final-Test Log (complete data)\n",
          "Reconstructed from per-run logs in `results/*.log`. Metrics use the native score each",
          "config produced. Per-answer detail: `report/calibration-per-answer.csv`; all metrics:",
          "`report/calibration-metrics.csv`.\n",
          "## Config changelog\n",
          "| Config | Model | Change |", "|---|---|---|"]
    models = {"v0": "gpt-4o-mini", "v1": "gpt-4o-mini", "v1.1": "gpt-4o-mini", "v1.2": "gpt-4o-mini", "v1.3": "gpt-5.4-nano", "v1.4": "gpt-4o-mini", "final": "gpt-4o-mini"}
    for cfg, _f, desc, valid in CONFIGS:
        if cfg in compiled:
            md.append(f"| {cfg}{'' if valid else ' (INVALID)'} | {models[cfg]} | {desc} |")
    md.append("\n> **v0 note:** scale bug — the grader returned inconsistent `max_score` (5/15/100, some score>max). "
              "Its native scores (÷100) are not comparable; metrics shown for v0 are INVALID and only motivate the v1 scale fix.\n")

    def fmt(m, subj):
        base = f"MAE={m['MAE']:.2f} RMSE={m['RMSE']:.2f} exact={m['exact']*100:.0f}% within±{m['tol']}={m['within']*100:.0f}%"
        if "band_acc" in m: base += f" band={m['band_acc']*100:.0f}%"
        base += f" spread(mean/max)={m['spread_mean']:.2f}/{m['spread_max']}"
        return base

    md.append("## Per-config metrics\n")
    for cfg, _f, desc, valid in CONFIGS:
        if cfg not in compiled: continue
        md.append(f"### {cfg}{'  (INVALID — scale bug)' if not valid else ''}")
        for pre, (subj, mx, tol) in SUBJ.items():
            if subj in compiled[cfg]:
                md.append(f"- **{subj}** (/{mx}): {fmt(compiled[cfg][subj], subj)}")
        if "_cross" in compiled[cfg]:
            c = compiled[cfg]["_cross"]
            md.append(f"- **cross-subject (norm 0-100)**: MAE={c['MAE']:.2f} RMSE={c['RMSE']:.2f}  (targets MAE≤10, RMSE≤15)")
        md.append("")

    md.append("## Bio & Geo focus (per request)\n")
    md.append("| Config | Geo MAE | Geo ±1 | Geo spread | Bio MAE | Bio ±1 | Bio spread |")
    md.append("|---|---|---|---|---|---|---|")
    for cfg, _f, desc, valid in CONFIGS:
        if cfg not in compiled: continue
        g = compiled[cfg].get("geografi"); b = compiled[cfg].get("biologi")
        def cell(m, key, pct=False):
            if not m: return "—"
            v = m[key]; return f"{v*100:.0f}%" if pct else f"{v:.2f}"
        gsp = f"{g['spread_mean']:.2f}/{g['spread_max']}" if g else "—"
        bsp = f"{b['spread_mean']:.2f}/{b['spread_max']}" if b else "—"
        md.append(f"| {cfg} | {cell(g,'MAE')} | {cell(g,'within',True)} | {gsp} | {cell(b,'MAE')} | {cell(b,'within',True)} | {bsp} |")

    (OUT / "CALIBRATION-LOG.md").write_text("\n".join(md) + "\n", encoding="utf-8")

    # console sanity
    for cfg in compiled:
        c = compiled[cfg].get("_cross")
        print(f"{cfg:6s} cross MAE={c['MAE']:.2f} RMSE={c['RMSE']:.2f}" if c else f"{cfg:6s} (agama-only)")
    print(f"\nwrote {OUT.relative_to(ROOT)}/ : calibration-per-answer.csv, calibration-metrics.csv, CALIBRATION-LOG.md")

if __name__ == "__main__":
    main()
