#!/usr/bin/env python3
"""Build the reviewable master sheet + structured dataset from parsed answers.

Inputs:  docs/validation/automated-grading/_raw/answers.parsed.json  (from parse-dataset.py)
Outputs: docs/validation/automated-grading/master-sheet.csv          (all 90 answers, 1 row each)
         docs/validation/automated-grading/dataset.json              (structured, + metadata)

The calibration/final/pool split is FROZEN (stratified-by-score, 2026-06-18): `set` ==
`suggested_set`, where calibration spans the score range. Both columns are kept so the
freeze decision stays auditable.
"""
import csv
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
RAW = ROOT / "docs/validation/automated-grading/_raw/answers.parsed.json"
CSV_OUT = ROOT / "docs/validation/automated-grading/master-sheet.csv"
JSON_OUT = ROOT / "docs/validation/automated-grading/dataset.json"

# Rubric criteria weights are tuned per subject to match question character (weights sum to 100).
# They are internal reasoning guidance only — the grader returns ONE total score 0-100, which is
# converted to native as round(score/100 * max_score) (config v1). Set 2026-06-18, refine in calibration.
CRITERIA_GEO = {"Content & Accuracy": 60, "Completeness": 25, "Writing Quality": 10, "Critical Thinking": 5}
CRITERIA_BIO = {"Content & Accuracy": 50, "Critical Thinking": 30, "Completeness": 10, "Writing Quality": 10}
CRITERIA_AGM = {"Critical Thinking": 45, "Content & Accuracy": 35, "Completeness": 10, "Writing Quality": 10}

SUBJECTS = {
    "geografi": {
        "max_score": 5, "course_code": "VAL-GEO", "course_name": "Geografi (Validasi AI)",
        "class_name": "Kelas Validasi GEO", "grade_level": "X",
        "grounding_file": "validation/geografi-grounding.txt",
        "tolerance": 1,
        "question_text": (
            "Atmosfer adalah lapisan gas yang menyelimuti Bumi (nitrogen, oksigen, "
            "karbon dioksida, gas mulia) yang melindungi planet dari radiasi dan mengatur "
            "iklim. Jelaskan fungsi atau ciri-ciri dari tiap lapisan yang ada di dalam atmosfer."
        ),
        "criteria": CRITERIA_GEO,
    },
    "biologi": {
        "max_score": 5, "course_code": "VAL-BIO", "course_name": "Biologi (Validasi AI)",
        "class_name": "Kelas Validasi BIO", "grade_level": "X",
        "grounding_file": "validation/biologi-grounding.txt",
        "tolerance": 1,
        "question_text": (
            "Perhatikan gambar (kepala manusia dengan penunjuk A, B, C). Jika seseorang "
            "mengalami gangguan keseimbangan tubuh dan sulit mengoordinasikan gerakan saat "
            "berjalan, bagian manakah yang pertama mengalami gangguan? Jelaskan alasanmu "
            "berdasarkan fungsi bagian otak tersebut. (A=otak besar, B=otak kecil, "
            "C=sumsum tulang belakang; jawaban B atau C dapat diterima.)"
        ),
        "criteria": CRITERIA_BIO,
    },
    "agama": {
        "max_score": 15, "course_code": "VAL-AGM", "course_name": "Agama (Validasi AI)",
        "class_name": "Kelas Validasi AGM", "grade_level": "X",
        "grounding_file": "validation/agama-grounding.txt",
        "tolerance": 2,
        "question_text": (
            "Kasus: viral tuduhan seorang pengguna terhadap petugas kereta lewat media "
            "sosial yang berdampak pada pekerjaan orang lain. Mengapa kita perlu bersikap "
            "kritis dan bertanggung jawab sebelum membagikan informasi di media sosial? "
            "Kaitkan dengan nilai kebenaran dan sikap menghargai martabat sesama manusia."
        ),
        "criteria": CRITERIA_AGM,
    },
}

