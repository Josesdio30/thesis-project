import React, { useState, useEffect } from 'react';
import { Assignment } from '../../../../hooks/useAssignmentData';
import { formatDateTime, getScoreDisplay, getSubmissionStatusColor } from '../../../../lib/assignmentUtils';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { FaSave, FaEye, FaUser, FaClock, FaTimes, FaRobot, FaChevronDown, FaChevronUp } from 'react-icons/fa';
import { useSession } from 'next-auth/react';

interface GradingModalProps {
  assignment: Assignment;
  courseCode: string;
  sessionId: string;
  isOpen: boolean;
  onClose: () => void;
}

interface SubmissionForGrading {
  id: number;
  app_user_assignment_submissions_student_idToapp_user?: {
    id: number;
    user_name: string;
    nama_lengkap: string;
  };
  student?: {
    id: number;
    user_name: string;
    nama_lengkap: string;
  };
  submitted_at: string;
  assignment_answers: {
    id: number;
    question_id: number;
    answer_text: string | null;
    selected_option_id: number | null;
    points_earned: number | string;
    assignment_questions: {
      id: number;
      question_text: string;
      points: number;
      enumeration: {
        name: string;
      };
      assignment_question_options?: {
        id: number;
        option_text: string;
        is_correct: boolean;
      }[];
    };
  }[];
}

interface GradeInput {
  question_id: number;
  points_earned: number;
  feedback: string;
}

interface AiGradingResult {
  question_id: string;
  score: number | null;
  max_score: number;
  qualitative_grade: string | null;
  feedback: string;
  citations: unknown;
  confidence: string;
}

function aiConfidenceStyle(conf: string) {
  const c = (conf || '').toLowerCase();
  if (c === 'high') return { label: 'High confidence', bg: 'bg-green-100', text: 'text-green-700' };
  if (c === 'medium') return { label: 'Medium confidence', bg: 'bg-yellow-100', text: 'text-yellow-700' };
  if (c === 'low') return { label: 'Low confidence', bg: 'bg-red-100', text: 'text-red-700' };
  return { label: conf || 'Unknown', bg: 'bg-gray-100', text: 'text-gray-700' };
}

