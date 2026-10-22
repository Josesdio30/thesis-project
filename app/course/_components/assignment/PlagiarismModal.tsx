import React, { useState, useEffect, useCallback } from 'react';
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
  FaShieldAlt,
  FaPlay,
  FaSpinner,
  FaArrowLeft,
  FaDownload,
  FaUser,
  FaCheck,
  FaTimes,
  FaChevronRight,
  FaExclamationTriangle,
  FaCheckCircle,
  FaExclamationCircle,
  FaHistory,
} from 'react-icons/fa';

interface PlagiarismModalProps {
  assignment: Assignment;
  isOpen: boolean;
  onClose: () => void;
  onRunStarted?: () => void;
}

interface StudentResult {
  student_id: string;
  student_name: string;
  submission_id: string;
  high_risk_count: number;
  medium_risk_count: number;
  low_risk_count: number;
  max_similarity: number;
}

interface SimilarityMatch {
  comparison_id: string;
  target_student_name: string;
  similarity_score: number;
  risk_level: 'HIGH' | 'MEDIUM' | 'LOW' | 'NONE';
  match_count: number;
}

interface ChunkMatch {
  source_chunk_id: string;
  target_chunk_id: string;
  similarity: number;
  source_text: string;
  target_text: string;
  question_index?: number;
}

interface PerQuestionScore {
  question_index: number;
  semantic_score: number;
  lexical_score: number;
  combined_score: number;
}

interface EvidenceData {
  comparison_id: string;
  source_student: string;
  target_student: string;
  source_content: string;
  target_content: string;
  overall_similarity: number;
  risk_level: string;
  matched_chunks: ChunkMatch[];
  per_question_scores?: PerQuestionScore[];
  flag_id: string | null;
  reviewed: boolean;
  is_false_positive: boolean;
  teacher_notes: string | null;
}

// Step 1 → Step 2 → Step 3
type Step = 'confirm' | 'results' | 'comparison';
type ScanScope = 'all' | 'specific';

function riskLabel(level: string, similarity: number) {
  const pct = Math.round(similarity * 100);
  if (level === 'HIGH') return { label: `${pct}% Similar — Likely Copied`, color: 'text-red-700', bg: 'bg-red-50 border-red-200', icon: <FaExclamationCircle className="text-red-500" /> };
  if (level === 'MEDIUM') return { label: `${pct}% Similar — Needs Review`, color: 'text-orange-700', bg: 'bg-orange-50 border-orange-200', icon: <FaExclamationTriangle className="text-orange-500" /> };
  if (level === 'LOW') return { label: `${pct}% Similar — Minor Overlap`, color: 'text-yellow-700', bg: 'bg-yellow-50 border-yellow-200', icon: <FaExclamationTriangle className="text-yellow-400" /> };
  return { label: `${pct}% Similar — No Issue`, color: 'text-green-700', bg: 'bg-green-50 border-green-200', icon: <FaCheckCircle className="text-green-500" /> };
}

