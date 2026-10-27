'use client';

import { useState, useEffect } from 'react';
import { FaEye, FaTimes, FaEdit, FaClock, FaUsers } from 'react-icons/fa';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2 } from 'lucide-react';
import { useAssignmentContext } from '@/lib/contexts/AssignmentContext';

const Badge = ({
  children,
  variant = 'default',
  className = '',
}: {
  children: React.ReactNode;
  variant?: 'default' | 'secondary' | 'outline';
  className?: string;
}) => {
  const baseClasses = 'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold';
  const variantClasses = {
    default: 'bg-blue-100 text-blue-800',
    secondary: 'bg-gray-100 text-gray-800',
    outline: 'border border-gray-300 text-gray-700 bg-white',
  };
  return <span className={`${baseClasses} ${variantClasses[variant]} ${className}`}>{children}</span>;
};

interface Question {
  id: number;
  question_text: string;
  points: number;
  question_type_id: number;
  order_number: number;
  required: boolean;
  options?: Array<{
    id: number;
    option_text: string;
    is_correct?: boolean;
    order_number: number;
  }>;
}

interface Assignment {
  id: number;
  title: string;
  description?: string;
  instructions?: string;
  total_points: number;
  due_date?: string;
  time_limit?: number;
  attempts_allowed: number;
  show_results: boolean;
  is_published: boolean;
  assignment_type_id: number;
  assignment_type?: string;
  created_date: string;
  questions?: Question[];
  session_id?: number;
  session_title?: string;
  session_number?: number;
  submissions?: Array<{
    id: number;
    student: {
      id: number;
      nama_lengkap: string;
      user_name: string;
    };
    attempt_number: number;
    submitted_at?: string;
    total_score?: number;
    status_id: number;
  }>;
}

interface AssignmentDetailModalProps {
  assignment: Assignment | null;
  isOpen: boolean;
  onClose: () => void;
  isTeacher: boolean;
  currentUserId?: number;
  onSubmitAnswer?: (answers: any[]) => void;
  onEdit?: (assignment: Assignment) => void;
}

