#!/usr/bin/env python3
"""
Builder for the PLAGIARISM DETECTION validation dataset (controlled test set).

Design (frozen before any system run — see docs/validation/plagiarism/README.md):
  Per subject (Geografi / Biologi / Agama):
    - 2 base answers taken VERBATIM from the anonymous master pool
      (docs/validation/automated-grading/master-sheet.csv) as source reference.
    - Group A: S1 = base A | S2 = direct copy of A | S3 = paraphrase of A
    - Group B: S4 = base B | S5 = partial overlap of B | S6 = paraphrase of B
  6 submissions -> C(6,2) = 15 pairs per subject.
    - Same-group pairs (S1-S2,S1-S3,S2-S3,S4-S5,S4-S6,S5-S6) = SUSPICIOUS (6).
    - Cross-group pairs (A-family vs B-family)              = INDEPENDENT (9).
  3 subjects -> 18 submissions, 45 pairs (18 suspicious / 27 independent).

Provenance labels are fixed by construction (ground truth) and MUST NOT be
changed after seeing detection scores. The variants S2/S3/S5/S6 are authored
by the researcher from real anonymous answers; this is declared openly as a
controlled dataset.

Emits:
  docs/validation/plagiarism/dataset.json        (ingestion + run input)
  docs/validation/plagiarism/transform-manifest.csv (per-submission provenance doc)

Usage:  python3 scripts/validation/build-pds-dataset.py
"""
import csv
import json
import os
from itertools import combinations

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
OUT_DIR = os.path.join(ROOT, "docs", "validation", "plagiarism")

# ── Subject metadata (mirrors auto-grading, with -PDS suffix for isolation) ──
SUBJECTS_META = {
    "geografi": {
        "course_code": "VAL-GEO-PDS",
        "course_name": "Geografi (Validasi Plagiarisme)",
        "class_name": "Kelas Validasi PDS GEO",
        "grade_level": "X",
        "max_score": 5,
        "question_text": (
            "Atmosfer adalah lapisan gas yang menyelimuti Bumi (nitrogen, oksigen, "
            "karbon dioksida, gas mulia) yang melindungi planet dari radiasi dan "
            "mengatur iklim. Jelaskan fungsi atau ciri-ciri dari tiap lapisan yang "
            "ada di dalam atmosfer."
        ),
    },
    "biologi": {
        "course_code": "VAL-BIO-PDS",
        "course_name": "Biologi (Validasi Plagiarisme)",
        "class_name": "Kelas Validasi PDS BIO",
        "grade_level": "X",
        "max_score": 5,
        "question_text": (
            "Perhatikan gambar (kepala manusia dengan penunjuk A, B, C). Jika "
            "seseorang mengalami gangguan keseimbangan tubuh dan sulit "
            "mengoordinasikan gerakan saat berjalan, bagian manakah yang pertama "
            "mengalami gangguan? Jelaskan alasanmu berdasarkan fungsi bagian otak "
            "tersebut. (A=otak besar, B=otak kecil, C=sumsum tulang belakang.)"
        ),
    },
    "agama": {
        "course_code": "VAL-AGM-PDS",
        "course_name": "Agama (Validasi Plagiarisme)",
        "class_name": "Kelas Validasi PDS AGM",
        "grade_level": "X",
        "max_score": 15,
        "question_text": (
            "Kasus: viral tuduhan seorang pengguna terhadap petugas kereta lewat "
            "media sosial yang berdampak pada pekerjaan orang lain. Mengapa kita "
            "perlu bersikap kritis dan bertanggung jawab sebelum membagikan "
            "informasi di media sosial? Kaitkan dengan nilai kebenaran dan sikap "
            "menghargai martabat sesama manusia."
        ),
    },
}

