#!/usr/bin/env python3
"""Parse the grading-validation dataset (pdftotext -layout output) into structured JSON.

Source of truth: docs/validation/automated-grading/_raw/dataset.txt
Output:          docs/validation/automated-grading/_raw/answers.parsed.json

Parsing is driven by the *expected label sequence* (a..z, aa..ee). A new answer item
starts only when a line begins with the exact next expected label + ".". This is robust
against stray "x." / "1." tokens that appear inside wrapped answer bodies.
"""
import json
import re
from pathlib import Path

RAW = Path(__file__).resolve().parents[2] / "docs/validation/automated-grading/_raw"
SRC = RAW / "dataset.txt"
OUT = RAW / "answers.parsed.json"

# Section header -> subject key. Order matters (we slice between consecutive headers).
SECTION_MARKERS = [
    (re.compile(r"^\s*2\.\s*Jawaban siswa\s*:\s*Geografi", re.I), "geografi"),
    (re.compile(r"^\s*Jawaban anak\s*:\s*Biologi", re.I), "biologi"),
    (re.compile(r"^\s*Jawaban anak\s*:\s*Agama", re.I), "agama"),
    (re.compile(r"^\s*3\.\s*Skor maksimal", re.I), "__end__"),
]

def expected_labels():
    labels = [chr(c) for c in range(ord("a"), ord("z") + 1)]          # a..z
    labels += [c + c for c in "abcde"]                                # aa,bb,cc,dd,ee
    return labels

LABELS = expected_labels()

SKOR_RE = re.compile(r"\(\s*skor\s*(\d{1,2})\s*\)", re.I)

# Normalizes broken score tokens BEFORE extraction. Anchored on "(sk" so it never
# touches ordinary body parentheticals like "(sekitar 35 km)" or "(sistem saraf pusat)".
# Handles: "(sko r 3)", "(sk or 12)", and mid-number splits "(skor 1 0)"->10, "(skor 1 2)"->12.
SCORE_TOKEN_FIX = re.compile(r"\(\s*s\s*k[^)0-9]*?([\d\s]+)\)", re.I)

# Data-cleaning merges (documented in CLEANING_LOG). One artifact per subject caused by the
# source Word document's auto-numbered list splitting a single student answer across two letters.
# action "merge_into": this fragment's text is prepended to the target answer; fragment dropped.
# action "score_to":   this phantom item only holds a "(skor N)"; its score is given to target.
MERGES = {
    "geografi": {"dd": ("merge_into", "ee")},
    "biologi": {"n": ("merge_into", "o")},
    "agama": {"m": ("score_to", "l")},
}

def find_section_bounds(lines):
    """Return list of (subject, start_idx, end_idx) for the 3 answer sections."""
    hits = []
    for i, line in enumerate(lines):
        for rx, key in SECTION_MARKERS:
            if rx.match(line):
                hits.append((i, key))
                break
    bounds = []
    for j, (idx, key) in enumerate(hits):
        if key == "__end__":
            continue
        start = idx + 1
        end = hits[j + 1][0] if j + 1 < len(hits) else len(lines)
        bounds.append((key, start, end))
    return bounds

def parse_section(lines, start, end):
    """Split a section into items keyed by the expected label sequence."""
    items = {}
    cur_label = None
    cur_buf = []
    next_i = 0  # index into LABELS of the next label we are looking for

    def flush():
        if cur_label is not None:
            items[cur_label] = "\n".join(cur_buf).strip()

    for line in lines[start:end]:
        m = re.match(r"^\s*([a-z]{1,2})\.\s", line)
        started_new = False
        if m and next_i < len(LABELS) and m.group(1) == LABELS[next_i]:
            # New item: flush previous, begin this one (strip the "label. " prefix).
            flush()
            cur_label = LABELS[next_i]
            cur_buf = [re.sub(r"^\s*[a-z]{1,2}\.\s*", "", line).rstrip()]
            next_i += 1
            started_new = True
        if not started_new and cur_label is not None:
            cur_buf.append(line.rstrip())
    flush()
    return items

def extract_score(text):
    """Return (score:int|None, text_without_trailing_score:str). Uses the LAST marker."""
    matches = list(SKOR_RE.finditer(text))
    if not matches:
        return None, text.strip()
    last = matches[-1]
    score = int(last.group(1))
    cleaned = (text[: last.start()] + text[last.end():]).strip()
    return score, cleaned

def normalize_ws(text):
    # collapse the line-wrap hyphenation artifacts minimally: join lines, squeeze spaces
    joined = re.sub(r"\s+", " ", text.replace("\n", " ")).strip()
    return joined

def fix_score_tokens(text):
    """Repair scores split across line wraps before extraction."""
    return SCORE_TOKEN_FIX.sub(
        lambda m: "(skor " + re.sub(r"\s+", "", m.group(1)) + ")", text
    )

def apply_merges(subject, items):
    """Apply documented merges; return ordered list of records + a cleaning log."""
    log = []
    rules = MERGES.get(subject, {})
    # First handle score_to (phantom score-only item -> donate score to target text).
    for frag, (action, target) in rules.items():
        if action == "score_to" and frag in items and target in items:
            frag_score, _ = extract_score(fix_score_tokens(normalize_ws(items[frag])))
            items[target] = items[target] + f"\n(skor {frag_score})"
            log.append(f"{subject}: dropped phantom '{frag}' (score-only); assigned skor {frag_score} to '{target}'")
            del items[frag]
    # Then handle merge_into (fragment text prepended to target).
    for frag, (action, target) in rules.items():
        if action == "merge_into" and frag in items and target in items:
            items[target] = items[frag] + "\n" + items[target]
            log.append(f"{subject}: merged fragment '{frag}' into '{target}' (single student answer split by source list numbering)")
            del items[frag]
    return items, log

def main():
    lines = SRC.read_text(encoding="utf-8").splitlines()
    bounds = find_section_bounds(lines)
    subj_prefix = {"geografi": "GEO", "biologi": "BIO", "agama": "AGM"}
    result = {}
    cleaning_log = []
    for subject, start, end in bounds:
        items = parse_section(lines, start, end)
        items, log = apply_merges(subject, items)
        cleaning_log.extend(log)
        records = []
        seq = 1
        for label in LABELS:
            if label not in items:
                continue
            normalized = fix_score_tokens(normalize_ws(items[label]))
            score, body = extract_score(normalized)
            records.append(
                {
                    "student_code": f"{subj_prefix[subject]}-S{seq:02d}",
                    "source_label": label,
                    "score": score,
                    "answer_text": body.strip(),
                }
            )
            seq += 1
        result[subject] = records
    payload = {"cleaning_log": cleaning_log, "answers": result}
    OUT.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")

    # ---- report ----
    for subject, records in result.items():
        scores = [r["score"] for r in records if r["score"] is not None]
        missing = [r["source_label"] for r in records if r["score"] is None]
        print(f"{subject:9s}: {len(records):2d} answers | "
              f"score range {min(scores, default='-')}-{max(scores, default='-')} | "
              f"missing: {missing or 'none'}")
        print("           scores: " + " ".join(str(r["score"]) for r in records))
    print("\ncleaning log:")
    for entry in cleaning_log:
        print("  - " + entry)
    print(f"\nwrote {OUT}")

if __name__ == "__main__":
    main()