export const GradingModal = ({ assignment, courseCode, sessionId, isOpen, onClose }: GradingModalProps) => {
  const { data: session } = useSession();
  const [submissions, setSubmissions] = useState<SubmissionForGrading[]>([]);
  const [selectedSubmission, setSelectedSubmission] = useState<SubmissionForGrading | null>(null);
  const [grades, setGrades] = useState<GradeInput[]>([]);
  const [overallFeedback, setOverallFeedback] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [aiResults, setAiResults] = useState<Record<number, AiGradingResult>>({});
  const [aiLoading, setAiLoading] = useState(false);
  const [aiHasJob, setAiHasJob] = useState(false);
  const [aiExpandedQuestions, setAiExpandedQuestions] = useState<Set<number>>(new Set());

  const toggleAiPanel = (questionId: number) => {
    setAiExpandedQuestions(prev => {
      const next = new Set(prev);
      if (next.has(questionId)) next.delete(questionId);
      else next.add(questionId);
      return next;
    });
  };

  useEffect(() => {
    if (isOpen && assignment) {
      fetchSubmissionsForGrading();
    }
  }, [isOpen, assignment?.id]);

  const fetchSubmissionsForGrading = async () => {
    setLoading(true);
    try {
      const response = await fetch(
        `/api/courses/${courseCode}/sessions/${sessionId}/assignments/${assignment.id}/grade`
      );

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      console.log('Grading API response:', data); // Debug log

      if (data.success) {
        const submissionData = data.data || [];
        console.log('Submissions data:', submissionData); // Debug log

        setSubmissions(submissionData);
        if (submissionData.length > 0) {
          selectSubmission(submissionData[0]);
        }
      } else {
        console.error('API returned error:', data.error);
        setSubmissions([]);
      }
    } catch (error) {
      console.error('Error fetching submissions:', error);
      setSubmissions([]);
    } finally {
      setLoading(false);
    }
  };

  const selectSubmission = (submission: SubmissionForGrading) => {
    setSelectedSubmission(submission);
    const initialGrades: GradeInput[] = submission.assignment_answers.map(answer => ({
      question_id: answer.question_id,
      points_earned: parseFloat(answer.points_earned?.toString() || '0') || 0,
      feedback: '',
    }));
    setGrades(initialGrades);
    setOverallFeedback('');

    // Fetch AI grading suggestions for the selected student (read-only reference)
    const studentId =
      submission.app_user_assignment_submissions_student_idToapp_user?.id ??
      submission.student?.id;
    if (studentId !== undefined) {
      fetchAiResults(studentId);
    } else {
      setAiResults({});
      setAiHasJob(false);
    }
  };

  const fetchAiResults = async (studentId: number) => {
    setAiLoading(true);
    setAiResults({});
    setAiHasJob(false);
    setAiExpandedQuestions(new Set());
    try {
      const res = await fetch(
        `/api/ai-grading/results/${assignment.id}?studentId=${studentId}`
      );
      const data = await res.json();
      if (data?.success) {
        setAiHasJob(Boolean(data.data?.job));
        const byQuestion: Record<number, AiGradingResult> = {};
        for (const r of (data.data?.results ?? []) as AiGradingResult[]) {
          const qid = Number(r.question_id);
          if (!Number.isNaN(qid)) byQuestion[qid] = r;
        }
        setAiResults(byQuestion);
      }
    } catch {
      // silent — AI suggestions are best-effort
    } finally {
      setAiLoading(false);
    }
  };

  const updateGrade = (questionId: number, pointsEarned: number, feedback: string) => {
    setGrades(prev =>
      prev.map(grade =>
        grade.question_id === questionId ? { ...grade, points_earned: pointsEarned, feedback } : grade
      )
    );
  };

  const saveGrades = async () => {
    if (!selectedSubmission || !session?.user?.id) return;

    setSaving(true);
    try {
      const response = await fetch(
        `/api/courses/${courseCode}/sessions/${sessionId}/assignments/${assignment.id}/grade`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            submission_id: selectedSubmission.id,
            grader_id: parseInt(session.user.id),
            grades,
            feedback: overallFeedback,
          }),
        }
      );

      const data = await response.json();
      if (data.success) {
        // Refresh submissions list
        await fetchSubmissionsForGrading();
        // Show success message
        alert('Grades saved successfully!');
      } else {
        alert('Error saving grades: ' + data.error);
      }
    } catch (error) {
      console.error('Error saving grades:', error);
      alert('Error saving grades');
    } finally {
      setSaving(false);
    }
  };

  const getTotalScore = () => {
    return grades.reduce((total, grade) => total + Number(grade.points_earned), 0);
  };

  const getTotalPossibleScore = () => {
    return (
      selectedSubmission?.assignment_answers.reduce(
        (total, answer) => total + (answer.assignment_questions.points || 0),
        0
      ) || 0
    );
  };

  const getStudentInfo = (submission: SubmissionForGrading) => {
    const student = submission.student || submission.app_user_assignment_submissions_student_idToapp_user;
    return {
      nama_lengkap: student?.nama_lengkap || 'Unknown Student',
      user_name: student?.user_name || 'unknown',
      id: student?.id || 0,
    };
  };

  if (!isOpen) return null;

  return (
    <Dialog open={isOpen} onOpenChange={open => !open && onClose()}>
      <DialogContent className="sm:max-w-[1200px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FaEye className="text-blue-600" />
            Grade Assignment: {assignment.title}
          </DialogTitle>
          <DialogDescription>Review and grade student submissions for this assignment.</DialogDescription>
        </DialogHeader>

        <div className="flex gap-6 min-h-[600px]">
          {/* Submissions List */}
          <div className="w-1/3 border-r border-gray-200 pr-6">
            <h3 className="font-medium text-gray-900 mb-3">Submissions to Grade ({submissions.length})</h3>

            {loading ? (
              <div className="text-center text-gray-500 py-8">Loading submissions...</div>
            ) : submissions.length === 0 ? (
              <div className="text-center text-gray-500 py-8">
                <p>No submissions need manual grading</p>
                <p className="text-sm mt-2">All submissions have been auto-graded or no submissions exist.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {submissions.map(submission => {
                  const studentInfo = getStudentInfo(submission);
                  return (
                    <div
                      key={submission.id}
                      onClick={() => selectSubmission(submission)}
                      className={`p-3 rounded-lg border cursor-pointer transition-colors ${
                        selectedSubmission?.id === submission.id
                          ? 'bg-blue-50 border-blue-200'
                          : 'bg-white border-gray-200 hover:bg-gray-50'
                      }`}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <FaUser className="text-gray-400" size={12} />
                        <span className="font-medium text-sm">{studentInfo.nama_lengkap}</span>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-gray-500">
                        <FaClock size={10} />
                        <span>{formatDateTime(submission.submitted_at)}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Grading Interface */}
          <div className="flex-1 pl-6">
            {!selectedSubmission ? (
              <div className="text-center text-gray-500 mt-10">Select a submission to start grading</div>
            ) : (
              <div className="space-y-6">
                {/* Student Info */}
                <div className="bg-gray-50 rounded-lg p-4">
                  {(() => {
                    const studentInfo = getStudentInfo(selectedSubmission);
                    return (
                      <>
                        <h3 className="font-medium text-gray-900 mb-2">
                          {studentInfo.nama_lengkap} ({studentInfo.user_name})
                        </h3>
                        <p className="text-sm text-gray-600">
                          Submitted: {formatDateTime(selectedSubmission.submitted_at)}
                        </p>
                      </>
                    );
                  })()}
                </div>

                {/* Questions and Answers */}
                <div className="space-y-6">
                  {selectedSubmission.assignment_answers.map((answer, index) => {
                    const grade = grades.find(g => g.question_id === answer.question_id) || {
                      points_earned: 0,
                      feedback: '',
                    };
                    const isEssay =
                      answer.assignment_questions.enumeration.name === 'Essay' ||
                      answer.assignment_questions.enumeration.name === 'ESSAY' ||
                      answer.assignment_questions.enumeration.name === 'FILE_UPLOAD' ||
                      answer.assignment_questions.enumeration.name === 'File Upload';

                    // Only essay questions should be manually gradable
                    const isManualGradable = isEssay;

                    return (
                      <div key={answer.id} className="border border-gray-200 rounded-lg p-4">
                        <div className="mb-3">
                          <h4 className="font-medium text-gray-900 mb-2">
                            Question {index + 1} ({answer.assignment_questions.points} points)
                            <span className="text-xs text-gray-500 ml-2">
                              Type: {answer.assignment_questions.enumeration.name}
                            </span>
                          </h4>
                          <p className="text-gray-700 mb-3">{answer.assignment_questions.question_text}</p>

                          {/* Student Answer */}
                          <div className="bg-blue-50 rounded p-3 mb-3">
                            <p className="text-sm font-medium text-blue-800 mb-1">Student Answer:</p>
                            {answer.selected_option_id && answer.assignment_questions.assignment_question_options ? (
                              <p className="text-blue-700">
                                {(() => {
                                  const optionText = answer.assignment_questions.assignment_question_options?.find(
                                    opt => opt.id === answer.selected_option_id
                                  )?.option_text;
                                  const isCorrect = answer.assignment_questions.assignment_question_options?.find(
                                    opt => opt.id === answer.selected_option_id
                                  )?.is_correct;

                                  return (
                                    <>
                                      {optionText}
                                      {isCorrect && <span className="text-green-600 ml-2">(Correct)</span>}
                                    </>
                                  );
                                })()}
                              </p>
                            ) : (
                              <p className="text-blue-700">{answer.answer_text || 'No answer provided'}</p>
                            )}
                          </div>
                        </div>

                        {/* Grading Interface */}
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Points Earned</label>
                            <input
                              type="number"
                              min="0"
                              max={answer.assignment_questions.points}
                              value={grade.points_earned}
                              onChange={e =>
                                updateGrade(answer.question_id, parseFloat(e.target.value) || 0, grade.feedback)
                              }
                              className="w-full px-3 py-1 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                              disabled={!isManualGradable} // Only manually gradable questions can be edited
                              title={isManualGradable ? 'Manually grade this question' : 'This question is auto-graded'}
                            />
                            <p className="text-xs text-gray-500 mt-1">
                              Max: {answer.assignment_questions.points} points
                              {!isManualGradable && <span className="text-amber-600"> (Auto-graded)</span>}
                            </p>
                          </div>

                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Feedback</label>
                            <textarea
                              value={grade.feedback}
                              onChange={e => updateGrade(answer.question_id, grade.points_earned, e.target.value)}
                              className="w-full px-3 py-1 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                              rows={2}
                              placeholder="Optional feedback for this question"
                            />
                          </div>
                        </div>

                        {/* AI Grade Suggestion — collapsible bar, read-only reference */}
                        {isManualGradable && (() => {
                          const aiR = aiResults[answer.question_id];
                          const isExpanded = aiExpandedQuestions.has(answer.question_id);

                          if (aiLoading) {
                            return (
                              <div className="mt-3 border border-indigo-100 bg-indigo-50/40 rounded-lg px-3 py-2 text-xs text-indigo-600 flex items-center gap-2">
                                <FaRobot size={11} />
                                Loading AI suggestion…
                              </div>
                            );
                          }
                          if (!aiHasJob) {
                            return (
                              <div className="mt-3 border border-gray-200 bg-gray-50 rounded-lg px-3 py-2 text-xs text-gray-500 flex items-center gap-2">
                                <FaRobot size={11} />
                                No AI grading run yet for this assignment.
                              </div>
                            );
                          }
                          if (!aiR) {
                            return (
                              <div className="mt-3 border border-gray-200 bg-gray-50 rounded-lg px-3 py-2 text-xs text-gray-500 flex items-center gap-2">
                                <FaRobot size={11} />
                                AI did not grade this question for this student.
                              </div>
                            );
                          }

                          const conf = aiConfidenceStyle(aiR.confidence);
                          const citations = Array.isArray(aiR.citations)
                            ? (aiR.citations as unknown[]).map(c => String(c))
                            : [];
                          const scoreLabel =
                            aiR.score !== null && aiR.score !== undefined ? aiR.score : '—';

                          return (
                            <div className="mt-3 border border-green-200 bg-green-50/50 rounded-lg overflow-hidden">
                              <button
                                type="button"
                                onClick={() => toggleAiPanel(answer.question_id)}
                                aria-expanded={isExpanded}
                                className="w-full px-3 py-2 flex items-center justify-between gap-2 hover:bg-green-100/50 transition-colors text-left"
                              >
                                <div className="flex items-center gap-2 min-w-0">
                                  <FaRobot className="text-green-600 shrink-0" size={12} />
                                  <span className="text-xs font-semibold text-green-800 truncate">
                                    AI Grade (reference only)
                                  </span>
                                </div>
                                <div className="flex items-center gap-2 shrink-0">
                                  <span className="text-xs font-bold text-green-800">
                                    {scoreLabel} / {aiR.max_score}
                                  </span>
                                  {aiR.qualitative_grade && (
                                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-green-100 text-green-700 font-medium">
                                      {aiR.qualitative_grade}
                                    </span>
                                  )}
                                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${conf.bg} ${conf.text}`}>
                                    {conf.label}
                                  </span>
                                  {isExpanded ? (
                                    <FaChevronUp className="text-green-600" size={10} />
                                  ) : (
                                    <FaChevronDown className="text-green-600" size={10} />
                                  )}
                                </div>
                              </button>

                              {isExpanded && (
                                <div className="px-3 pb-3 pt-1 border-t border-green-200/70 space-y-2">
                                  <p className="text-[11px] text-green-700/80 italic">
                                    AI-generated suggestion. Teacher grade remains authoritative.
                                  </p>
                                  {aiR.feedback && (
                                    <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">
                                      {aiR.feedback}
                                    </p>
                                  )}
                                  {citations.length > 0 && (
                                    <div className="flex flex-wrap gap-1.5 pt-1">
                                      {citations.map((c, i) => (
                                        <span
                                          key={i}
                                          className="text-xs bg-white border border-green-200 text-green-700 px-2 py-0.5 rounded-full"
                                        >
                                          📄 {c}
                                        </span>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })()}
                      </div>
                    );
                  })}
                </div>

                {/* Overall Feedback */}
                <div className="border-t border-gray-200 pt-6">
                  <label className="block text-sm font-medium text-gray-700 mb-2">Overall Feedback</label>
                  <textarea
                    value={overallFeedback}
                    onChange={e => setOverallFeedback(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    rows={3}
                    placeholder="Optional overall feedback for the student"
                  />
                </div>

                {/* Score Summary */}
                <div className="bg-gray-50 rounded-lg p-4">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-gray-900">Total Score:</span>
                    <div className="text-right">
                      <div className="text-lg font-bold text-gray-900">
                        {getTotalScore()}/{getTotalPossibleScore()}
                      </div>
                      <div
                        className={`text-sm px-2 py-1 rounded-full ${
                          getSubmissionStatusColor(getTotalScore(), getTotalPossibleScore(), 'graded').bg
                        } ${getSubmissionStatusColor(getTotalScore(), getTotalPossibleScore(), 'graded').color}`}
                      >
                        {getScoreDisplay(getTotalScore(), getTotalPossibleScore()).percentage} -{' '}
                        {getScoreDisplay(getTotalScore(), getTotalPossibleScore()).letterGrade}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer with Save Button */}
        {selectedSubmission && (
          <div className="flex justify-end pt-4 border-t mt-6">
            <Button variant="outline" onClick={onClose} className="mr-2">
              Close
            </Button>
            <Button onClick={saveGrades} disabled={saving} className="flex items-center gap-2">
              <FaSave />
              {saving ? 'Saving...' : 'Save Grades'}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};