export const PlagiarismModal = ({ assignment, isOpen, onClose, onRunStarted }: PlagiarismModalProps) => {
  const [step, setStep] = useState<Step>('confirm');

  // Scope selection
  const [scanScope, setScanScope] = useState<ScanScope>('all');
  const [selectedQuestionIds, setSelectedQuestionIds] = useState<string[]>([]);

  // Detection state
  const [detecting, setDetecting] = useState(false);
  const [detectionId, setDetectionId] = useState<string | null>(null);
  const [detectionStatus, setDetectionStatus] = useState<string | null>(null);
  const [detectionProgress, setDetectionProgress] = useState({ processed: 0, total: 0 });
  const [detectionError, setDetectionError] = useState<string | null>(null);

  // Results state
  const [results, setResults] = useState<StudentResult[]>([]);
  const [loadingResults, setLoadingResults] = useState(false);
  const [hasExistingResults, setHasExistingResults] = useState(false);
  const [lastScanScope, setLastScanScope] = useState<string[] | null>(null);

  // Comparison state
  const [selectedStudent, setSelectedStudent] = useState<StudentResult | null>(null);
  const [similarities, setSimilarities] = useState<SimilarityMatch[]>([]);
  const [loadingSimilarities, setLoadingSimilarities] = useState(false);
  const [selectedMatch, setSelectedMatch] = useState<SimilarityMatch | null>(null);
  const [evidence, setEvidence] = useState<EvidenceData | null>(null);
  const [loadingEvidence, setLoadingEvidence] = useState(false);

  // Flag state
  const [flagNotes, setFlagNotes] = useState('');
  const [savingFlag, setSavingFlag] = useState(false);
  const [flagSaved, setFlagSaved] = useState(false);

  // Derive essay questions once so they're usable in all steps
  const essayQuestions = (assignment.questions ?? []).filter((q: any) => {
    const t = (q.question_type || '').toUpperCase();
    return t === 'ESSAY' || t === 'FILE_UPLOAD';
  });

  // Reset on open
  useEffect(() => {
    if (isOpen && assignment) {
      setStep('confirm');
      setDetecting(false);
      setDetectionId(null);
      setDetectionStatus(null);
      setDetectionError(null);
      setSelectedStudent(null);
      setEvidence(null);
      setFlagSaved(false);
      setScanScope('all');
      setSelectedQuestionIds([]);
      checkExistingResults();
    }
  }, [isOpen, assignment?.id]);

  // Poll detection progress
  useEffect(() => {
    if (!detectionId || detectionStatus === 'completed' || detectionStatus === 'failed') return;
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/plagiarism/status/${detectionId}`);
        const data = await res.json();
        setDetectionStatus(data.status);
        setDetectionProgress({ processed: data.processed_submissions || 0, total: data.total_submissions || 0 });
        if (data.status === 'completed') {
          setDetecting(false);
          loadResults();
        } else if (data.status === 'failed') {
          setDetecting(false);
          setDetectionError(data.error_message || 'Detection failed. Please try again.');
        }
      } catch { /* keep polling */ }
    }, 3000);
    return () => clearInterval(interval);
  }, [detectionId, detectionStatus]);

  const checkExistingResults = async () => {
    try {
      const res = await fetch(`/api/plagiarism/status/latest/${assignment.id}`);
      const data = await res.json();
      if (data && data.status === 'completed') {
        setHasExistingResults(true);
        setLastScanScope(data.scanned_question_ids ?? null);
        const resultsRes = await fetch(`/api/plagiarism/results/${assignment.id}`);
        const resultsData = await resultsRes.json();
        if (Array.isArray(resultsData)) {
          setResults(resultsData);
        }
      }
    } catch { /* ignore */ }
  };

  const loadResults = async () => {
    setLoadingResults(true);
    try {
      const [resultsRes, latestRes] = await Promise.all([
        fetch(`/api/plagiarism/results/${assignment.id}`),
        fetch(`/api/plagiarism/status/latest/${assignment.id}`),
      ]);
      const data = await resultsRes.json();
      const latestData = await latestRes.json();
      if (Array.isArray(data)) {
        setResults(data);
        setStep('results');
      }
      if (latestData?.scanned_question_ids) {
        setLastScanScope(latestData.scanned_question_ids);
      }
    } catch (err) {
      console.error('Failed to load results:', err);
    } finally {
      setLoadingResults(false);
    }
  };

  const toggleQuestionId = (qId: string) => {
    setSelectedQuestionIds(prev =>
      prev.includes(qId) ? prev.filter(id => id !== qId) : [...prev, qId]
    );
  };

  const startDetection = async () => {
    if (scanScope === 'specific' && selectedQuestionIds.length === 0) {
      setDetectionError('Please select at least one question to scan.');
      return;
    }
    setDetecting(true);
    setDetectionStatus('processing');
    setDetectionError(null);
    setDetectionProgress({ processed: 0, total: 0 });
    try {
      const body: Record<string, unknown> = { assignmentId: assignment.id.toString() };
      if (scanScope === 'specific') {
        body.questionIds = selectedQuestionIds;
      }
      // scanScope === 'all' sends no questionIds, backend treats as "all"
      const res = await fetch('/api/plagiarism/detect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (data.detectionId) {
        setDetectionId(data.detectionId);
        onRunStarted?.();
      } else {
        setDetecting(false);
        setDetectionError(data.error || 'Something went wrong. Please try again.');
      }
    } catch {
      setDetecting(false);
      setDetectionError('Connection error. Please try again.');
    }
  };

  const openStudentMatches = async (student: StudentResult) => {
    setSelectedStudent(student);
    setSelectedMatch(null);
    setEvidence(null);
    setStep('comparison');
    setLoadingSimilarities(true);
    try {
      const res = await fetch(`/api/plagiarism/similarities/${student.submission_id}`);
      const data = await res.json();
      setSimilarities(data.matches || []);
    } catch {
      setSimilarities([]);
    } finally {
      setLoadingSimilarities(false);
    }
  };

  const openEvidence = async (match: SimilarityMatch) => {
    setSelectedMatch(match);
    setFlagNotes('');
    setFlagSaved(false);
    setLoadingEvidence(true);
    try {
      const subId = selectedStudent?.submission_id || '';
      const res = await fetch(`/api/plagiarism/evidence/${match.comparison_id}?submissionId=${subId}`);
      const data = await res.json();
      setEvidence(data);
    } catch {
      setEvidence(null);
    } finally {
      setLoadingEvidence(false);
    }
  };

  const saveFlag = async (isFalsePositive: boolean) => {
    if (!evidence?.flag_id) return;
    setSavingFlag(true);
    try {
      const res = await fetch('/api/plagiarism/flag', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          flag_id: evidence.flag_id,
          action: isFalsePositive ? 'marked_false_positive' : 'warning_sent',
          notes: flagNotes,
          is_false_positive: isFalsePositive,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setEvidence(prev => prev ? { ...prev, reviewed: true, is_false_positive: isFalsePositive, teacher_notes: flagNotes } : null);
        setFlagSaved(true);
      }
    } catch {
      alert('Failed to save. Please try again.');
    } finally {
      setSavingFlag(false);
    }
  };

  const goBack = useCallback(() => {
    if (step === 'comparison' && selectedMatch) {
      setSelectedMatch(null);
      setEvidence(null);
    } else if (step === 'comparison') {
      setStep('results');
      setSelectedStudent(null);
    } else if (step === 'results') {
      setStep('confirm');
    }
  }, [step, selectedMatch]);

  if (!isOpen) return null;

  // Scope helpers
  const scopeWillChange =
    hasExistingResults &&
    lastScanScope !== null &&
    (
      (scanScope === 'all' && !lastScanScope.includes('all')) ||
      (scanScope === 'specific' && (
        lastScanScope.includes('all') ||
        selectedQuestionIds.slice().sort().join(',') !== lastScanScope.slice().sort().join(',')
      ))
    );

  const scopeBadgeText = (() => {
    if (!lastScanScope) return null;
    if (lastScanScope.includes('all')) {
      return `Full scan — all ${essayQuestions.length} essay question${essayQuestions.length !== 1 ? 's' : ''}`;
    }
    const labels = lastScanScope.map(id => {
      const idx = essayQuestions.findIndex((q: any) => q.id.toString() === id);
      return idx >= 0 ? `Q${idx + 1}` : id;
    });
    return `Partial scan — ${labels.join(', ')}`;
  })();

  // --- Bucket students by risk ---
  const highRiskStudents = results.filter(r => r.high_risk_count > 0);
  const mediumRiskStudents = results.filter(r => r.medium_risk_count > 0 && r.high_risk_count === 0);
  const cleanStudents = results.filter(r => r.high_risk_count === 0 && r.medium_risk_count === 0);
  const submissionCount = assignment.submissions?.length ?? 0;

  return (
    <Dialog open={isOpen} onOpenChange={open => !open && onClose()}>
      <DialogContent className="sm:max-w-[900px] max-h-[90vh] overflow-y-auto overflow-x-hidden [&>*]:min-w-0">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg">
            <FaShieldAlt className="text-amber-500" />
            Plagiarism Check
          </DialogTitle>
          <DialogDescription className="text-gray-500">
            {assignment.title}
          </DialogDescription>
        </DialogHeader>

        {/* Back button */}
        {step !== 'confirm' && (
          <button
            onClick={goBack}
            className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 mb-2 w-fit"
          >
            <FaArrowLeft size={11} /> Back
          </button>
        )}

        {/* ═══════════════════════════════════════════════
            STEP 1 — CONFIRM
        ═══════════════════════════════════════════════ */}
        {step === 'confirm' && (
          <div className="space-y-6 py-2">
            {/* Info box */}
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-5">
              <div className="flex items-start gap-3">
                <FaShieldAlt className="text-amber-500 mt-0.5 shrink-0" size={20} />
                <div>
                  <h3 className="font-semibold text-amber-800 mb-1">How it works</h3>
                  <p className="text-sm text-amber-700 leading-relaxed">
                    The system reads student essay answers and compares every student&apos;s
                    work against each other question-by-question to find similar writing.
                    This usually takes <strong>1–3 minutes</strong> depending on submissions.
                  </p>
                </div>
              </div>
            </div>

            {/* Scope selector */}
            {essayQuestions.length > 0 ? (
              <div className="border border-gray-200 rounded-xl p-4 space-y-3">
                <p className="text-sm font-semibold text-gray-700">What to scan</p>
                <div className="space-y-2">
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input
                      type="radio"
                      name="scanScope"
                      value="all"
                      checked={scanScope === 'all'}
                      onChange={() => { setScanScope('all'); setSelectedQuestionIds([]); }}
                      className="accent-amber-600"
                    />
                    <div>
                      <span className="text-sm font-medium text-gray-800">All essay questions</span>
                      <p className="text-xs text-gray-500">
                        Compare answers to all {essayQuestions.length} essay question{essayQuestions.length !== 1 ? 's' : ''} — most thorough
                      </p>
                    </div>
                  </label>
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input
                      type="radio"
                      name="scanScope"
                      value="specific"
                      checked={scanScope === 'specific'}
                      onChange={() => setScanScope('specific')}
                      className="accent-amber-600"
                    />
                    <div>
                      <span className="text-sm font-medium text-gray-800">Specific questions</span>
                      <p className="text-xs text-gray-500">Choose one or more questions to compare</p>
                    </div>
                  </label>
                </div>

                {/* Question checkbox list */}
                {scanScope === 'specific' && (
                  <div className="mt-2 border border-gray-100 rounded-lg divide-y divide-gray-100">
                    {essayQuestions.map((q: any, idx: number) => (
                      <label
                        key={q.id}
                        className="flex items-start gap-3 px-3 py-2.5 cursor-pointer hover:bg-gray-50"
                      >
                        <input
                          type="checkbox"
                          checked={selectedQuestionIds.includes(q.id.toString())}
                          onChange={() => toggleQuestionId(q.id.toString())}
                          className="mt-0.5 accent-amber-600"
                        />
                        <div className="min-w-0">
                          <span className="text-xs font-semibold text-amber-700 mr-1.5">Q{idx + 1}</span>
                          <span className="text-sm text-gray-700">
                            {q.question_text.length > 100
                              ? q.question_text.slice(0, 100) + '…'
                              : q.question_text}
                          </span>
                        </div>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 text-center text-sm text-gray-500">
                No essay questions found in this assignment. Plagiarism check applies to essay and file-upload questions only.
              </div>
            )}

            {/* Stats */}
            <div className="grid grid-cols-2 gap-4">
              <div className="border rounded-xl p-4 text-center">
                <div className="text-3xl font-bold text-gray-800">{submissionCount}</div>
                <div className="text-sm text-gray-500 mt-1">Submissions to check</div>
              </div>
              <div className="border rounded-xl p-4 text-center">
                <div className="text-3xl font-bold text-gray-800">
                  {submissionCount > 1 ? `${submissionCount * (submissionCount - 1) / 2}` : '—'}
                </div>
                <div className="text-sm text-gray-500 mt-1">Pairs to compare</div>
              </div>
            </div>

            {submissionCount < 2 && (
              <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 text-center text-sm text-gray-500">
                At least 2 student submissions are needed to run a plagiarism check.
              </div>
            )}

            {/* Scope-change warning */}
            {scopeWillChange && (
              <div className="flex items-start gap-3 bg-yellow-50 border border-yellow-200 rounded-xl p-4">
                <FaExclamationTriangle className="text-yellow-500 mt-0.5 shrink-0" size={15} />
                <div>
                  <p className="text-sm font-medium text-yellow-800">Scope change detected</p>
                  <p className="text-xs text-yellow-700 mt-0.5">
                    Previous scan: <strong>{scopeBadgeText}</strong>.
                    Running a new scan with different scope will replace those results.
                  </p>
                </div>
              </div>
            )}

            {/* Existing results notice */}
            {hasExistingResults && (
              <div className="flex items-center justify-between bg-blue-50 border border-blue-200 rounded-xl p-4">
                <div>
                  <div className="flex items-center gap-2">
                    <FaHistory size={12} className="text-blue-500" />
                    <p className="text-sm font-medium text-blue-800">Previous results available</p>
                  </div>
                  {scopeBadgeText && (
                    <p className="text-xs text-blue-600 mt-0.5">{scopeBadgeText}</p>
                  )}
                </div>
                <Button variant="outline" size="sm" onClick={() => loadResults()} className="ml-4 shrink-0">
                  View Past Results
                </Button>
              </div>
            )}

            {/* Error */}
            {detectionError && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700">
                ⚠️ {detectionError}
              </div>
            )}

            {/* Progress */}
            {detecting && (
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-5">
                <div className="flex items-center gap-2 mb-3">
                  <FaSpinner className="animate-spin text-blue-600" />
                  <span className="font-medium text-blue-800">Checking for plagiarism…</span>
                </div>
                {detectionProgress.total > 0 && (
                  <>
                    <div className="w-full max-w-full bg-blue-200 rounded-full h-2.5 mb-2 overflow-hidden">
                      <div
                        className="bg-blue-600 h-2.5 rounded-full transition-all duration-500"
                        style={{
                          width: `${Math.min(
                            100,
                            Math.max(
                              0,
                              Math.round((detectionProgress.processed / detectionProgress.total) * 100)
                            )
                          )}%`,
                        }}
                      />
                    </div>
                    <p className="text-xs text-blue-600">
                      Processing {detectionProgress.processed} of {detectionProgress.total} submissions…
                    </p>
                  </>
                )}
              </div>
            )}

            {/* Actions */}
            <div className="flex items-center gap-3 pt-2">
              <Button
                onClick={startDetection}
                disabled={
                  detecting ||
                  submissionCount < 2 ||
                  essayQuestions.length === 0 ||
                  (scanScope === 'specific' && selectedQuestionIds.length === 0)
                }
                className="flex items-center gap-2 bg-amber-600 hover:bg-amber-700 text-white"
              >
                {detecting ? <FaSpinner className="animate-spin" size={13} /> : <FaPlay size={13} />}
                {detecting ? 'Running check…' : 'Start Plagiarism Check'}
              </Button>
              <Button variant="outline" onClick={onClose}>Cancel</Button>
            </div>
          </div>
        )}

        {/* ═══════════════════════════════════════════════
            STEP 2 — RESULTS
        ═══════════════════════════════════════════════ */}
        {step === 'results' && (
          <div className="space-y-6 py-2">
            {loadingResults ? (
              <div className="text-center py-12 text-gray-500">
                <FaSpinner className="animate-spin inline mb-2" size={24} />
                <p>Loading results…</p>
              </div>
            ) : (
              <>
                {/* Scope badge */}
                {scopeBadgeText && (
                  <div className="flex items-center gap-2 px-3 py-2 bg-gray-100 rounded-lg w-fit text-xs text-gray-600 font-medium">
                    <FaShieldAlt className="text-amber-500" size={11} />
                    {scopeBadgeText}
                  </div>
                )}

                {/* Summary bar */}
                <div className="grid grid-cols-3 gap-3">
                  <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-center">
                    <div className="text-2xl font-bold text-red-700">{highRiskStudents.length}</div>
                    <div className="text-xs text-red-600 mt-0.5">Likely Copied</div>
                  </div>
                  <div className="bg-orange-50 border border-orange-200 rounded-xl p-3 text-center">
                    <div className="text-2xl font-bold text-orange-700">{mediumRiskStudents.length}</div>
                    <div className="text-xs text-orange-600 mt-0.5">Needs Review</div>
                  </div>
                  <div className="bg-green-50 border border-green-200 rounded-xl p-3 text-center">
                    <div className="text-2xl font-bold text-green-700">{cleanStudents.length}</div>
                    <div className="text-xs text-green-600 mt-0.5">No Issues</div>
                  </div>
                </div>

                {/* Export */}
                <div className="flex justify-end">
                  <button
                    onClick={() => window.open(`/api/plagiarism/export/${assignment.id}`, '_blank')}
                    className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-700"
                  >
                    <FaDownload size={11} /> Download Report (CSV)
                  </button>
                </div>

                {/* High risk group */}
                {highRiskStudents.length > 0 && (
                  <div>
                    <div className="flex items-center gap-2 mb-3">
                      <FaExclamationCircle className="text-red-500" />
                      <h3 className="font-semibold text-red-700">Likely Copied — Immediate Review Needed</h3>
                    </div>
                    <div className="space-y-2">
                      {highRiskStudents.sort((a, b) => b.max_similarity - a.max_similarity).map(s => (
                        <StudentResultRow key={s.submission_id} student={s} onClick={() => openStudentMatches(s)} />
                      ))}
                    </div>
                  </div>
                )}

                {/* Medium risk group */}
                {mediumRiskStudents.length > 0 && (
                  <div>
                    <div className="flex items-center gap-2 mb-3">
                      <FaExclamationTriangle className="text-orange-500" />
                      <h3 className="font-semibold text-orange-700">Suspicious — Worth Reviewing</h3>
                    </div>
                    <div className="space-y-2">
                      {mediumRiskStudents.sort((a, b) => b.max_similarity - a.max_similarity).map(s => (
                        <StudentResultRow key={s.submission_id} student={s} onClick={() => openStudentMatches(s)} />
                      ))}
                    </div>
                  </div>
                )}

                {/* Clean group */}
                {cleanStudents.length > 0 && (
                  <div>
                    <div className="flex items-center gap-2 mb-3">
                      <FaCheckCircle className="text-green-500" />
                      <h3 className="font-semibold text-green-700">No Issues Found</h3>
                    </div>
                    <div className="space-y-2">
                      {cleanStudents.sort((a, b) => b.max_similarity - a.max_similarity).map(s => (
                        <StudentResultRow key={s.submission_id} student={s} onClick={() => openStudentMatches(s)} />
                      ))}
                    </div>
                  </div>
                )}

                {results.length === 0 && (
                  <div className="text-center py-8 text-gray-500">
                    No results found. Try running the check again.
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* ═══════════════════════════════════════════════
            STEP 3 — COMPARISON
        ═══════════════════════════════════════════════ */}
        {step === 'comparison' && (
          <div className="space-y-5 py-2">
            {/* Student header */}
            {selectedStudent && !selectedMatch && (
              <div className="bg-gray-50 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-1">
                  <FaUser className="text-gray-400" size={14} />
                  <span className="font-semibold text-gray-800">{selectedStudent.student_name}</span>
                </div>
                <p className="text-sm text-gray-500">
                  Click on a match below to see the side-by-side comparison.
                </p>
              </div>
            )}

            {/* Match list */}
            {!selectedMatch && (
              <>
                {loadingSimilarities ? (
                  <div className="text-center py-8 text-gray-500">
                    <FaSpinner className="animate-spin inline mb-2" />
                    <p>Loading matches…</p>
                  </div>
                ) : similarities.length === 0 ? (
                  <div className="text-center py-8 text-gray-400">No matches found for this student.</div>
                ) : (
                  <div className="space-y-3">
                    {similarities.map(match => {
                      const risk = riskLabel(match.risk_level, match.similarity_score);
                      return (
                        <button
                          key={match.comparison_id}
                          onClick={() => openEvidence(match)}
                          className={`w-full text-left border rounded-xl p-4 hover:shadow-sm transition-shadow ${risk.bg}`}
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              {risk.icon}
                              <div>
                                <p className="font-medium text-gray-800">{match.target_student_name}</p>
                                <p className={`text-sm font-semibold mt-0.5 ${risk.color}`}>{risk.label}</p>
                              </div>
                            </div>
                            <FaChevronRight className="text-gray-400 shrink-0" size={12} />
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </>
            )}

            {/* Evidence panel */}
            {selectedMatch && (
              <>
                {loadingEvidence ? (
                  <div className="text-center py-8 text-gray-500">
                    <FaSpinner className="animate-spin inline mb-2" />
                    <p>Loading comparison…</p>
                  </div>
                ) : evidence ? (
                  <EvidencePanel
                    evidence={evidence}
                    essayQuestions={essayQuestions}
                    flagNotes={flagNotes}
                    setFlagNotes={setFlagNotes}
                    savingFlag={savingFlag}
                    flagSaved={flagSaved}
                    onSaveFlag={saveFlag}
                  />
                ) : (
                  <div className="text-center py-8 text-gray-400">Could not load comparison details.</div>
                )}
              </>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

// ── Sub-component: student result row ──────────────────────────
function StudentResultRow({ student, onClick }: { student: StudentResult; onClick: () => void }) {
  const pct = Math.round(student.max_similarity * 100);
  const isHigh = student.high_risk_count > 0;
  const isMedium = !isHigh && student.medium_risk_count > 0;

  const styles = isHigh
    ? { row: 'bg-red-50 border-red-200 hover:border-red-400', circle: 'bg-red-100 text-red-700' }
    : isMedium
    ? { row: 'bg-orange-50 border-orange-200 hover:border-orange-400', circle: 'bg-orange-100 text-orange-700' }
    : { row: 'bg-green-50 border-green-200 hover:border-green-400', circle: 'bg-green-100 text-green-700' };

  const cleanDetail = student.low_risk_count > 0
    ? `${student.low_risk_count} minor overlap${student.low_risk_count > 1 ? 's' : ''} — highest ${pct}%`
    : 'No similar content found';

  return (
    <button
      onClick={onClick}
      className={`w-full text-left border rounded-xl p-4 hover:shadow-sm transition-all flex items-center justify-between group ${styles.row}`}
    >
      <div className="flex items-center gap-3">
        <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold shrink-0 ${styles.circle}`}>
          {pct}%
        </div>
        <div>
          <p className="font-semibold text-gray-800">{student.student_name}</p>
          <p className="text-xs text-gray-500 mt-0.5">
            {isHigh && `${student.high_risk_count} high-similarity match${student.high_risk_count > 1 ? 'es' : ''}`}
            {isHigh && student.medium_risk_count > 0 && ' · '}
            {isHigh && student.medium_risk_count > 0 && `${student.medium_risk_count} medium match${student.medium_risk_count > 1 ? 'es' : ''}`}
            {isMedium && `${student.medium_risk_count} medium-similarity match${student.medium_risk_count > 1 ? 'es' : ''}`}
            {!isHigh && !isMedium && cleanDetail}
          </p>
        </div>
      </div>
      <FaChevronRight className="text-gray-400 group-hover:text-gray-600 transition-colors shrink-0" size={13} />
    </button>
  );
}

