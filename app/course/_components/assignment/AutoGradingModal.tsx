import React, { useState, useEffect } from 'react';
import { Assignment } from '../../../../hooks/useAssignmentData';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import {
  FaRobot,
  FaPlay,
  FaSpinner,
  FaArrowLeft,
  FaArrowRight,
  FaCheckCircle,
  FaExclamationTriangle,
  FaUser,
  FaChevronDown,
  FaChevronUp,
  FaCheck,
} from 'react-icons/fa';

interface AutoGradingModalProps {
  assignment: Assignment;
  courseCode: string;
  isOpen: boolean;
  onClose: () => void;
  onRunStarted?: () => void;
}

interface GradingResult {
  student_id: string;
  question_id: string;
  score: number | null;
  max_score: number;
  qualitative_grade: string | null;
  feedback: string;
  citations: string[];
  confidence: 'low' | 'medium' | 'high';
  rubric_alignment: Record<string, string>;
  language_detected: string;
}

interface RubricEntry {
  questionId: number;
  questionText: string;
  maxScore: number;
  criteria: { name: string; weight: number }[];
}

interface JobStatus {
  id: string;
  total_students: number;
  status: string;
  completed_at: string | null;
  items_processed: number;
}

// Step: 1 = pick questions, 2 = choose materials, 3 = set rubric, 4 = confirm+run, 5 = results
type Step = 1 | 2 | 3 | 4 | 5;

interface FileCheckResult {
  filename: string;
  local_path: string;
  local_exists: boolean;
  openai_file_id: string | null;
  openai_exists: boolean;
  status: 'ok' | 'missing_openai' | 'missing_local' | 'new';
}

interface SessionResource {
  id: number;
  file_name: string;
  file_title: string;
  file_type: string;
}

interface SessionGroup {
  session_id: number;
  session_title: string;
  session_number: number;
  resources: SessionResource[];
}

function confidenceLabel(conf: string) {
  if (conf === 'high') return { text: 'AI is confident', color: 'text-green-700', bg: 'bg-green-50 border-green-200', icon: '✅' };
  if (conf === 'medium') return { text: 'Review recommended', color: 'text-yellow-700', bg: 'bg-yellow-50 border-yellow-200', icon: '🔍' };
  return { text: 'Manual review needed', color: 'text-red-700', bg: 'bg-red-50 border-red-200', icon: '⚠️' };
}

function gradeColor(grade: string | null) {
  if (grade === 'Excellent') return 'text-green-700 bg-green-50';
  if (grade === 'Good') return 'text-blue-700 bg-blue-50';
  if (grade === 'Fair') return 'text-yellow-700 bg-yellow-50';
  if (grade === 'Poor') return 'text-red-700 bg-red-50';
  return 'text-gray-600 bg-gray-50';
}