# ── Texts. base_a / base_b are VERBATIM from master-sheet (typos preserved).  ──
# copy_a is identical to base_a (direct copy). paraphrase/partial are authored. ──
TEXTS = {
    "geografi": {
        "base_a_src": "GEO-S13",  # student_code 'm'
        "base_a": (
            "1. Troposfer : Lapisan bumi yang paling dekat dengan buminya sendiri, "
            "lapisan ini mengandung berbagai gas yang sangat diperlukan oleh makhluk "
            "hidup untuk mencari kebutuhan hidupnya, seperti adanya oksigen, "
            "nitrogen, dan sebagainya. 2. Stratosfer : Lapisan bumi yang melindungi "
            "bumi dari sinar UltraViolet yang di bantu oleh lapisan ozon. Lapisan ini "
            "biasanya digunakan untuk penerbangan pesawat. 3. Mesosfer : Lapisan bumi "
            "yang dapat membakar, menghanguskan batu-batu dari luar angkasa "
            "(meteorit) untuk melindungi bumi. 4. Termosfer/Ionisfer : Lapisan bumi "
            "yang dimana dapat memberikan gelombang radio, dan tempat dimana fenomena "
            "Aurora dan Halo Matahari muncul. 5. Eksosfer : Lapisan bumi yang paling "
            "terluar dan paling dingin, serta gravitasi yang melemah. Biasanya "
            "digunakan untuk tempat singgahnya satelit buatan manusia."
        ),
        # S3 — paraphrase of A: same facts, reworded and restructured.
        "paraphrase_a": (
            "Troposfer merupakan lapisan atmosfer yang letaknya paling dekat dengan "
            "bumi dan menyimpan beragam gas penting bagi kehidupan makhluk hidup, "
            "seperti oksigen dan nitrogen. Stratosfer berperan melindungi bumi dari "
            "sinar Ultraviolet dengan bantuan lapisan ozon, dan lapisan ini umumnya "
            "dipakai sebagai jalur penerbangan pesawat. Mesosfer adalah lapisan yang "
            "membakar serta menghanguskan batuan luar angkasa (meteorit) sehingga "
            "bumi tetap terlindungi. Termosfer atau Ionosfer dapat memantulkan "
            "gelombang radio sekaligus menjadi tempat munculnya fenomena Aurora dan "
            "Halo Matahari. Eksosfer adalah lapisan paling luar dan paling dingin "
            "dengan gravitasi yang melemah, biasanya menjadi tempat mengorbitnya "
            "satelit buatan manusia."
        ),
        "base_b_src": "GEO-S08",  # student_code 'h'
        "base_b": (
            "Troposfer: Lapisan terdalam atau pertama pada atmosfer bumi berfungsi "
            "sebagai tempat terjadinya fenomena alam sesperti hujan, awan, cuaca dan "
            "iklim. Stratosfer: Lapisan kedua, yang berfungsi sebagai tempat "
            "terbangnya pesawat atau jet dan adanya ozon yang menangkai sinar UV "
            "(Ultra Violet) Mesosfer: Lapisan ketiga, yang berfungsi sebagai lapisan "
            "yang melindungi bumi dari benda asing, dan meteor. Denagan cara mengikis "
            "atau membakar benda asing tersebut. Termosfer: Lapisan keempat, yang "
            "berfungsi sebagai lapisan lanosfer yang menjadi penyebaran bagi sinyal "
            "gelombang radio. Eksosfer: Lapisan terluar pada atmosfer bumi, yang "
            "berbatasan langsung dengan luar angkasa dan memiliki kandungan gas yang "
            "rendah serta gaya gravitasi yang lemah."
        ),
        # S5 — partial overlap of B: first two sentences copied verbatim + new tail.
        "partial_b": (
            "Troposfer: Lapisan terdalam atau pertama pada atmosfer bumi berfungsi "
            "sebagai tempat terjadinya fenomena alam sesperti hujan, awan, cuaca dan "
            "iklim. Stratosfer: Lapisan kedua, yang berfungsi sebagai tempat "
            "terbangnya pesawat atau jet dan adanya ozon yang menangkai sinar UV "
            "(Ultra Violet). Selebihnya, mesosfer adalah lapisan tempat meteor "
            "terbakar habis sebelum mencapai permukaan, lalu termosfer dipakai untuk "
            "memantulkan sinyal radio dan memunculkan aurora, sementara eksosfer "
            "adalah batas terjauh atmosfer dengan gravitasi yang sangat lemah."
        ),
        # S6 — paraphrase of B: fully reworded.
        "paraphrase_b": (
            "Lapisan pertama, Troposfer, adalah bagian atmosfer paling bawah dan "
            "menjadi tempat munculnya berbagai gejala alam seperti hujan, awan, serta "
            "perubahan cuaca dan iklim. Lapisan kedua, Stratosfer, dipakai sebagai "
            "jalur terbang pesawat dan memiliki ozon yang menahan sinar UV. Lapisan "
            "ketiga, Mesosfer, melindungi bumi dengan mengikis dan membakar benda "
            "asing maupun meteor. Lapisan keempat, Termosfer, mengandung ionosfer "
            "yang menyebarkan sinyal gelombang radio. Lapisan terluar, Eksosfer, "
            "langsung berbatasan dengan luar angkasa serta memiliki kadar gas rendah "
            "dan gravitasi lemah."
        ),
    },
    "biologi": {
        "base_a_src": "BIO-S18",  # student_code 's'
        "base_a": (
            "Bagian yang mengalami gangguan adalah bagian B (Otak kecil). Otak kecil "
            "sendiri berperan dan berfungsi dalam menjaga keseimbangan tubuh maupun "
            "dalam pergerakan, oleh karena itu, ketika seseorang mengalami gangguan "
            "dalam keseimbangan tubuh dan sulit mengoordinasikan gerakan saat "
            "berjalan berarti terdapat gangguan pada otak kecil yang terhambat/hilang "
            "fungsi"
        ),
        "paraphrase_a": (
            "Bagian yang terganggu adalah B, yakni otak kecil. Otak kecil bertugas "
            "menjaga keseimbangan tubuh sekaligus mengatur pergerakan, sehingga "
            "apabila seseorang sulit menjaga keseimbangan dan kesulitan "
            "mengoordinasikan gerakan ketika berjalan, hal itu menandakan fungsi otak "
            "kecilnya sedang terhambat atau hilang."
        ),
        "base_b_src": "BIO-S19",  # student_code 't'
        "base_b": (
            "Bagian B yaitu Cerebellum. Cerebellum ini menjaga keseimbangan tubuh dan "
            "koordinasi gerak, seperti saat kita berjalan atau sedang menaiki sepeda. "
            "Jika cerebellum ini mengalami gangguan otomatis tubuh tidak bisa menjaga "
            "keseimbangannya, sehingga kita tidak bisa berdiri dengan benar, jalan "
            "nya sempoyongan seperti orang mabuk, bahkan bisa saja kita jatuh tanpa "
            "sebab karena tidak adanya keseimbangan tersebut. Untuk melatih cerebellum "
            "ini kita dapat melatihnya dengan olahraga yang berkaitan dengan "
            "keseimbangan seperti mengangkat satu kaki, bersepeda, dll."
        ),
        # S5 — partial overlap of B: first two sentences verbatim + new tail.
        "partial_b": (
            "Bagian B yaitu Cerebellum. Cerebellum ini menjaga keseimbangan tubuh dan "
            "koordinasi gerak, seperti saat kita berjalan atau sedang menaiki sepeda. "
            "Apabila bagian ini terganggu, penderita akan kesulitan mengatur posisi "
            "tubuh, gerakannya menjadi kaku dan tidak presisi, serta mudah kehilangan "
            "arah saat beraktivitas."
        ),
        "paraphrase_b": (
            "Bagian yang dimaksud adalah B, yaitu Cerebellum. Cerebellum berfungsi "
            "menjaga keseimbangan dan mengoordinasikan gerak tubuh, contohnya saat "
            "berjalan maupun mengayuh sepeda. Bila cerebellum terganggu, tubuh "
            "otomatis gagal menjaga keseimbangannya sehingga sulit berdiri tegak, "
            "langkah menjadi goyah layaknya orang mabuk, dan bisa terjatuh tanpa "
            "sebab. Untuk melatihnya, kita dapat melakukan olahraga keseimbangan "
            "seperti berdiri dengan satu kaki atau bersepeda."
        ),
    },
    "agama": {
        "base_a_src": "AGM-S13",  # student_code 'n'
        "base_a": (
            "Menurut saya, kita perlu bersikap kritis sebelum bertindak apalagi "
            "langsung membagikannya ke media sosial tanpa tahu alasan dan maksud dari "
            "petugas kereta tersebut untuk mengamankannya sebelum diambil oleh orang "
            "lain. Dengan sikap yang kritis terlebih dahulu, kita berarti menghargai "
            "dan menjaga martabat sesama manusia, jika kita tidak bersikap kritis "
            "maka kita bisa merusak nama baik petugas kereta dan merusak martabat "
            "petugas kereta tersebut dan akan berdampak pada pekerjaannya. Oleh "
            "karena itu, kita sebagai pengguna media sosaial penting untuk selalu "
            "bersikap kritis dan bertanggung jawab seperti mencari tau kebenarannya "
            "dahulu sebelum membagikan informasi di media sosial agar sikap kita "
            "tidak merugikan orang lain dan sesama."
        ),
        "paraphrase_a": (
            "Menurut saya, sebelum bertindak—apalagi langsung mengunggahnya ke media "
            "sosial—kita perlu bersikap kritis dan tidak gegabah tanpa lebih dulu "
            "mengetahui alasan petugas kereta mengamankan barang itu agar tidak "
            "diambil orang lain. Dengan bersikap kritis lebih dahulu, kita sebenarnya "
            "menghargai dan menjaga martabat sesama; sebaliknya, tanpa sikap kritis "
            "kita bisa merusak nama baik dan martabat petugas tersebut hingga "
            "berdampak pada pekerjaannya. Karena itu, sebagai pengguna media sosial "
            "kita penting untuk selalu kritis dan bertanggung jawab, misalnya "
            "memastikan kebenarannya dahulu sebelum menyebarkan informasi, supaya "
            "tindakan kita tidak merugikan orang lain maupun sesama."
        ),
        "base_b_src": "AGM-S17",  # student_code 'r'
        "base_b": (
            "Berpikir dengan kepala dingin adalah salah satu cara untuk tidak "
            "menyebabkan suatu masalah. Kita sebaiknya mencari tahu kebenaran dibalik "
            "informasi tersebut. Apakah memang hanya korban yang dirugikan ? apakah "
            "hal tersebut kesalahan korban sendiri atau orang lain ? percuma jika "
            "kamu hanya membela suatu hal hanya karna kamu tidak tahu kebenaran "
            "dibaliknya. Peraturan di KAI sudah menegaskan untuk tetap selalu "
            "mengecek barang bawaan pribadi, karna kehilangan bukan tanggung jawab "
            "pihak KAI. Bahkan selalu diumumkan sebelum berangkat dan sebelum "
            "pemberhentian untuk selalu mengecek barang pribadi. Keteledoran dari "
            "satu manusia, bisa memicu amarah dari banyak oranbg dan bisa "
            "menghilangkan satu-satunya pekerjaan petugs kereta tersebut. Tak hanya "
            "pekerjaan, ia pasti merasa bahwa semua warga medsos mengujarkan "
            "kebencian padanya hanya karna mereka tidak tahu fakta asli dari berita "
            "tersebut. Sangat disayangkan SDM Indonesia cukup rendah, yang membuat "
            "banyak warga medsos hanya melampiaskan hate comment kepada user lain dan "
            "tidak mencari kebenarannya terlebih dahulu. Hal ini sama saja memicu "
            "orang lain untuk membenci dan merendahkan satu orang tanpa tau keaslian "
            "dari ceritanya."
        ),
        # S5 — partial overlap of B: first three sentences verbatim + new tail.
        "partial_b": (
            "Berpikir dengan kepala dingin adalah salah satu cara untuk tidak "
            "menyebabkan suatu masalah. Kita sebaiknya mencari tahu kebenaran dibalik "
            "informasi tersebut. Apakah memang hanya korban yang dirugikan ? apakah "
            "hal tersebut kesalahan korban sendiri atau orang lain ? Tanpa memeriksa "
            "fakta lebih dulu, sebuah unggahan bisa dengan cepat menjadi viral dan "
            "menyeret seseorang ke dalam tuduhan yang belum tentu benar, sehingga ia "
            "menanggung akibat yang jauh lebih besar daripada kesalahannya."
        ),
        "paraphrase_b": (
            "Menyikapi sesuatu dengan kepala dingin adalah cara agar tidak "
            "menimbulkan masalah baru. Sebaiknya kita menelusuri dulu kebenaran di "
            "balik sebuah informasi: benarkah hanya korban yang dirugikan, dan apakah "
            "itu kelalaian korban sendiri atau pihak lain? Percuma membela sesuatu "
            "jika kita tidak tahu fakta sebenarnya. Aturan KAI pun sudah menegaskan "
            "agar penumpang selalu memeriksa barang bawaannya karena kehilangan bukan "
            "tanggung jawab pihak KAI, dan imbauan itu diumumkan sebelum berangkat "
            "maupun sebelum berhenti. Keteledoran satu orang bisa memancing kemarahan "
            "banyak orang dan bahkan menghilangkan satu-satunya pekerjaan petugas "
            "kereta tersebut, sementara warga media sosial kerap melampiaskan "
            "komentar kebencian tanpa lebih dahulu mencari kebenarannya."
        ),
    },
}

