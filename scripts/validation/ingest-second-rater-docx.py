#!/usr/bin/env python3
"""Ingest second-teacher scores returned as Word documents.

Usage:
  python3 scripts/validation/ingest-second-rater-docx.py \
      --geografi path.docx --biologi path.docx --agama path.docx [--fix CODE=SCORE ...]

Teacher 2 scored the original answer lists (one bullet per answer, score written
inline as "(skor N)") rather than the shuffled workbook, so answers carry no
student code. Each answer is matched to its dataset code by text: whitespace and
punctuation are stripped first, because the dataset text was reconstructed from
a PDF and carries wrap artefacts ("kehid upan"). A match must be clearly better
than the runner-up and one-to-one, or the script refuses to write.

Unscored answers ("(skor xx)") are recorded as null. A score outside [0, max] is
refused unless corrected with --fix, which is recorded in the output.

Writes docs/validation/automated-grading/second-rater/scores.json in the same
shape as ingest-second-rater.mjs, so inter-rater-metrics.py reads either.
"""
import argparse
import json
import re
import sys
import zipfile
from datetime import datetime, timezone
from difflib import SequenceMatcher
from pathlib import Path
from xml.etree import ElementTree

ROOT = Path(__file__).resolve().parents[2]
AG = ROOT / "docs/validation/automated-grading"
W = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"
SCORE = re.compile(r"[\(\{\[]\s*(?:skor|score|nilai)\s*([0-9]+|xx)\s*[\)\}\]]", re.I)
MIN_RATIO, MIN_MARGIN = 0.80, 0.10


def paragraphs(path):
    with zipfile.ZipFile(path) as z:
        root = ElementTree.fromstring(z.read("word/document.xml"))
    for p in root.iter(f"{W}p"):
        text = "".join(t.text or "" for t in p.iter(f"{W}t")).strip()
        is_list = p.find(f"{W}pPr/{W}numPr") is not None
        yield text, is_list


def answers_from(path):
    """Answer list items after the 'Jawaban siswa' heading; a scoreless item is
    joined to the next one (one student's answer split by list numbering)."""
    items, started, pending = [], False, ""
    for text, is_list in paragraphs(path):
        if not started:
            started = bool(re.search(r"jawaban\s+siswa", text, re.I))
            continue
        if not text or not is_list:
            continue
        text = f"{pending} {text}".strip() if pending else text
        m = None
        for m in SCORE.finditer(text):
            pass
        if m is None:
            pending = text
            continue
        pending = ""
        raw = m.group(1)
        items.append({"text": SCORE.sub("", text).strip(), "raw_score": raw})
    if pending:
        items.append({"text": pending, "raw_score": None})
    return items


def norm(text):
    return re.sub(r"[^a-z0-9]", "", text.lower())


def match(items, answers):
    codes = {a["student_code"]: norm(a["answer_text"]) for a in answers}
    used, out = set(), []
    for item in items:
        t = norm(item["text"])
        ranked = sorted(((SequenceMatcher(None, t[:600], c[:600]).ratio(), code) for code, c in codes.items()),
                        reverse=True)
        (best, code), (second, _) = ranked[0], ranked[1]
        ok = best >= MIN_RATIO and best - second >= MIN_MARGIN and code not in used
        out.append({**item, "code": code if ok else None, "ratio": round(best, 3), "runner_up": round(second, 3)})
        if ok:
            used.add(code)
    return out


def main():
    ap = argparse.ArgumentParser()
    for s in ("geografi", "biologi", "agama"):
        ap.add_argument(f"--{s}", required=True)
    ap.add_argument("--fix", nargs="*", default=[], help="CODE=SCORE corrections for typos, recorded in the output")
    args = ap.parse_args()
    fixes = dict(f.split("=", 1) for f in args.fix)

    dataset = json.loads((AG / "dataset.json").read_text())["subjects"]
    out = {"source": "docx", "ingested_at": datetime.now(timezone.utc).isoformat(), "fixes": fixes, "subjects": {}}
    problems = []

    for subj, s in dataset.items():
        src = getattr(args, subj)
        matched = match(answers_from(src), s["answers"])
        scores, unmatched = {}, []
        for m in matched:
            if m["code"] is None:
                unmatched.append(m)
                continue
            raw = fixes.get(m["code"], m["raw_score"])
            if raw is None or str(raw).lower() == "xx":
                scores[m["code"]] = None
                continue
            score = int(raw)
            if not 0 <= score <= s["max_score"]:
                problems.append(f"{subj}: {m['code']} has out-of-range score {raw} (max {s['max_score']}); "
                                f"pass --fix {m['code']}=<score>")
                continue
            scores[m["code"]] = score
        missing = [a["student_code"] for a in s["answers"] if a["student_code"] not in scores]
        for u in unmatched:
            problems.append(f"{subj}: could not match answer (best {u['ratio']}, runner-up {u['runner_up']}): "
                            f"{u['text'][:80]}…")
        out["subjects"][subj] = {
            "max_score": s["max_score"],
            "scores": scores,
            "unscored": sorted(c for c, v in scores.items() if v is None),
            "missing": missing,
            "match_ratio_min": min((m["ratio"] for m in matched if m["code"]), default=None),
            "source_file": Path(src).name,
        }
        n_scored = sum(v is not None for v in scores.values())
        print(f"{subj}: {len(matched)} answers in file, {n_scored} scored, "
              f"{len(out['subjects'][subj]['unscored'])} unscored, {len(missing)} not found, "
              f"weakest match {out['subjects'][subj]['match_ratio_min']}", file=sys.stderr)

    if problems:
        print("Refusing to write scores.json:\n  " + "\n  ".join(problems), file=sys.stderr)
        sys.exit(1)
    dest = AG / "second-rater/scores.json"
    dest.write_text(json.dumps(out, indent=2, ensure_ascii=False))
    print(f"wrote {dest.relative_to(ROOT)}", file=sys.stderr)


if __name__ == "__main__":
    main()