// ── Sub-component: evidence panel ──────────────────────────────
interface EvidencePanelProps {
  evidence: EvidenceData;
  essayQuestions: any[];
  flagNotes: string;
  setFlagNotes: (v: string) => void;
  savingFlag: boolean;
  flagSaved: boolean;
  onSaveFlag: (isFalsePositive: boolean) => void;
}

function EvidencePanel({ evidence, essayQuestions, flagNotes, setFlagNotes, savingFlag, flagSaved, onSaveFlag }: EvidencePanelProps) {
  const riskInfo = riskLabel(evidence.risk_level, evidence.overall_similarity);

  // Group matched chunks by question_index for labelled display
  const chunksByQuestion = new Map<number, ChunkMatch[]>();
  for (const chunk of (evidence.matched_chunks ?? [])) {
    const qi = chunk.question_index ?? 0;
    if (!chunksByQuestion.has(qi)) chunksByQuestion.set(qi, []);
    chunksByQuestion.get(qi)!.push(chunk);
  }
  const sortedQIs = [...chunksByQuestion.keys()].sort((a, b) => a - b);

  // Map question_index → display label (Q1, Q2, …) using essayQuestions order
  const questionLabel = (qi: number) => {
    if (qi < essayQuestions.length) return `Q${qi + 1}`;
    return `Question ${qi + 1}`;
  };

  return (
    <div className="space-y-5">
      {/* Similarity summary */}
      <div className={`rounded-xl p-4 border ${riskInfo.bg}`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {riskInfo.icon}
            <div>
              <p className="font-semibold text-gray-800">
                {evidence.source_student} &amp; {evidence.target_student}
              </p>
              <p className={`text-sm font-semibold ${riskInfo.color}`}>{riskInfo.label}</p>
            </div>
          </div>
          {evidence.reviewed && (
            <span className={`text-xs px-3 py-1 rounded-full font-medium ${evidence.is_false_positive ? 'bg-gray-100 text-gray-600' : 'bg-green-100 text-green-700'}`}>
              {evidence.is_false_positive ? '✓ Dismissed' : '✓ Reviewed'}
            </span>
          )}
        </div>
      </div>

      {/* Per-question score breakdown */}
      {evidence.per_question_scores && evidence.per_question_scores.length > 0 && (
        <div>
          <h4 className="text-sm font-semibold text-gray-600 mb-2">Per-answer similarity</h4>
          <div className="space-y-2">
            {evidence.per_question_scores
              .sort((a, b) => a.question_index - b.question_index)
              .map(qs => {
                const pct = Math.round(qs.combined_score * 100);
                const barColor = pct >= 80 ? 'bg-red-500' : pct >= 60 ? 'bg-orange-400' : pct >= 40 ? 'bg-yellow-400' : 'bg-gray-300';
                const textColor = pct >= 80 ? 'text-red-700' : pct >= 60 ? 'text-orange-700' : pct >= 40 ? 'text-yellow-700' : 'text-gray-500';
                return (
                  <div key={qs.question_index} className="flex items-center gap-3">
                    <span className="text-xs font-semibold text-gray-600 w-8 shrink-0">{questionLabel(qs.question_index)}</span>
                    <div className="flex-1 bg-gray-100 rounded-full h-2.5 overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${barColor}`}
                        style={{ width: `${Math.max(pct, 2)}%` }}
                      />
                    </div>
                    <span className={`text-xs font-bold w-10 text-right ${textColor}`}>{pct}%</span>
                  </div>
                );
              })}
          </div>
        </div>
      )}

      {/* Side-by-side full answers */}
      <div>
        <h4 className="text-sm font-semibold text-gray-600 mb-2">Student Answers</h4>
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-xl border border-blue-200 overflow-hidden">
            <div className="bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-700 border-b border-blue-200">
              {evidence.source_student}
            </div>
            <div className="p-3 text-sm leading-relaxed text-gray-700 max-h-48 overflow-y-auto whitespace-pre-wrap">
              {evidence.source_content || 'No content'}
            </div>
          </div>
          <div className="rounded-xl border border-orange-200 overflow-hidden">
            <div className="bg-orange-50 px-3 py-2 text-xs font-semibold text-orange-700 border-b border-orange-200">
              {evidence.target_student}
            </div>
            <div className="p-3 text-sm leading-relaxed text-gray-700 max-h-48 overflow-y-auto whitespace-pre-wrap">
              {evidence.target_content || 'No content'}
            </div>
          </div>
        </div>
      </div>

      {/* Matching sections — grouped by question */}
      {sortedQIs.length > 0 && (
        <div>
          <h4 className="text-sm font-semibold text-gray-600 mb-2">
            Matching sections ({evidence.matched_chunks.length} found)
          </h4>
          <div className="space-y-4 max-h-72 overflow-y-auto pr-1">
            {sortedQIs.map(qi => (
              <div key={qi}>
                {/* Question label only shown when more than one question has matches */}
                {sortedQIs.length > 1 && (
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="text-xs font-semibold text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">
                      {questionLabel(qi)}
                    </span>
                    <div className="flex-1 h-px bg-gray-100" />
                  </div>
                )}
                <div className="space-y-2">
                  {chunksByQuestion.get(qi)!.map((chunk, i) => (
                    <div key={i} className="grid grid-cols-2 gap-2">
                      <div className="rounded-lg bg-blue-50 border border-blue-100 p-2.5 text-xs text-gray-700 leading-relaxed">
                        {chunk.source_text}
                      </div>
                      <div className="rounded-lg bg-orange-50 border border-orange-100 p-2.5 text-xs text-gray-700 leading-relaxed">
                        {chunk.target_text}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Teacher decision panel */}
      {evidence.flag_id && !evidence.reviewed && !flagSaved && (
        <div className="border-t pt-5">
          <h4 className="text-sm font-semibold text-gray-700 mb-3">What do you want to do?</h4>
          <div className="space-y-3">
            <textarea
              value={flagNotes}
              onChange={e => setFlagNotes(e.target.value)}
              placeholder="Add a note (optional) — e.g. 'Students studied together' or 'Will send warning'"
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-400 resize-none"
              rows={2}
            />
            <div className="flex items-center gap-3">
              <Button
                onClick={() => onSaveFlag(false)}
                disabled={savingFlag}
                className="flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white"
              >
                {savingFlag ? <FaSpinner className="animate-spin" size={12} /> : <FaExclamationCircle size={12} />}
                Flag as Plagiarism
              </Button>
              <Button
                variant="outline"
                onClick={() => onSaveFlag(true)}
                disabled={savingFlag}
                className="flex items-center gap-2"
              >
                <FaTimes size={12} /> Dismiss — Not Plagiarism
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Already acted */}
      {(evidence.reviewed || flagSaved) && (
        <div className={`rounded-xl p-4 flex items-center gap-3 ${evidence.is_false_positive ? 'bg-gray-50 border border-gray-200' : 'bg-green-50 border border-green-200'}`}>
          {evidence.is_false_positive ? <FaTimes className="text-gray-500" /> : <FaCheck className="text-green-600" />}
          <div>
            <p className="text-sm font-semibold text-gray-800">
              {evidence.is_false_positive ? 'Dismissed as not plagiarism' : 'Flagged as plagiarism'}
            </p>
            {evidence.teacher_notes && (
              <p className="text-xs text-gray-500 mt-0.5">Note: {evidence.teacher_notes}</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