# ── Filler: real independent answers from the master pool, added so the class is
# realistic (sparse cheating — the regime the z-score scorer is designed for).
# Each filler is a distinct real student's answer, unrelated to base A/B and to
# each other, so every filler pair is independent by provenance.
MASTER_CSV = os.path.join(ROOT, "docs", "validation", "automated-grading", "master-sheet.csv")
FILLER_CODES = {
    "geografi": ["GEO-S04", "GEO-S05", "GEO-S07", "GEO-S11", "GEO-S16", "GEO-S20", "GEO-S24", "GEO-S27", "GEO-S30"],
    "biologi":  ["BIO-S07", "BIO-S08", "BIO-S10", "BIO-S15", "BIO-S16", "BIO-S22", "BIO-S26", "BIO-S27", "BIO-S30"],
    "agama":    ["AGM-S01", "AGM-S06", "AGM-S10", "AGM-S12", "AGM-S14", "AGM-S22", "AGM-S24", "AGM-S27", "AGM-S29"],
}


def load_master_answers():
    """code -> verbatim answer_text from the master sheet."""
    out = {}
    with open(MASTER_CSV, encoding="utf-8") as f:
        for row in csv.DictReader(f):
            out[row["student_code"]] = row["answer_text"]
    return out


# Submission template: (slot, group, transform, text_key, source_within_group)
SLOTS = [
    ("S1", "A", "base",       "base_a",       None),
    ("S2", "A", "copy",       "base_a",       "S1"),   # direct copy == base_a text
    ("S3", "A", "paraphrase", "paraphrase_a", "S1"),
    ("S4", "B", "base",       "base_b",       None),
    ("S5", "B", "partial",    "partial_b",    "S4"),
    ("S6", "B", "paraphrase", "paraphrase_b", "S4"),
]