def stratified_suggestion(records, n_calib=6, n_final=9):
    """Suggest a calib set spanning the score range, then final, then pool.

    Calibration: pick n_calib answers at evenly spaced positions across the score-sorted
    list so the tuning set covers low/mid/high. Remaining -> final (next n_final by spread)
    -> pool (rest). Deterministic given the input order.
    """
    order = sorted(range(len(records)), key=lambda i: (records[i]["score"], records[i]["student_code"]))
    n = len(order)
    # evenly spaced indices for calibration across the sorted range
    calib_pos = {round(k * (n - 1) / (n_calib - 1)) for k in range(n_calib)}
    calib = [order[p] for p in sorted(calib_pos)]
    rest = [i for i in order if i not in set(calib)]
    final = rest[:n_final]
    pool = rest[n_final:]
    suggestion = {}
    for i in calib:
        suggestion[i] = "calib"
    for i in final:
        suggestion[i] = "final"
    for i in pool:
        suggestion[i] = "pool"
    return suggestion

def main():
    data = json.loads(RAW.read_text(encoding="utf-8"))
    answers = data["answers"]
    cleaning_log = data["cleaning_log"]

    dataset = {
        "_meta": {
            "purpose": "Automated Grading validation test dataset (3 subjects x 30 answers).",
            "source_pdf": "Tambahan AI LMS (2).pdf",
            "grading_set_per_subject": {"calibration": 6, "final": 9, "total_used": 15},
            "plagiarism_pool_per_subject": 15,
            "split_rule": "stratified-by-score (frozen 2026-06-18); calibration spans the score range",
            "cleaning_log": cleaning_log,
            "text_fidelity_note": (
                "Answer text is reconstructed from the PDF text layer (fixed-column wrap). "
                "Occasional intra-word spaces (e.g. 'kehid upan') are wrap artifacts and are "
                "harmless for LLM grading. For the plagiarism phase, prefer original digital text if available."
            ),
        },
        "subjects": {},
    }

    rows = []
    for subject, meta in SUBJECTS.items():
        recs = answers[subject]
        suggestion = stratified_suggestion(recs)
        subj_block = {**meta, "answers": []}
        for i, r in enumerate(recs):
            normalized = round(r["score"] / meta["max_score"] * 100, 2)
            entry = {
                "student_code": r["student_code"],
                "source_label": r["source_label"],
                "score_teacher": r["score"],
                "max_score": meta["max_score"],
                "normalized_100": normalized,
                "set": suggestion[i],
                "suggested_set": suggestion[i],
                "answer_text": r["answer_text"],
            }
            subj_block["answers"].append(entry)
            rows.append({
                "subject": subject,
                "max_score": meta["max_score"],
                "student_code": r["student_code"],
                "source_label": r["source_label"],
                "score_teacher": r["score"],
                "normalized_100": normalized,
                "set": suggestion[i],
                "suggested_set": suggestion[i],
                "answer_text": r["answer_text"],
            })
        dataset["subjects"][subject] = subj_block

    JSON_OUT.write_text(json.dumps(dataset, ensure_ascii=False, indent=2), encoding="utf-8")

    with CSV_OUT.open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=[
            "subject", "max_score", "student_code", "source_label",
            "score_teacher", "normalized_100", "set", "suggested_set", "answer_text",
        ])
        w.writeheader()
        w.writerows(rows)

    # report
    for subject, meta in SUBJECTS.items():
        recs = dataset["subjects"][subject]["answers"]
        from collections import Counter
        c = Counter(r["suggested_set"] for r in recs)
        print(f"{subject:9s}: {len(recs)} answers | suggested calib={c['calib']} final={c['final']} pool={c['pool']}")
    print(f"\nwrote {CSV_OUT.relative_to(ROOT)}")
    print(f"wrote {JSON_OUT.relative_to(ROOT)}")

if __name__ == "__main__":
    main()