const AssignmentDetailModal = ({
  assignment,
  isOpen,
  onClose,
  isTeacher,
  currentUserId,
  onSubmitAnswer,
  onEdit,
}: AssignmentDetailModalProps) => {
  const [activeTab, setActiveTab] = useState<'details' | 'questions' | 'submissions'>('details');
  const [answers, setAnswers] = useState<any[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [userSubmission, setUserSubmission] = useState<any>(null);
  const [userSubmittedAnswers, setUserSubmittedAnswers] = useState<any[]>([]);
  const [loadingUserAnswers, setLoadingUserAnswers] = useState(false);

  // Submission viewing state
  const [selectedSubmission, setSelectedSubmission] = useState<any>(null);
  const [submissionModalOpen, setSubmissionModalOpen] = useState(false);
  const [submissionAnswers, setSubmissionAnswers] = useState<any[]>([]);
  const [loadingSubmission, setLoadingSubmission] = useState(false);

  // Use context for types data
  const { questionTypes, submissionStatuses, loading: typesLoading } = useAssignmentContext();

  useEffect(() => {
    if (assignment && !isTeacher && currentUserId) {
      // Find current user's submission
      const submission = assignment.submissions?.find(s => s.student.id === currentUserId);
      setUserSubmission(submission);

      // Initialize answers array
      if (assignment.questions) {
        setAnswers(new Array(assignment.questions.length).fill(''));
      }

      // Fetch user's submitted answers if they have a submission
      if (submission) {
        fetchUserSubmittedAnswers(submission.id);
      }
    }
  }, [assignment, isTeacher, currentUserId]);

  const fetchUserSubmittedAnswers = async (submissionId: number) => {
    setLoadingUserAnswers(true);
    try {
      const response = await fetch(`/api/submissions/${submissionId}/answers`);
      if (response.ok) {
        const answers = await response.json();
        setUserSubmittedAnswers(answers);
      } else {
        console.error('Failed to fetch user submitted answers');
        setUserSubmittedAnswers([]);
      }
    } catch (error) {
      console.error('Error fetching user submitted answers:', error);
      setUserSubmittedAnswers([]);
    } finally {
      setLoadingUserAnswers(false);
    }
  };

  if (!assignment) return null;

  const getQuestionTypeLabel = (typeId: number) => {
    const type = questionTypes.find(t => t.id === typeId);
    return type ? type.alt_name || type.name : 'Unknown';
  };

  const getStatusLabel = (statusId: number) => {
    const status = submissionStatuses.find(s => s.id === statusId);
    return status ? status.alt_name || status.name : 'Unknown';
  };

  const formatDateTime = (dateString: string) => {
    return new Date(dateString).toLocaleString();
  };

  const handleAnswerChange = (questionIndex: number, value: string) => {
    const newAnswers = [...answers];
    const question = assignment!.questions![questionIndex];
    const qt = questionTypes.find(qt => qt.id === question.question_type_id);
    const isSelect = qt && ['MULTIPLE CHOICE', 'TRUE FALSE'].includes(qt.name);

    if (isSelect) {
      // student picked from a select
      const opt = question.options?.find(o => o.id.toString() === value);
      newAnswers[questionIndex] = opt ? { selected_option_id: opt.id, option_text: opt.option_text } : {};
    } else {
      // free‐text answer
      newAnswers[questionIndex] = value;
    }

    setAnswers(newAnswers);
  };

  const handleSubmitAnswers = async () => {
    if (!assignment || !onSubmitAnswer) return;

    setSubmitting(true);
    try {
      await onSubmitAnswer(answers);
      onClose();
    } catch (error) {
      console.error('Error submitting answers:', error);
      alert('Failed to submit answers');
    } finally {
      setSubmitting(false);
    }
  };

  const canSubmit = () => {
    if (userSubmission) return false; // Already submitted
    if (!assignment.is_published) return false; // Not published yet
    if (assignment.due_date && new Date(assignment.due_date) < new Date()) return false; // Past due date
    return true;
  };

  const isDueDate = () => {
    return assignment.due_date && new Date(assignment.due_date) < new Date();
  };

  const handleViewSubmission = async (submission: any) => {
    setLoadingSubmission(true);
    setSelectedSubmission(submission);

    try {
      // Fetch the submission answers
      const response = await fetch(`/api/submissions/${submission.id}/answers`);
      if (response.ok) {
        const answers = await response.json();
        setSubmissionAnswers(answers);
      } else {
        console.error('Failed to fetch submission answers');
        setSubmissionAnswers([]);
      }
    } catch (error) {
      console.error('Error fetching submission answers:', error);
      setSubmissionAnswers([]);
    } finally {
      setLoadingSubmission(false);
      setSubmissionModalOpen(true);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={open => !open && onClose()}>
      <DialogContent className="sm:max-w-[900px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FaEye className="text-blue-600" />
              {assignment.title}
            </div>
            {isTeacher && onEdit && (
              <button
                onClick={() => onEdit(assignment)}
                className="flex items-center gap-2 px-3 py-1 text-sm bg-blue-50 hover:bg-blue-100 text-blue-700 hover:text-blue-800 rounded-lg transition-colors"
                title="Edit Assignment"
              >
                <FaEdit className="text-xs" />
                Edit
              </button>
            )}
          </DialogTitle>
          <DialogDescription>{assignment.description || 'Assignment details and questions'}</DialogDescription>
        </DialogHeader>

        {/* Tab Navigation */}
        <div className="flex border-b border-gray-200">
          <button
            onClick={() => setActiveTab('details')}
            className={`px-4 py-2 font-medium text-sm ${
              activeTab === 'details' ? 'border-b-2 border-blue-500 text-blue-600' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            Details
          </button>
          <button
            onClick={() => setActiveTab('questions')}
            className={`px-4 py-2 font-medium text-sm ${
              activeTab === 'questions'
                ? 'border-b-2 border-blue-500 text-blue-600'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            Questions ({assignment.questions?.length || 0})
          </button>
          {isTeacher && (
            <button
              onClick={() => setActiveTab('submissions')}
              className={`px-4 py-2 font-medium text-sm ${
                activeTab === 'submissions'
                  ? 'border-b-2 border-blue-500 text-blue-600'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              <FaUsers className="inline mr-1" />
              Submissions ({assignment.submissions?.length || 0})
            </button>
          )}
        </div>

        <div className="mt-4">
          {/* Details Tab */}
          {activeTab === 'details' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <h4 className="font-medium text-gray-700">Total Points</h4>
                  <p className="text-lg font-semibold">{assignment.total_points}</p>
                </div>
                <div>
                  <h4 className="font-medium text-gray-700">Attempts Allowed</h4>
                  <p className="text-lg">{assignment.attempts_allowed}</p>
                </div>
                {assignment.due_date && (
                  <div>
                    <h4 className="font-medium text-gray-700">Due Date</h4>
                    <p className={`text-lg ${isDueDate() ? 'text-red-600' : ''}`}>
                      <FaClock className="inline mr-1" />
                      {formatDateTime(assignment.due_date)}
                    </p>
                  </div>
                )}
                {assignment.time_limit && (
                  <div>
                    <h4 className="font-medium text-gray-700">Time Limit</h4>
                    <p className="text-lg">{assignment.time_limit} minutes</p>
                  </div>
                )}
              </div>

              <div className="flex gap-2">
                <Badge variant={assignment.is_published ? 'default' : 'secondary'}>
                  {assignment.is_published ? 'Published' : 'Draft'}
                </Badge>
                <Badge variant={assignment.show_results ? 'default' : 'secondary'}>
                  {assignment.show_results ? 'Results Shown' : 'Results Hidden'}
                </Badge>
              </div>

              {assignment.instructions && (
                <div>
                  <h4 className="font-medium text-gray-700 mb-2">Instructions</h4>
                  <div className="bg-gray-50 p-4 rounded-lg">
                    <p className="whitespace-pre-wrap">{assignment.instructions}</p>
                  </div>
                </div>
              )}

              {!isTeacher && userSubmission && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <h4 className="font-medium text-blue-800 mb-2">Your Submission</h4>
                  <div className="space-y-2">
                    <p>
                      <span className="font-medium">Status:</span> {getStatusLabel(userSubmission.status_id)}
                    </p>
                    {userSubmission.submitted_at && (
                      <p>
                        <span className="font-medium">Submitted at:</span> {formatDateTime(userSubmission.submitted_at)}
                      </p>
                    )}
                    {userSubmission.total_score !== null && (
                      <p>
                        <span className="font-medium">Score:</span> {userSubmission.total_score}/
                        {assignment.total_points}
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Questions Tab */}
          {activeTab === 'questions' && (
            <div className="space-y-6">
              {assignment.questions?.map((question, index) => (
                <div key={question.id} className="border rounded-lg p-4">
                  <div className="flex items-start justify-between mb-3">
                    <h4 className="font-medium text-lg">
                      Question {question.order_number}
                      {question.required && <span className="text-red-500 ml-1">*</span>}
                    </h4>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">{getQuestionTypeLabel(question.question_type_id)}</Badge>
                      <Badge>{question.points} pts</Badge>
                    </div>
                  </div>

                  <p className="text-gray-800 mb-4 whitespace-pre-wrap">{question.question_text}</p>

                  {/* Show options for multiple choice/true-false */}
                  {question.options && question.options.length > 0 && (
                    <div className="mb-4">
                      <h5 className="font-medium text-gray-700 mb-2">Options:</h5>
                      <div className="space-y-2">
                        {question.options.map((option, optIndex) => (
                          <div key={option.id} className="flex items-center gap-2">
                            <span className="font-medium text-gray-600">{String.fromCharCode(65 + optIndex)}.</span>
                            <span>{option.option_text}</span>
                            {isTeacher && option.is_correct && (
                              <Badge variant="default" className="ml-2">
                                Correct
                              </Badge>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Student answer input */}
                  {!isTeacher && canSubmit() && (
                    <div className="mt-4">
                      <h5 className="font-medium text-gray-700 mb-2">Your Answer:</h5>
                      {(() => {
                        //   const type = questionTypes.find(qt => qt.id === question.question_type_id);
                        //   return type && ['MULTIPLE CHOICE', 'TRUE FALSE'].includes(type.name);
                        // })() ? (
                        const qt = questionTypes.find(qt => qt.id === question.question_type_id);
                        return qt && ['MULTIPLE CHOICE', 'TRUE FALSE'].includes(qt.name);
                      })() ? (
                        // Multiple choice or True/False
                        <Select
                          value={(() => {
                            const answer = answers[index];
                            if (answer && typeof answer === 'object' && answer.selected_option_id) {
                              return answer.selected_option_id.toString();
                            }
                            return '';
                          })()}
                          onValueChange={value => {
                            console.log('Select onValueChange:', {
                              questionIndex: index,
                              value,
                              questionId: question.id,
                            });
                            handleAnswerChange(index, value);
                          }}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select an answer" />
                          </SelectTrigger>
                          <SelectContent>
                            {question.options?.map((option, optIndex) => (
                              <SelectItem
                                key={option.id}
                                value={option.id.toString()}
                                onClick={e => {
                                  console.log('SelectItem clicked:', { option: option.option_text, optIndex });
                                  e.stopPropagation();
                                }}
                              >
                                {String.fromCharCode(65 + optIndex)}. {option.option_text}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        // Essay, Short Answer, Fill in the Blank
                        // <Textarea
                        //   value={answers[index] || ''}
                        //   onChange={e => handleAnswerChange(index, e.target.value)}
                        //   placeholder="Enter your answer here..."
                        //   className="min-h-[100px]"
                        // />
                        <Textarea
                          value={(answers[index] as string) || ''}
                          onChange={e => handleAnswerChange(index, e.target.value)}
                          className="min-h-[100px]"
                        />
                      )}
                    </div>
                  )}

                  {/* Show submitted answer if exists */}
                  {!isTeacher && userSubmission && (
                    <div className="mt-4 bg-gray-50 p-3 rounded">
                      <h5 className="font-medium text-gray-700 mb-2">Your Answer:</h5>
                      {loadingUserAnswers ? (
                        <div className="flex items-center gap-2">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          <span className="text-gray-600">Loading your answer...</span>
                        </div>
                      ) : (
                        (() => {
                          const submittedAnswer = userSubmittedAnswers.find(
                            (answer: any) => answer.question_id === question.id
                          );

                          if (!submittedAnswer) {
                            return <p className="text-gray-500 italic">No answer submitted</p>;
                          }

                          if (submittedAnswer.selected_option_id) {
                            // Multiple choice answer
                            const selectedOption = question.options?.find(
                              opt => opt.id === submittedAnswer.selected_option_id
                            );
                            return (
                              <div className="text-gray-800">
                                <strong>Selected:</strong> {selectedOption?.option_text || 'Unknown option'}
                              </div>
                            );
                          } else {
                            // Text answer
                            return (
                              <p className="text-gray-800 whitespace-pre-wrap">
                                {submittedAnswer.answer_text || 'No answer provided'}
                              </p>
                            );
                          }
                        })()
                      )}
                    </div>
                  )}
                </div>
              ))}

              {/* Submit button for students */}
              {!isTeacher && canSubmit() && (
                <div className="flex justify-end pt-4">
                  <Button onClick={handleSubmitAnswers} disabled={submitting} className="px-6">
                    {submitting ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Submitting...
                      </>
                    ) : (
                      'Submit Assignment'
                    )}
                  </Button>
                </div>
              )}

              {!isTeacher && !canSubmit() && (
                <div className="text-center py-4">
                  {userSubmission ? (
                    <p className="text-gray-600">You have already submitted this assignment.</p>
                  ) : !assignment.is_published ? (
                    <p className="text-gray-600">This assignment is not yet published.</p>
                  ) : isDueDate() ? (
                    <p className="text-red-600">This assignment is past due.</p>
                  ) : (
                    <p className="text-gray-600">You cannot submit this assignment at this time.</p>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Submissions Tab (Teacher only) */}
          {activeTab === 'submissions' && isTeacher && (
            <div className="space-y-4">
              {assignment.submissions && assignment.submissions.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse border border-gray-300">
                    <thead>
                      <tr className="bg-gray-50">
                        <th className="border border-gray-300 px-4 py-2 text-left">Student</th>
                        <th className="border border-gray-300 px-4 py-2 text-left">Attempt</th>
                        <th className="border border-gray-300 px-4 py-2 text-left">Status</th>
                        <th className="border border-gray-300 px-4 py-2 text-left">Submitted At</th>
                        <th className="border border-gray-300 px-4 py-2 text-left">Score</th>
                        <th className="border border-gray-300 px-4 py-2 text-left">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {assignment.submissions.map(submission => (
                        <tr key={submission.id}>
                          <td className="border border-gray-300 px-4 py-2">
                            {submission.student.nama_lengkap}
                            <br />
                            <span className="text-sm text-gray-500">@{submission.student.user_name}</span>
                          </td>
                          <td className="border border-gray-300 px-4 py-2">{submission.attempt_number}</td>
                          <td className="border border-gray-300 px-4 py-2">
                            <Badge
                              variant={(() => {
                                const status = submissionStatuses.find(s => s.id === submission.status_id);
                                return status && status.name === 'GRADED' ? 'default' : 'secondary';
                              })()}
                            >
                              {getStatusLabel(submission.status_id)}
                            </Badge>
                          </td>
                          <td className="border border-gray-300 px-4 py-2">
                            {submission.submitted_at ? formatDateTime(submission.submitted_at) : '-'}
                          </td>
                          <td className="border border-gray-300 px-4 py-2">
                            {submission.total_score !== null
                              ? `${submission.total_score}/${assignment.total_points}`
                              : '-'}
                          </td>
                          <td className="border border-gray-300 px-4 py-2">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleViewSubmission(submission)}
                              disabled={loadingSubmission}
                            >
                              <FaEye className="mr-1 h-3 w-3" />
                              View
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="text-center py-8 text-gray-500">
                  <FaUsers className="mx-auto h-12 w-12 mb-4 opacity-50" />
                  <p>No submissions yet</p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end pt-4 border-t">
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        </div>
      </DialogContent>

      {/* Submission Detail Modal */}
      <Dialog open={submissionModalOpen} onOpenChange={setSubmissionModalOpen}>
        <DialogContent className="sm:max-w-[800px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FaEye className="text-blue-600" />
              Submission Details - {selectedSubmission?.student?.nama_lengkap}
            </DialogTitle>
            <DialogDescription>{`View and grade student submission for "${assignment?.title ?? ''}"`}</DialogDescription>
          </DialogHeader>

          {selectedSubmission && (
            <div className="space-y-6">
              {/* Submission Info */}
              <div className="bg-gray-50 rounded-lg p-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <h4 className="font-medium text-gray-700">Student</h4>
                    <p className="text-lg">{selectedSubmission.student.nama_lengkap}</p>
                    <p className="text-sm text-gray-500">@{selectedSubmission.student.user_name}</p>
                  </div>
                  <div>
                    <h4 className="font-medium text-gray-700">Submission Status</h4>
                    <Badge
                      variant={(() => {
                        const status = submissionStatuses.find(s => s.id === selectedSubmission.status_id);
                        return status && status.name === 'GRADED' ? 'default' : 'secondary';
                      })()}
                    >
                      {getStatusLabel(selectedSubmission.status_id)}
                    </Badge>
                  </div>
                  <div>
                    <h4 className="font-medium text-gray-700">Submitted At</h4>
                    <p className="text-lg">
                      {selectedSubmission.submitted_at
                        ? formatDateTime(selectedSubmission.submitted_at)
                        : 'Not submitted'}
                    </p>
                  </div>
                  <div>
                    <h4 className="font-medium text-gray-700">Current Score</h4>
                    <p className="text-lg font-semibold">
                      {selectedSubmission.total_score !== null
                        ? `${selectedSubmission.total_score}/${assignment?.total_points}`
                        : 'Not graded'}
                    </p>
                  </div>
                </div>
              </div>

              {/* Questions and Answers */}
              <div className="space-y-4">
                {assignment?.questions?.map((question, index) => {
                  const submissionAnswer = submissionAnswers.find((answer: any) => answer.question_id === question.id);

                  return (
                    <div key={question.id} className="border rounded-lg p-4">
                      <div className="flex items-start justify-between mb-3">
                        <h4 className="font-medium text-lg">Question {question.order_number}</h4>
                        <div className="flex items-center gap-2">
                          <Badge variant="outline">{getQuestionTypeLabel(question.question_type_id)}</Badge>
                          <Badge>{question.points} pts</Badge>
                        </div>
                      </div>

                      <p className="text-gray-800 mb-4 whitespace-pre-wrap">{question.question_text}</p>

                      {/* Show options for multiple choice/true-false */}
                      {question.options && question.options.length > 0 && (
                        <div className="mb-4">
                          <h5 className="font-medium text-gray-700 mb-2">Options:</h5>
                          <div className="space-y-2">
                            {question.options.map((option, optIndex) => (
                              <div key={option.id} className="flex items-center gap-2">
                                <span className="font-medium text-gray-600">{String.fromCharCode(65 + optIndex)}.</span>
                                <span
                                  className={`${
                                    submissionAnswer?.selected_option_id === option.id
                                      ? 'bg-blue-100 px-2 py-1 rounded font-medium'
                                      : ''
                                  }`}
                                >
                                  {option.option_text}
                                </span>
                                {option.is_correct && (
                                  <Badge variant="default" className="ml-2">
                                    Correct
                                  </Badge>
                                )}
                                {submissionAnswer?.selected_option_id === option.id && (
                                  <Badge variant="outline" className="ml-2">
                                    Selected
                                  </Badge>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Student's Answer */}
                      <div className="mt-4 bg-blue-50 border border-blue-200 rounded-lg p-3">
                        <h5 className="font-medium text-blue-800 mb-2">Student&apos;s Answer:</h5>
                        {submissionAnswer ? (
                          <div className="text-gray-800">
                            {submissionAnswer.selected_option_id ? (
                              <p>
                                <strong>Selected:</strong>{' '}
                                {question.options?.find(opt => opt.id === submissionAnswer.selected_option_id)
                                  ?.option_text || 'Unknown option'}
                              </p>
                            ) : (
                              <p className="whitespace-pre-wrap">
                                {submissionAnswer.answer_text || 'No answer provided'}
                              </p>
                            )}
                          </div>
                        ) : (
                          <p className="text-gray-500 italic">No answer provided</p>
                        )}
                      </div>

                      {/* Score for this question */}
                      {submissionAnswer && (
                        <div className="mt-3 flex items-center justify-between">
                          <span className="text-sm text-gray-600">
                            Question Score: {submissionAnswer.points_earned || 0} / {question.points}
                          </span>
                          {submissionAnswer.points_earned === question.points && (
                            <Badge variant="default">Correct</Badge>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Grading Actions */}
              <div className="flex justify-between items-center pt-4 border-t">
                <div className="text-lg font-semibold">
                  Total Score:{' '}
                  {selectedSubmission.total_score !== null
                    ? `${selectedSubmission.total_score}/${assignment?.total_points}`
                    : 'Not graded'}
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => setSubmissionModalOpen(false)}>
                    Close
                  </Button>
                  {selectedSubmission.total_score === null && <Button>Grade Submission</Button>}
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </Dialog>
  );
};

export default AssignmentDetailModal;