def build_subject(subj, master):
    meta = SUBJECTS_META[subj]
    t = TEXTS[subj]
    src_map = {"A": t["base_a_src"], "B": t["base_b_src"]}
    submissions = []
    # 6 controlled submissions — families A and B (the only related families)
    for slot, group, transform, key, src_slot in SLOTS:
        submissions.append({
            "slot": slot,
            "submission_code": f"PDS-{subj[:3].upper()}-{slot}",
            "student_code": f"pds-{subj[:3]}-{slot.lower()}",
            "group": group,
            "family": group,
            "transform": transform,
            "source_master_code": src_map[group],
            "source_within_group": src_slot,
            "answer_text": t[key],
            "char_len": len(t[key]),
        })
    # 9 filler submissions — each its OWN independent family (real master answers)
    for i, mcode in enumerate(FILLER_CODES[subj], 1):
        slot = f"F{i}"
        text = master[mcode]
        submissions.append({
            "slot": slot,
            "submission_code": f"PDS-{subj[:3].upper()}-{slot}",
            "student_code": f"pds-{subj[:3]}-{slot.lower()}",
            "group": "F",
            "family": f"FILL-{mcode}",
            "transform": "filler",
            "source_master_code": mcode,
            "source_within_group": "",
            "answer_text": text,
            "char_len": len(text),
        })

    # pairs: C(15,2)=105. suspicious iff same family (only A and B have >1 member).
    pairs = []
    for a, b in combinations(submissions, 2):
        suspicious = a["family"] == b["family"]
        pairs.append({
            "a": a["slot"],
            "b": b["slot"],
            "a_code": a["submission_code"],
            "b_code": b["submission_code"],
            "label": "suspicious" if suspicious else "independent",
            "pair_type": _pair_type(a, b, suspicious),
        })
    return meta, submissions, pairs


