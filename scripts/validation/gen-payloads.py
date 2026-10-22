#!/usr/bin/env python3
"""METHOD 2 — generate an ordered JSON payload collection for manual ingestion.

Reads dataset.json and emits docs/validation/automated-grading/payloads.json: an ordered
list of {step, method, path, body, capture, note}. IDs that chain between calls use
{{placeholder}} tokens; `capture` says which response field fills which placeholder.

Fire these in order via Postman/Insomnia/curl (admin session cookie required for /api/admin/*
and /api/assignments/create). This mirrors scripts/validation/ingest.mjs exactly.
"""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DATASET = ROOT / "docs/validation/automated-grading/dataset.json"
OUT = ROOT / "docs/validation/automated-grading/payloads.json"

CRITERIA_SCALE = ["Excellent", "Good", "Fair", "Poor"]

def main():
    ds = json.loads(DATASET.read_text(encoding="utf-8"))
    steps = []

    def add(step, method, path, body=None, capture=None, note=None):
        steps.append({"step": step, "method": method, "path": path,
                      "body": body, "capture": capture, "note": note})

    add("login", "POST", "/api/auth/callback/credentials",
        {"csrfToken": "<from GET /api/auth/csrf>", "username": "<ADMIN_USER>",
         "password": "<ADMIN_PASS>", "json": "true"},
        note="form-encoded; keep the next-auth.session-token cookie for all later calls")
    add("lookup-roles", "GET", "/api/admin/roles", note="find role id for Teacher and Student")
    add("lookup-question-types", "GET", "/api/question-types", note="find ESSAY question_type_id")
    add("lookup-assignment-types", "GET", "/api/assignment-types", note="pick an assignment_type_id")
    add("lookup-academic-years", "GET", "/api/admin/academic-years", capture={"{{yearId}}": "data.academic_years[active].id"})

    add("create-teacher", "POST", "/api/admin/users",
        {"nama_lengkap": "Guru Validasi AI", "email": "val_teacher@validation.local",
         "user_name": "val_teacher", "password": "<TEACHER_PASS>", "role": "{{teacherRoleId}}",
         "tanggal_lahir": "1990-01-01", "kode_guru": "VAL-GURU-01", "niy": "VAL0001"},
        capture={"{{teacherId}}": "data.id"})

    for subj, s in ds["subjects"].items():
        used = [a for a in s["answers"] if a["set"] in ("calib", "final")]
        cc = s["course_code"]
        add(f"[{subj}] create-class", "POST", "/api/admin/classes",
            {"class_name": s["class_name"], "grade_level": s["grade_level"], "year_id": "{{yearId}}"},
            capture={f"{{{{classId_{subj}}}}}": "class.id"})
        add(f"[{subj}] create-course", "POST", "/api/admin/courses",
            {"course_code": cc, "course_name": s["course_name"],
             "description": f"Dataset validasi automated grading — {subj}"},
            capture={f"{{{{courseId_{subj}}}}}": "course.id"})
        add(f"[{subj}] enable-ai-grading", "PUT", "/api/admin/access-control",
            {"course_id": f"{{{{courseId_{subj}}}}}", "feature": "ai_grading", "enabled": True})
        add(f"[{subj}] create-session", "POST", "/api/admin/session",
            {"title": f"Sesi Validasi {subj}", "description": "Sesi tunggal untuk uji grading",
             "startTime": "08:00", "endTime": "09:30", "date": "2026-01-06",
             "courseCode": cc, "teacherId": "{{teacherId}}",
             "classId": f"{{{{classId_{subj}}}}}", "sessionNumber": "1"},
            capture={f"{{{{sessionId_{subj}}}}}": "data.id"})
        for a in used:
            uname = a["student_code"].lower()
            add(f"[{subj}] create-student {a['student_code']}", "POST", "/api/admin/users",
                {"nama_lengkap": f"Siswa {a['student_code']}", "email": f"{uname}@validation.local",
                 "user_name": uname, "password": "<STUDENT_PASS>", "role": "{{studentRoleId}}",
                 "tanggal_lahir": "2009-01-01", "nis": a["student_code"], "nisn": "",
                 "parent_contact": "", "class_id": f"{{{{classId_{subj}}}}}"},
                capture={f"{{{{studentId_{a['student_code']}}}}}": "data.id"})
        add(f"[{subj}] upload-grounding", "POST", f"/api/courses/{cc}/sessions",
            {"sessionId": f"{{{{sessionId_{subj}}}}}", "file_url": s["grounding_file"],
             "file_name": Path(s["grounding_file"]).name, "file_type": "txt",
             "file_size": 0, "content_type": "text/plain", "uploader_id": "{{teacherId}}"},
            capture={f"{{{{resourceId_{subj}}}}}": "data.id"})
        add(f"[{subj}] create-assignment", "POST",
            f"/api/courses/{cc}/sessions/{{{{sessionId_{subj}}}}}/assignments",
            {"assignment_type_id": "{{assignmentTypeId}}", "title": f"Tugas Validasi {subj}",
             "description": s["question_text"], "instructions": s["question_text"],
             "total_points": str(s["max_score"]), "attempts_allowed": "1",
             "show_results": False, "is_published": False, "created_by": "{{teacherId}}",
             "questions": [{"question_type_id": "{{essayTypeId}}", "question_text": s["question_text"],
                            "points": str(s["max_score"]), "order_number": 1, "required": True}]},
            capture={f"{{{{assignmentId_{subj}}}}}": "data.id",
                     f"{{{{questionId_{subj}}}}}": "GET .../assignments -> questions[0].id"})
        add(f"[{subj}] publish", "PUT",
            f"/api/courses/{cc}/sessions/{{{{sessionId_{subj}}}}}/assignments/{{{{assignmentId_{subj}}}}}/publish",
            {"is_published": True})
        for a in used:
            add(f"[{subj}] submit {a['student_code']}", "POST",
                f"/api/courses/{cc}/sessions/{{{{sessionId_{subj}}}}}/assignments/{{{{assignmentId_{subj}}}}}/submit",
                {"student_id": f"{{{{studentId_{a['student_code']}}}}}",
                 "answers": [{"question_id": f"{{{{questionId_{subj}}}}}", "answer_text": a["answer_text"]}]},
                capture={f"{{{{submissionId_{a['student_code']}}}}}": "data.id"})
            add(f"[{subj}] grade {a['student_code']} (skor guru {a['score_teacher']}/{s['max_score']}, set={a['set']})",
                "POST",
                f"/api/courses/{cc}/sessions/{{{{sessionId_{subj}}}}}/assignments/{{{{assignmentId_{subj}}}}}/grade",
                {"submission_id": f"{{{{submissionId_{a['student_code']}}}}}", "grader_id": "{{teacherId}}",
                 "feedback": f"Skor acuan guru (set={a['set']})",
                 "grades": [{"question_id": f"{{{{questionId_{subj}}}}}",
                             "points_earned": a["score_teacher"], "feedback": ""}]})
        add(f"[{subj}] ai-setup", "POST", "/api/assignments/create",
            {"assignmentId": f"{{{{assignmentId_{subj}}}}}", "courseId": f"{{{{courseId_{subj}}}}}",
             "rubric": [{"questionId": f"{{{{questionId_{subj}}}}}", "max_score": 100,
                         "criteria": s["criteria"], "qualitative_scale": CRITERIA_SCALE}],
             "resourceIds": [f"{{{{resourceId_{subj}}}}}"]},
            note="builds the OpenAI vector store from the grounding file (needs OpenAI key)")

    OUT.write_text(json.dumps({"base_url": "http://localhost:3000", "steps": steps},
                              ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"wrote {OUT.relative_to(ROOT)} ({len(steps)} steps)")

if __name__ == "__main__":
    main()