export const AutoGradingModal = ({ assignment, courseCode, isOpen, onClose, onRunStarted }: AutoGradingModalProps) => {
  const [step, setStep] = useState<Step>(1);

  // Step 1 state — select questions
  const [selectedQuestionIds, setSelectedQuestionIds] = useState<number[]>([]);
  const essayQuestions = (assignment.questions || []).filter((q: any) => {
    // API returns question_type (enumeration name string) since we added it to the assignments route
    const type = (q.question_type || q.enumeration?.name || '').toUpperCase().replace(/[_ ]/g, '_');
    return type === 'ESSAY' || type === 'FILE_UPLOAD';
  });

  // Step 2 state — choose materials
  const [sessions, setSessions] = useState<SessionGroup[]>([]);
  const [loadingSessions, setLoadingSessions] = useState(false);
  const [selectedResourceIds, setSelectedResourceIds] = useState<number[]>([]);
  const [expandedSessions, setExpandedSessions] = useState<Set<number>>(new Set());

  // Step 3 state — rubric config
  const [rubric, setRubric] = useState<RubricEntry[]>([]);

  // Step 4/5 state — grading
  const [grading, setGrading] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);
  const [jobStatus, setJobStatus] = useState<JobStatus | null>(null);
  const [results, setResults] = useState<GradingResult[]>([]);
  const [gradingError, setGradingError] = useState<string | null>(null);

  // Step 5 — expanded student cards
  const [expandedStudents, setExpandedStudents] = useState<Set<string>>(new Set());

  // Preflight file check state
  const [preflight, setPreflight] = useState<{
    checked: boolean;
    checking: boolean;
    files: FileCheckResult[];
    can_proceed: boolean;
    confirmed: boolean;   // user has seen warnings and clicked confirm
  }>({ checked: false, checking: false, files: [], can_proceed: true, confirmed: false });

  // Reset on open
  useEffect(() => {
    if (isOpen && assignment) {
      setStep(1);
      setSelectedQuestionIds([]);
      setSessions([]);
      setSelectedResourceIds([]);
      setExpandedSessions(new Set());
      setLoadingSessions(false);
      setRubric([]);
      setJobId(null);
      setJobStatus(null);
      setResults([]);
      setGradingError(null);
      setExpandedStudents(new Set());
      setPreflight({ checked: false, checking: false, files: [], can_proceed: true, confirmed: false });

      // Check for an existing completed job and auto-jump to results (Step 5)
      (async () => {
        try {
          const latestRes = await fetch(`/api/ai-grading/status/latest/${assignment.id}`);
          const latestData = await latestRes.json();
          if (!latestData?.success || !latestData.data) return;
          const latest = latestData.data;
          if (latest.status !== 'completed' || !latest.job_id) return;

          // Hydrate the full results from the per-job status endpoint
          const fullRes = await fetch(`/api/ai-grading/status?jobId=${latest.job_id}`);
          const fullData = await fullRes.json();
          if (!fullData?.success) return;

          setJobId(latest.job_id);
          setJobStatus({
            id: latest.job_id,
            total_students: latest.total_students ?? fullData.data?.total_students ?? 0,
            status: 'completed',
            completed_at: latest.completed_at ?? null,
            items_processed: latest.items_processed ?? 0,
          });
          if (Array.isArray(fullData.studentGradeFeedback)) {
            setResults(fullData.studentGradeFeedback);
          }
          setStep(5);
        } catch {
          // Silent — if we can't load past results, the teacher just starts a new run.
        }
      })();
    }
  }, [isOpen, assignment?.id]);

  const rerunFromScratch = () => {
    setStep(1);
    setSelectedQuestionIds([]);
    setSessions([]);
    setSelectedResourceIds([]);
    setExpandedSessions(new Set());
    setLoadingSessions(false);
    setRubric([]);
    setJobId(null);
    setJobStatus(null);
    setResults([]);
    setGradingError(null);
    setExpandedStudents(new Set());
    setPreflight({ checked: false, checking: false, files: [], can_proceed: true, confirmed: false });
  };

  // Poll job status
  useEffect(() => {
    if (!jobId || jobStatus?.status === 'completed' || jobStatus?.status === 'failed') return;
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/ai-grading/status?jobId=${jobId}`);
        const data = await res.json();
        if (data.success) {
          setJobStatus(data.data);
          if (data.studentGradeFeedback?.length) setResults(data.studentGradeFeedback);
          if (data.data.status === 'completed' || data.data.status === 'failed') {
            setGrading(false);
            setStep(5);
          }
        }
      } catch { /* keep polling */ }
    }, 3000);
    return () => clearInterval(interval);
  }, [jobId, jobStatus?.status]);

  // ── Step 1: toggle question selection ──
  const toggleQuestion = (id: number) => {
    setSelectedQuestionIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const selectAll = () => setSelectedQuestionIds(essayQuestions.map((q: any) => q.id));
  const clearAll = () => setSelectedQuestionIds([]);

  // ── Step 1 → 2: move to material selection ──
  const proceedToMaterials = async () => {
    setStep(2);
    if (sessions.length > 0) return; // already loaded
    setLoadingSessions(true);
    try {
      const res = await fetch(`/api/assignments/course-materials?assignmentId=${assignment.id}`);
      const data = await res.json();
      if (data.success) {
        setSessions(data.data);
        // Auto-expand all sessions
        setExpandedSessions(new Set(data.data.map((s: SessionGroup) => s.session_id)));
      }
    } catch {
      // Will show empty state
    } finally {
      setLoadingSessions(false);
    }
  };

  // ── Step 2: toggle resource selection ──
  const toggleResource = (id: number) => {
    setSelectedResourceIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const toggleSession = (sessionId: number) => {
    setExpandedSessions(prev => {
      const next = new Set(prev);
      next.has(sessionId) ? next.delete(sessionId) : next.add(sessionId);
      return next;
    });
  };

  const selectAllResources = () => {
    const allIds = sessions.flatMap(s => s.resources.map(r => r.id));
    setSelectedResourceIds(allIds);
  };

  const clearAllResources = () => setSelectedResourceIds([]);

  // ── Step 2 → 3: build rubric entries for selected questions ──
  const proceedToRubric = () => {
    const entries: RubricEntry[] = essayQuestions
      .filter((q: any) => selectedQuestionIds.includes(q.id))
      .map((q: any) => ({
        questionId: q.id,
        questionText: q.question_text || `Question ${q.id}`,
        maxScore: q.points || 10,
        criteria: [
          { name: 'Content & Accuracy', weight: 40 },
          { name: 'Critical Thinking', weight: 30 },
          { name: 'Writing Quality', weight: 20 },
          { name: 'Completeness', weight: 10 },
        ],
      }));
    setRubric(entries);
    setStep(3);
  };

  // ── Rubric helpers ──
  const updateWeight = (qIdx: number, cIdx: number, val: number) => {
    setRubric(prev => {
      const updated = prev.map((e, i) => {
        if (i !== qIdx) return e;
        const criteria = e.criteria.map((c, j) => j === cIdx ? { ...c, weight: val } : c);
        return { ...e, criteria };
      });
      return updated;
    });
  };

  const updateName = (qIdx: number, cIdx: number, val: string) => {
    setRubric(prev => prev.map((e, i) => {
      if (i !== qIdx) return e;
      const criteria = e.criteria.map((c, j) => j === cIdx ? { ...c, name: val } : c);
      return { ...e, criteria };
    }));
  };

  const addCriterion = (qIdx: number) => {
    setRubric(prev => prev.map((e, i) =>
      i === qIdx ? { ...e, criteria: [...e.criteria, { name: 'New Criterion', weight: 10 }] } : e
    ));
  };

  const removeCriterion = (qIdx: number, cIdx: number) => {
    setRubric(prev => prev.map((e, i) => {
      if (i !== qIdx) return e;
      return { ...e, criteria: e.criteria.filter((_, j) => j !== cIdx) };
    }));
  };

  const totalWeight = (entry: RubricEntry) => entry.criteria.reduce((s, c) => s + c.weight, 0);

  // ── Step 4: preflight — check file status before grading ──
  const checkFiles = async () => {
    setPreflight(prev => ({ ...prev, checking: true }));
    try {
      const res = await fetch('/api/assignments/check-files', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resourceIds: selectedResourceIds }),
      });
      const data = await res.json();
      if (data.success) {
        const { files, can_proceed } = data.data;
        const needsWarning = files.some((f: FileCheckResult) =>
          f.status === 'missing_openai' || f.status === 'missing_local'
        );
        setPreflight({
          checked: true,
          checking: false,
          files,
          can_proceed,
          // Auto-confirm if nothing needs attention
          confirmed: !needsWarning,
        });
        return { files, can_proceed, needsWarning };
      }
    } catch {
      // If preflight fails, allow grading to proceed — create will catch real errors
    }
    setPreflight(prev => ({ ...prev, checking: false, checked: true, confirmed: true }));
    return { files: [], can_proceed: true, needsWarning: false };
  };

  // ── Step 4: run grading ──
  const runGrading = async () => {
    setGradingError(null);
    setResults([]);
    setJobStatus(null);

    // Resolve courseId
    let courseId: string | number = courseCode;
    try {
      const courseRes = await fetch(`/api/courses/${courseCode}`);
      const courseData = await courseRes.json();
      courseId = courseData?.data?.id || courseCode;
    } catch { /* use courseCode fallback */ }

    // Run preflight if not yet done
    if (!preflight.checked) {
      const result = await checkFiles();
      if (result.needsWarning) {
        return;
      }
      if (!result.can_proceed) {
        setGradingError('No course materials are available. Upload course files before grading.');
        return;
      }
    }

    // If preflight surfaced warnings, require explicit user confirmation
    if (preflight.checked && !preflight.confirmed) return;

    setGrading(true);

    // Build API rubric format
    const apiRubric = rubric.map(e => ({
      questionId: e.questionId,
      max_score: e.maxScore,
      criteria: Object.fromEntries(e.criteria.map(c => [c.name, c.weight])),
      qualitative_scale: ['Excellent', 'Good', 'Fair', 'Poor'],
    }));

    // First, setup ACS (or re-run)
    try {
      const setupRes = await fetch('/api/assignments/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assignmentId: assignment.id, courseId, rubric: apiRubric, resourceIds: selectedResourceIds }),
      });
      const setupData = await setupRes.json();
      if (!setupData.success) {
        setGrading(false);
        setGradingError(
          setupData.details
            ? `${setupData.error}: ${setupData.details}`
            : setupData.error || 'Could not set up AI grading. Please try again.'
        );
        return;
      }
      // Partial indexing warning — some files failed but grading can still proceed
      if (setupData.data?.warning) {
        setGradingError(setupData.data.warning);
        // Don't return — continue to grading with the indexed files
      }
    } catch {
      setGrading(false);
      setGradingError('Connection error during setup. Please try again.');
      return;
    }

    // Then, kick off grading job
    try {
      const res = await fetch('/api/ai-grading/run-all', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assignmentId: assignment.id.toString() }),
      });
      const data = await res.json();
      if (data.success && data.jobId) {
        setJobId(data.jobId);
        setJobStatus({ id: data.jobId, total_students: 0, status: 'running', completed_at: null, items_processed: 0 });
        onRunStarted?.();
      } else {
        setGrading(false);
        setGradingError(data.error || data.message || 'Could not start grading. Please check that students have submitted essays.');
      }
    } catch {
      setGrading(false);
      setGradingError('Connection error. Please try again.');
    }
  };

  const toggleStudent = (id: string) => {
    setExpandedStudents(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  if (!isOpen) return null;

  const submissionCount = assignment.submissions?.length ?? 0;
  const progressPct = jobStatus?.total_students
    ? Math.round((jobStatus.items_processed / jobStatus.total_students) * 100)
    : 0;

  // Group results by student
  const studentMap = new Map<string, GradingResult[]>();
  results.forEach(r => {
    const arr = studentMap.get(r.student_id) || [];
    arr.push(r);
    studentMap.set(r.student_id, arr);
  });
  const visibleReviewRubric = rubric.slice(0, 2);
  const hiddenReviewRubricCount = Math.max(rubric.length - visibleReviewRubric.length, 0);

  return (
    <Dialog open={isOpen} onOpenChange={open => !open && onClose()}>
      <DialogContent className="sm:max-w-[720px] max-h-[86vh] overflow-y-auto overflow-x-hidden p-5 gap-3 [&>*]:min-w-0">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg">
            <FaRobot className="text-indigo-600" />
            AI Auto-Grading
          </DialogTitle>
          <DialogDescription className="text-gray-500">
            {assignment.title}
          </DialogDescription>
        </DialogHeader>

        {/* Step indicator — only steps 1-4 */}
        {step <= 4 && (
          <div className="flex items-center gap-2 py-2">
            {[
              { n: 1, label: 'Questions' },
              { n: 2, label: 'Materials' },
              { n: 3, label: 'Scoring' },
              { n: 4, label: 'Review' },
            ].map(({ n, label }, idx) => (
              <React.Fragment key={n}>
                <div className="flex items-center gap-2">
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold
                    ${step > n ? 'bg-indigo-600 text-white' : step === n ? 'bg-indigo-600 text-white' : 'bg-gray-200 text-gray-500'}`}>
                    {step > n ? <FaCheck size={10} /> : n}
                  </div>
                  <span className={`text-xs font-medium ${step === n ? 'text-indigo-700' : 'text-gray-400'}`}>{label}</span>
                </div>
                {idx < 3 && <div className="flex-1 h-px bg-gray-200" />}
              </React.Fragment>
            ))}
          </div>
        )}

        {/* Back button */}
        {(step === 2 || step === 3 || (step === 4 && !grading)) && (
          <button
            onClick={() => setStep(prev => (prev - 1) as Step)}
            className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 mb-2 w-fit"
          >
            <FaArrowLeft size={11} /> Back
          </button>
        )}

        {/* ═══════════════════
            STEP 1 — Pick questions
        ═══════════════════ */}
        {step === 1 && (
          <div className="space-y-5 py-2">
            <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-4">
              <p className="text-sm text-indigo-700 leading-relaxed">
                <strong>How AI grading works:</strong> The AI reads each student&apos;s essay answer,
                then compares it to your course materials and scoring guide to suggest a grade and
                feedback. You review and approve before scores are saved.
              </p>
            </div>

            {essayQuestions.length === 0 ? (
              <div className="text-center py-8 text-gray-400">
                <FaRobot size={32} className="inline mb-3 text-gray-300" />
                <p className="font-medium text-gray-500">No essay questions found</p>
                <p className="text-sm mt-1">AI grading only works for Essay and File Upload questions.</p>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-gray-700">
                    Select questions to grade ({selectedQuestionIds.length}/{essayQuestions.length} selected)
                  </h3>
                  <div className="flex gap-3 text-xs">
                    <button onClick={selectAll} className="text-indigo-600 hover:underline">Select all</button>
                    <button onClick={clearAll} className="text-gray-400 hover:underline">Clear</button>
                  </div>
                </div>

                <div className="space-y-2">
                  {essayQuestions.map((q: any, idx: number) => {
                    const selected = selectedQuestionIds.includes(q.id);
                    return (
                      <button
                        key={q.id}
                        onClick={() => toggleQuestion(q.id)}
                        className={`w-full text-left border rounded-xl p-4 transition-colors
                          ${selected ? 'bg-indigo-50 border-indigo-300' : 'bg-white border-gray-200 hover:border-gray-300'}`}
                      >
                        <div className="flex items-start gap-3">
                          <div className={`w-5 h-5 rounded flex items-center justify-center shrink-0 mt-0.5
                            ${selected ? 'bg-indigo-600' : 'border-2 border-gray-300'}`}>
                            {selected && <FaCheck size={10} className="text-white" />}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-800">
                              Question {idx + 1} — {q.points || 0} pts
                            </p>
                            <p className="text-sm text-gray-500 mt-0.5 line-clamp-2">
                              {q.question_text}
                            </p>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>

                <div className="flex items-center gap-3 pt-2">
                  <Button
                    onClick={proceedToMaterials}
                    disabled={selectedQuestionIds.length === 0}
                    className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white"
                  >
                    Next: Choose Materials <FaArrowRight size={12} />
                  </Button>
                  <Button variant="outline" onClick={onClose}>Cancel</Button>
                </div>
              </>
            )}
          </div>
        )}

        {/* ═══════════════════
            STEP 2 — Choose Materials
        ═══════════════════ */}
        {step === 2 && (
          <div className="space-y-5 py-2">
            <p className="text-sm text-gray-500">
              Select the course materials the AI should use as <strong>grading reference</strong>.
              Only selected files will be used to verify student answers.
            </p>

            {loadingSessions ? (
              <div className="text-center py-8">
                <FaSpinner className="animate-spin inline mb-2 text-gray-400" size={20} />
                <p className="text-sm text-gray-400">Loading course materials…</p>
              </div>
            ) : sessions.length === 0 ? (
              <div className="text-center py-8 text-gray-400">
                <FaExclamationTriangle size={28} className="inline mb-3 text-gray-300" />
                <p className="font-medium text-gray-500">No course materials found</p>
                <p className="text-sm mt-1">Upload files to your course sessions before using AI grading.</p>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-gray-700">
                    {selectedResourceIds.length} file{selectedResourceIds.length !== 1 ? 's' : ''} selected
                  </h3>
                  <div className="flex gap-3 text-xs">
                    <button onClick={selectAllResources} className="text-indigo-600 hover:underline">Select all</button>
                    <button onClick={clearAllResources} className="text-gray-400 hover:underline">Clear</button>
                  </div>
                </div>

                <div className="space-y-2">
                  {sessions.map(session => {
                    const isExpanded = expandedSessions.has(session.session_id);
                    const sessionSelectedCount = session.resources.filter(r => selectedResourceIds.includes(r.id)).length;
                    return (
                      <div key={session.session_id} className="border rounded-xl overflow-hidden">
                        <button
                          onClick={() => toggleSession(session.session_id)}
                          className="w-full text-left px-4 py-3 flex items-center justify-between hover:bg-gray-50 transition-colors"
                        >
                          <div className="flex items-center gap-2">
                            {isExpanded ? <FaChevronUp size={11} className="text-gray-400" /> : <FaChevronDown size={11} className="text-gray-400" />}
                            <div>
                              <p className="text-sm font-semibold text-gray-800">
                                Session {session.session_number}: {session.session_title}
                              </p>
                              <p className="text-xs text-gray-400">
                                {session.resources.length} file{session.resources.length !== 1 ? 's' : ''}
                                {sessionSelectedCount > 0 && (
                                  <span className="text-indigo-600 ml-1">· {sessionSelectedCount} selected</span>
                                )}
                              </p>
                            </div>
                          </div>
                        </button>

                        {isExpanded && (
                          <div className="border-t px-4 py-2 space-y-1 bg-gray-50/50">
                            {session.resources.map(resource => {
                              const selected = selectedResourceIds.includes(resource.id);
                              return (
                                <button
                                  key={resource.id}
                                  onClick={() => toggleResource(resource.id)}
                                  className={`w-full text-left flex items-center gap-3 px-3 py-2 rounded-lg transition-colors
                                    ${selected ? 'bg-indigo-50 border border-indigo-200' : 'hover:bg-white border border-transparent'}`}
                                >
                                  <div className={`w-5 h-5 rounded flex items-center justify-center shrink-0
                                    ${selected ? 'bg-indigo-600' : 'border-2 border-gray-300'}`}>
                                    {selected && <FaCheck size={10} className="text-white" />}
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <p className="text-sm text-gray-800 truncate">{resource.file_title}</p>
                                    <p className="text-xs text-gray-400 truncate">{resource.file_name}</p>
                                  </div>
                                  <span className="text-xs text-gray-400 uppercase shrink-0">{resource.file_type}</span>
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                <div className="flex items-center gap-3 pt-2">
                  <Button
                    onClick={proceedToRubric}
                    disabled={selectedResourceIds.length === 0}
                    className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white"
                  >
                    Next: Set Scoring Guide <FaArrowRight size={12} />
                  </Button>
                  <Button variant="outline" onClick={onClose}>Cancel</Button>
                </div>
              </>
            )}
          </div>
        )}

        {/* ═══════════════════
            STEP 3 — Rubric
        ═══════════════════ */}
        {step === 3 && (
          <div className="space-y-5 py-2">
            <p className="text-sm text-gray-500">
              Tell the AI what matters most. Adjust the <strong>weight</strong> of each criterion
              — they should add up to <strong>100%</strong>.
            </p>

            <div className="space-y-5">
              {rubric.map((entry, qIdx) => {
                const total = totalWeight(entry);
                const isValid = total === 100;
                return (
                  <div key={entry.questionId} className="border rounded-xl overflow-hidden">
                    {/* Question header */}
                    <div className="bg-gray-50 border-b px-4 py-3">
                      <p className="text-sm font-semibold text-gray-800">
                        {entry.questionText.length > 80 ? entry.questionText.slice(0, 80) + '…' : entry.questionText}
                      </p>
                      <p className="text-xs text-gray-400 mt-0.5">Max score: {entry.maxScore} pts</p>
                    </div>

                    {/* Criteria rows */}
                    <div className="p-4 space-y-2">
                      {entry.criteria.map((c, cIdx) => (
                        <div key={cIdx} className="flex items-center gap-2">
                          <input
                            type="text"
                            value={c.name}
                            onChange={e => updateName(qIdx, cIdx, e.target.value)}
                            className="flex-1 min-w-0 px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                          />
                          <div className="flex items-center gap-1">
                            <input
                              type="number"
                              value={c.weight}
                              onChange={e => updateWeight(qIdx, cIdx, parseInt(e.target.value) || 0)}
                              className="w-16 px-2 py-1.5 border border-gray-200 rounded-lg text-sm text-center focus:outline-none focus:ring-2 focus:ring-indigo-400"
                              min={0}
                              max={100}
                            />
                            <span className="text-sm text-gray-400">%</span>
                          </div>
                          <button
                            onClick={() => removeCriterion(qIdx, cIdx)}
                            className="text-gray-300 hover:text-red-500 transition-colors text-lg leading-none px-1"
                            title="Remove"
                          >×</button>
                        </div>
                      ))}

                      {/* Total + add */}
                      <div className="flex items-center justify-between pt-1">
                        <button
                          onClick={() => addCriterion(qIdx)}
                          className="text-xs text-indigo-600 hover:underline"
                        >
                          + Add criterion
                        </button>
                        <span className={`text-xs font-semibold ${isValid ? 'text-green-600' : 'text-red-500'}`}>
                          Total: {total}% {isValid ? '✓' : '— must be 100%'}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="flex items-center gap-3 pt-2">
              <Button
                onClick={() => setStep(4)}
                disabled={rubric.some(e => totalWeight(e) !== 100)}
                className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white"
              >
                Next: Review &amp; Start <FaArrowRight size={12} />
              </Button>
            </div>
          </div>
        )}

        {/* ═══════════════════
            STEP 4 — Confirm
        ═══════════════════ */}
        {step === 4 && (
          <div className="flex min-w-0 flex-col gap-3 py-1">
            {gradingError && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-3 flex items-start gap-2">
                <FaExclamationTriangle className="text-red-500 shrink-0 mt-0.5" />
                <p className="text-sm text-red-700">{gradingError}</p>
              </div>
            )}

            {!grading && (
              <>
                <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-3">
                  <h3 className="text-sm font-semibold text-indigo-800 mb-2">Ready to start AI grading</h3>
                  <div className="grid gap-1.5 text-sm text-indigo-700 sm:grid-cols-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <FaCheckCircle className="text-indigo-400 shrink-0" size={13} />
                      <span className="truncate"><strong>{submissionCount}</strong> student submission{submissionCount !== 1 ? 's' : ''}</span>
                    </div>
                    <div className="flex items-center gap-2 min-w-0">
                      <FaCheckCircle className="text-indigo-400 shrink-0" size={13} />
                      <span className="truncate"><strong>{selectedQuestionIds.length}</strong> essay question{selectedQuestionIds.length !== 1 ? 's' : ''}</span>
                    </div>
                    <div className="flex items-center gap-2 min-w-0">
                      <FaCheckCircle className="text-indigo-400 shrink-0" size={13} />
                      <span className="truncate"><strong>{selectedResourceIds.length}</strong> course material{selectedResourceIds.length !== 1 ? 's' : ''}</span>
                    </div>
                    <div className="flex items-center gap-2 min-w-0">
                      <FaCheckCircle className="text-indigo-400 shrink-0" size={13} />
                      <span className="truncate">Save scores after review</span>
                    </div>
                  </div>
                </div>

                {/* Rubric summary */}
                <div className="min-w-0">
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <h4 className="text-sm font-semibold text-gray-600">Your scoring guide:</h4>
                    {hiddenReviewRubricCount > 0 && (
                      <span className="shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-500">
                        +{hiddenReviewRubricCount} more
                      </span>
                    )}
                  </div>
                  <div className="flex min-w-0 flex-col gap-2">
                    {visibleReviewRubric.map(entry => (
                      <div key={entry.questionId} className="min-w-0 border rounded-xl p-2.5">
                        <p className="truncate text-xs font-semibold text-gray-600 mb-1.5">
                          {entry.questionText}
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                          {entry.criteria.map((c, i) => (
                            <span key={i} className="max-w-full truncate text-xs bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-full">
                              {c.name}: {c.weight}%
                            </span>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}

            {/* ── Preflight checking spinner ── */}
            {!grading && preflight.checking && (
              <div className="bg-gray-50 border border-gray-200 rounded-xl p-3 flex items-center gap-2">
                <FaSpinner className="animate-spin text-gray-500" size={13} />
                <span className="text-sm text-gray-600">Checking course material files…</span>
              </div>
            )}

            {/* ── Preflight warning panel ── */}
            {!grading && preflight.checked && !preflight.confirmed && !preflight.checking && (
              <div className="border border-yellow-300 bg-yellow-50 rounded-xl overflow-hidden">
                <div className="px-4 py-3 border-b border-yellow-200 flex items-center gap-2">
                  <FaExclamationTriangle className="text-yellow-600 shrink-0" size={14} />
                  <span className="text-sm font-semibold text-yellow-800">Course material issues detected</span>
                </div>
                <div className="p-4 space-y-2">
                  {preflight.files.map((f, i) => {
                    if (f.status === 'ok' || f.status === 'new') return null;
                    return (
                      <div key={i} className={`rounded-lg px-3 py-2 text-xs flex items-start gap-2
                        ${f.status === 'missing_local'
                          ? 'bg-red-50 border border-red-200'
                          : 'bg-yellow-100 border border-yellow-200'}`}>
                        <span className="mt-0.5 shrink-0">
                          {f.status === 'missing_local' ? '🚫' : '⚠️'}
                        </span>
                        <div className="min-w-0">
                          <p className="font-medium text-gray-800 truncate">{f.filename}</p>
                          <p className="text-gray-500 break-all">{f.local_path}</p>
                          <p className={f.status === 'missing_local' ? 'text-red-600 mt-0.5' : 'text-yellow-700 mt-0.5'}>
                            {f.status === 'missing_local'
                              ? 'File is missing from disk — cannot be re-uploaded. Remove or replace it in course materials.'
                              : 'Previously uploaded to OpenAI but no longer found there — will be re-uploaded from disk.'}
                          </p>
                        </div>
                      </div>
                    );
                  })}

                  {!preflight.can_proceed ? (
                    <p className="text-sm text-red-700 font-medium pt-1">
                      No usable course materials found. Fix the issues above before grading.
                    </p>
                  ) : (
                    <div className="flex items-center justify-between pt-2">
                      <p className="text-xs text-yellow-700">
                        {preflight.files.filter(f => f.status === 'ok' || (f.status === 'new' && f.local_exists)).length} file(s) will be used for grading.
                        Missing files will be re-uploaded automatically.
                      </p>
                      <Button
                        onClick={() => setPreflight(prev => ({ ...prev, confirmed: true }))}
                        className="text-xs bg-yellow-600 hover:bg-yellow-700 text-white px-3 py-1.5 h-auto ml-3 shrink-0"
                      >
                        Confirm &amp; Continue
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            )}

            {grading && (
              <div className="min-w-0 bg-indigo-50 border border-indigo-200 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-3">
                  <FaSpinner className="animate-spin text-indigo-600" />
                  <span className="font-medium text-indigo-800">AI is grading essays…</span>
                </div>
                <div className="mb-3 grid gap-2 text-xs text-indigo-700 sm:grid-cols-3">
                  <span className="rounded-lg bg-white/60 px-2 py-1"><strong>{submissionCount}</strong> submissions</span>
                  <span className="rounded-lg bg-white/60 px-2 py-1"><strong>{selectedQuestionIds.length}</strong> questions</span>
                  <span className="rounded-lg bg-white/60 px-2 py-1"><strong>{selectedResourceIds.length}</strong> materials</span>
                </div>
                <div className="w-full max-w-full bg-indigo-200 rounded-full h-2.5 mb-2 overflow-hidden">
                  <div
                    className="bg-indigo-600 h-2.5 rounded-full transition-all duration-500"
                    style={{ width: `${Math.min(100, Math.max(0, progressPct || 5))}%` }}
                  />
                </div>
                <p className="text-xs text-indigo-600">This may take a few minutes for large classes.</p>
              </div>
            )}

            <div className="flex items-center gap-3 pt-2">
              <Button
                onClick={runGrading}
                disabled={grading || preflight.checking || (preflight.checked && !preflight.confirmed)}
                className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white"
              >
                {grading ? <FaSpinner className="animate-spin" size={13} /> : preflight.checking ? <FaSpinner className="animate-spin" size={13} /> : <FaPlay size={13} />}
                {grading ? 'Grading in progress…' : preflight.checking ? 'Checking files…' : 'Start AI Grading'}
              </Button>
              {!grading && <Button variant="outline" onClick={onClose}>Cancel</Button>}
            </div>
          </div>
        )}

        {/* ═══════════════════
            STEP 5 — Results
        ═══════════════════ */}
        {step === 5 && (
          <div className="space-y-5 py-2">
            {/* Status banner */}
            {jobStatus?.status === 'completed' && (
              <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-4 flex items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <FaRobot className="text-indigo-600 mt-0.5 shrink-0" />
                  <div>
                    <p className="font-semibold text-indigo-800">AI suggestions — reference only</p>
                    <p className="text-xs text-indigo-700 mt-0.5 leading-relaxed">
                      These scores are AI-generated suggestions and do not replace teacher grading.
                      Teacher grades in the gradebook remain authoritative.
                    </p>
                  </div>
                </div>
                <Button
                  variant="outline"
                  onClick={rerunFromScratch}
                  className="shrink-0 text-xs border-indigo-300 text-indigo-700 hover:bg-indigo-100"
                >
                  <FaPlay size={10} className="mr-1.5" /> Rerun from scratch
                </Button>
              </div>
            )}

            {jobStatus?.status === 'failed' && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-center gap-2">
                <FaExclamationTriangle className="text-red-500" />
                <p className="text-sm text-red-700">Grading failed. <button onClick={() => setStep(4)} className="underline">Try again</button></p>
              </div>
            )}

            {/* Student result cards */}
            {studentMap.size === 0 && (
              <div className="text-center py-8 text-gray-400">
                <FaSpinner className="animate-spin inline mb-2" size={20} />
                <p>Loading results…</p>
              </div>
            )}

            <div className="space-y-3">
              {Array.from(studentMap.entries()).map(([studentId, studentResults]) => {
                const isExpanded = expandedStudents.has(studentId);
                const totalScore = studentResults.reduce((s, r) => s + (r.score ?? 0), 0);
                const totalMax = studentResults.reduce((s, r) => s + (r.max_score || 0), 0);
                const overallConf = studentResults.some(r => r.confidence === 'low')
                  ? 'low'
                  : studentResults.some(r => r.confidence === 'medium')
                    ? 'medium'
                    : 'high';
                const conf = confidenceLabel(overallConf);

                return (
                  <div key={studentId} className="border rounded-xl overflow-hidden">
                    {/* Card header — always visible */}
                    <button
                      onClick={() => toggleStudent(studentId)}
                      className="w-full text-left px-4 py-3 flex items-center justify-between hover:bg-gray-50 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-indigo-100 flex items-center justify-center shrink-0">
                          <FaUser className="text-indigo-500" size={14} />
                        </div>
                        <div>
                          <p className="font-semibold text-gray-800">Student {studentId}</p>
                          <p className="text-xs text-gray-400">
                            {studentResults.length} question{studentResults.length > 1 ? 's' : ''} graded
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        {/* Score pill */}
                        {totalMax > 0 && (
                          <span className="text-sm font-bold text-gray-700">
                            {totalScore}/{totalMax} pts
                          </span>
                        )}
                        {/* Confidence */}
                        <span className={`text-xs px-2 py-1 rounded-full border font-medium ${conf.bg} ${conf.color}`}>
                          {conf.icon} {conf.text}
                        </span>
                        {isExpanded ? <FaChevronUp className="text-gray-400" size={12} /> : <FaChevronDown className="text-gray-400" size={12} />}
                      </div>
                    </button>

                    {/* Expanded: per-question details */}
                    {isExpanded && (
                      <div className="border-t divide-y">
                        {studentResults.map((r, idx) => {
                          const qConf = confidenceLabel(r.confidence);
                          return (
                            <div key={idx} className="px-4 py-4">
                              <div className="flex items-center justify-between mb-2">
                                <span className="text-xs font-semibold text-gray-500">Question {r.question_id}</span>
                                <div className="flex items-center gap-2">
                                  {r.qualitative_grade && (
                                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${gradeColor(r.qualitative_grade)}`}>
                                      {r.qualitative_grade}
                                    </span>
                                  )}
                                  <span className="text-sm font-bold text-gray-700">
                                    {r.score ?? '—'}/{r.max_score} pts
                                  </span>
                                </div>
                              </div>

                              {/* Feedback */}
                              <div className="bg-gray-50 rounded-lg p-3 text-sm text-gray-700 leading-relaxed">
                                {r.feedback || 'No feedback provided.'}
                              </div>

                              {/* Citations */}
                              {r.citations?.length > 0 && (
                                <div className="mt-2 flex flex-wrap gap-1">
                                  {r.citations.map((c, i) => (
                                    <span key={i} className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full">
                                      📄 {c}
                                    </span>
                                  ))}
                                </div>
                              )}

                              {/* Confidence note */}
                              <div className={`mt-2 text-xs px-3 py-1.5 rounded-lg border ${qConf.bg} ${qConf.color}`}>
                                {qConf.icon} {qConf.text}
                                {r.language_detected && (
                                  <span className="ml-2 text-gray-400">· {r.language_detected === 'id' ? 'Indonesian' : 'English'}</span>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};