def _pair_type(a, b, suspicious):
    """Human-readable relation for per-type error analysis."""
    if suspicious:
        ta, tb = sorted([a["transform"], b["transform"]])
        return f"{ta}+{tb}"
    if a["group"] in ("A", "B") and b["group"] in ("A", "B"):
        return "cross-group"
    return "independent-filler"


SUBJECT_TITLES = {
    "geografi": "Geografi — lapisan atmosfer",
    "biologi": "Biologi — bagian otak (keseimbangan)",
    "agama": "Agama — sikap kritis di media sosial",
}

TRANSFORM_LABEL = {
    "base": "base (jawaban dasar asli)",
    "copy": "direct copy (salin persis base)",
    "paraphrase": "paraphrase (makna sama, kata diubah)",
    "partial": "partial overlap (sebagian kalimat base disalin + sebagian baru)",
    "filler": "filler (jawaban independent asli dari master pool)",
}


def emit_provenance(dataset):
    """Write the human-readable provenance appendix (thesis lampiran)."""
    L = []
    L.append("# Lampiran — Dataset Provenance (Plagiarism Detection Validation)\n")
    L.append(
        "Dataset uji **terkontrol**: varian disusun peneliti dari jawaban anonim, dan "
        "**label pasangan ditetapkan berdasarkan provenance (asal-usul) SEBELUM sistem "
        "dijalankan** — inilah ground truth. Hasil tidak mewakili kasus plagiarisme "
        "siswa nyata dan terbatas pada dataset ini (Amirzhanov et al., 2025: deteksi "
        "*indikasi* kemiripan, bukan vonis otomatis).\n"
    )
    d = dataset["design"]
    t = d["totals"]
    L.append("## Ringkasan desain (v2 — kelas realistis)\n")
    L.append(
        f"- Per mapel: **{d['submissions_per_subject']} submission** = "
        f"{d['controlled_per_subject']} terkontrol (S1–S6) + {d['filler_per_subject']} filler "
        f"independent (F1–F9) → C(15,2) = **{d['pairs_per_subject']} pasangan** "
        f"({d['suspicious_per_subject']} suspicious + {d['independent_per_subject']} independent; "
        "rasio suspicious ~5,7% = penyontek jarang, regime yang dirancang untuk z-score).\n"
        f"- 3 mapel: **{t['submissions']} submission**, **{t['pairs']} pasangan** "
        f"(**{t['suspicious']} suspicious / {t['independent']} independent**).\n"
        "- Inti terkontrol: S1=base A · S2=copy A · S3=paraphrase A | "
        "S4=base B · S5=partial B · S6=paraphrase B. Filler = jawaban asli berbeda siswa.\n"
        "- Pasangan **sekeluarga (A atau B) = suspicious**; semua lainnya "
        "(lintas-grup A×B, dan apa pun yang melibatkan filler) = **independent**.\n"
        "- v1 (hanya 6 submission, memicu mode z-score degeneratif) diarsipkan di "
        "`results/v1-zscore/` sebagai cacat metodologi yang ditemukan.\n"
    )
    fc = d["frozen_config"]
    th = fc["thresholds"]
    L.append("## Konfigurasi yang di-FREEZE (tidak diubah setelah skor terlihat)\n")
    L.append(
        f"- Ambang risiko: **HIGH ≥ {th['HIGH']}, MEDIUM ≥ {th['MEDIUM']}, LOW ≥ {th['LOW']}**.\n"
        f"- Scoring: {fc['scoring']}.\n"
        f"- Embedding: `{fc['embedding_model']}`; leksikal: BM25.\n"
        f"- Pemetaan biner: {fc['binary_mapping']}.\n"
    )
    L.append("## Catatan interpretasi (temuan yang diharapkan, bukan kesalahan)\n")
    L.append(
        "1. **Asimetri/berbagi kata kunci pada Geografi & Biologi.** Karena jawaban "
        "bersifat faktual dan pendek, base A dan base B memakai terminologi yang sama "
        "(mis. *troposfer, ozon, mesosfer*; *cerebellum, keseimbangan, koordinasi*). "
        "Akibatnya pasangan **independent (A×B) pun dapat berskor tinggi** sehingga "
        "muncul **false positive**. Ini **konsekuensi yang diharapkan** dari deteksi "
        "berbasis kemiripan pada jawaban faktual dan dilaporkan sebagai **temuan**, "
        "bukan kegagalan sistem.\n"
        "2. **Agama paling terpisah.** Base A (sudut *menghargai martabat / sikap "
        "kritis*) dan base B (sudut *berpikir kepala dingin + aturan KAI + "
        "keteledoran*) benar-benar berbeda kerangka, sehingga pasangan independent-nya "
        "berskor rendah. Kontras antar-mapel (Geo/Bio ramai false positive vs Agama "
        "bersih) inilah yang dilaporkan sebagai **batas pendekatan berbasis kemiripan**.\n"
    )
    L.append(
        "> Catatan: teks di bawah ditampilkan apa adanya (verbatim, typo asli "
        "dipertahankan). Penanda transformasi hanya ada di tabel ini, **tidak** di teks "
        "yang discan sistem. Berkas kanonik (teks persis byte) adalah `dataset.json`.\n"
    )

    for subj, s in dataset["subjects"].items():
        subs = {x["slot"]: x for x in s["submissions"]}
        src = {x["slot"]: x for x in s["submissions"]}
        L.append(f"\n---\n\n## {SUBJECT_TITLES.get(subj, subj)}\n")
        L.append(
            f"**Base A:** `{subs['S1']['source_master_code']}` · "
            f"**Base B:** `{subs['S4']['source_master_code']}`\n"
        )
        L.append(f"_Pertanyaan:_ {s['question_text']}\n")

        # submissions table
        L.append("### Submission\n")
        L.append("| Slot | Student | Grup | Transformasi | Sumber | Karakter |")
        L.append("|---|---|---|---|---|---|")
        for x in s["submissions"]:
            within = f" (= {x['source_within_group']})" if x["source_within_group"] else ""
            srclabel = f"{x['source_master_code']}{within}"
            L.append(
                f"| {x['slot']} | `{x['student_code']}` | {x['group']} | "
                f"{TRANSFORM_LABEL[x['transform']]} | {srclabel} | {x['char_len']} |"
            )
        L.append("")

        # full texts — controlled core only
        L.append("### Teks lengkap submission terkontrol (verbatim)\n")
        for x in s["submissions"]:
            if x["group"] not in ("A", "B"):
                continue
            note = ""
            if x["transform"] == "copy":
                note = " — *identik byte-per-byte dengan S1*"
            elif x["transform"] == "partial":
                note = " — *sebagian kalimat awal disalin persis dari base, sisanya baru*"
            L.append(f"**{x['slot']} · {TRANSFORM_LABEL[x['transform']]}{note}**")
            L.append(f"> {x['answer_text']}\n")

        # filler list (compact — verbatim master answers)
        L.append("### Filler independent (jawaban asli master pool)\n")
        L.append("| Slot | Sumber | Karakter |")
        L.append("|---|---|---|")
        for x in s["submissions"]:
            if x["group"] == "F":
                L.append(f"| {x['slot']} | `{x['source_master_code']}` | {x['char_len']} |")
        L.append("")

        # pairs — suspicious ground truth explicit; independents summarised
        susp = [p for p in s["pairs"] if p["label"] == "suspicious"]
        indep = len(s["pairs"]) - len(susp)
        L.append(f"### Pasangan — ground truth ({len(s['pairs'])} total: {len(susp)} suspicious / {indep} independent)\n")
        L.append("Pasangan **suspicious** (sisanya independent):\n")
        L.append("| Pasangan | Relasi (pair_type) |")
        L.append("|---|---|")
        for p in susp:
            L.append(f"| {p['a']}–{p['b']} | {p['pair_type']} |")
        L.append(f"\n_{indep} pasangan lainnya = independent (lintas-grup A×B + semua pasangan yang melibatkan filler). Daftar lengkap di `dataset.json`._\n")

    path = os.path.join(OUT_DIR, "PROVENANCE.md")
    with open(path, "w", encoding="utf-8") as f:
        f.write("\n".join(L))
    print(f"wrote {os.path.relpath(path, ROOT)}")


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    dataset = {
        "name": "plagiarism-validation-controlled",
        "description": (
            "Controlled plagiarism-detection validation set. Variants authored by "
            "researcher from anonymous master-pool answers; provenance labels are "
            "ground truth, frozen before any system run."
        ),
        "design": {
            "note": "v2 realistic class: 6 controlled (S1-S6) + 9 independent filler (F1-F9) per subject; suspicious ratio ~5.7% (sparse cheating, the z-score regime). v1 (6 submissions only) is archived under results/v1-zscore/.",
            "submissions_per_subject": 15,
            "controlled_per_subject": 6,
            "filler_per_subject": 9,
            "pairs_per_subject": 105,
            "suspicious_per_subject": 6,
            "independent_per_subject": 99,
            "totals": {"submissions": 45, "pairs": 315, "suspicious": 18, "independent": 297},
            "frozen_config": {
                "thresholds": {"HIGH": 0.80, "MEDIUM": 0.60, "LOW": 0.40},
                "scoring": "z-score (per-question, per-assignment) when pairs>=15; else weighted 0.55 semantic / 0.45 lexical",
                "min_pairs_for_zscore": 15,
                "binary_mapping": "HIGH+MEDIUM => suspicious (positive); LOW+NONE => independent (negative)",
                "embedding_model": "text-embedding-3-small",
            },
        },
        "subjects": {},
    }

    master = load_master_answers()
    manifest_rows = []
    for subj in SUBJECTS_META:
        meta, submissions, pairs = build_subject(subj, master)
        dataset["subjects"][subj] = {
            **meta,
            "submissions": submissions,
            "pairs": pairs,
        }
        for s in submissions:
            manifest_rows.append({
                "subject": subj,
                "submission_code": s["submission_code"],
                "student_code": s["student_code"],
                "group": s["group"],
                "transform": s["transform"],
                "source_master_code": s["source_master_code"],
                "source_within_group": s["source_within_group"] or "",
                "char_len": s["char_len"],
            })

    ds_path = os.path.join(OUT_DIR, "dataset.json")
    with open(ds_path, "w", encoding="utf-8") as f:
        json.dump(dataset, f, ensure_ascii=False, indent=2)

    mf_path = os.path.join(OUT_DIR, "transform-manifest.csv")
    with open(mf_path, "w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=[
            "subject", "submission_code", "student_code", "group",
            "transform", "source_master_code", "source_within_group", "char_len",
        ])
        w.writeheader()
        w.writerows(manifest_rows)

    emit_provenance(dataset)

    # sanity report
    print(f"wrote {os.path.relpath(ds_path, ROOT)}")
    print(f"wrote {os.path.relpath(mf_path, ROOT)}")
    for subj in dataset["subjects"]:
        s = dataset["subjects"][subj]
        susp = sum(1 for p in s["pairs"] if p["label"] == "suspicious")
        indep = sum(1 for p in s["pairs"] if p["label"] == "independent")
        minlen = min(x["char_len"] for x in s["submissions"])
        print(f"  {subj:9s}: {len(s['submissions'])} subs, {len(s['pairs'])} pairs "
              f"({susp} suspicious / {indep} independent), min_char_len={minlen}"
              f"{'  <-- WARNING <=50' if minlen <= 50 else ''}")


if __name__ == "__main__":
    main()
