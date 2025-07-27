'use client';

import { useState, useEffect } from 'react';
import { FaPlus, FaTimes, FaTrash, FaExclamationTriangle } from 'react-icons/fa';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2 } from 'lucide-react';
import { useSession } from 'next-auth/react';

interface Question {
  type: string;
  question: string;
  points: number;
  options: string[];
  correctAnswers: number[]; // Array of indices for correct options
  required: boolean;
}

interface QuestionType {
  id: number;
  name: string;
  alt_name: string | null;
}

interface AssignmentType {
  id: number;
  name: string;
  alt_name: string | null;
}

interface AssignmentCreateModalProps {
  sessionId: number;
  courseCode: string;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  editAssignment?: any; // If provided, modal will be in edit mode
}

const AssignmentCreateModal = ({
  sessionId,
  courseCode,
  isOpen,
  onClose,
  onSuccess,
  editAssignment,
}: AssignmentCreateModalProps) => {
  const { data: session } = useSession();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [instructions, setInstructions] = useState('');
  const [assignmentTypeId, setAssignmentTypeId] = useState('');
  const [totalPoints, setTotalPoints] = useState(100);
  const [dueDate, setDueDate] = useState('');
  const [timeLimit, setTimeLimit] = useState('');
  const [attemptsAllowed, setAttemptsAllowed] = useState(1);
  const [showResults, setShowResults] = useState(true);
  const [isPublished, setIsPublished] = useState(false);
  const [questions, setQuestions] = useState<Question[]>([
    {
      type: '', // Will be set when types are loaded
      question: '',
      points: 10,
      options: [],
      correctAnswers: [],
      required: true,
    },
  ]);
  const [creating, setCreating] = useState(false);
  const [questionTypes, setQuestionTypes] = useState<QuestionType[]>([]);
  const [assignmentTypes, setAssignmentTypes] = useState<AssignmentType[]>([]);
  const [typesLoading, setTypesLoading] = useState(true);

  const isEditMode = !!editAssignment;
  const hasSubmissions = editAssignment?.submissions && editAssignment.submissions.length > 0;

  // Fetch question types and assignment types
  useEffect(() => {
    const fetchTypes = async () => {
      try {
        setTypesLoading(true);
        const [questionTypesResponse, assignmentTypesResponse] = await Promise.all([
          fetch('/api/question-types'),
          fetch('/api/assignment-types'),
        ]);

        if (questionTypesResponse.ok && assignmentTypesResponse.ok) {
          const questionTypesData = await questionTypesResponse.json();
          const assignmentTypesData = await assignmentTypesResponse.json();

          setQuestionTypes(questionTypesData);
          setAssignmentTypes(assignmentTypesData);

          // Set default question type if not already set
          if (questionTypesData.length > 0 && questions[0].type === '') {
            const defaultQuestionType =
              questionTypesData.find((qt: QuestionType) => qt.name === 'ESSAY') || questionTypesData[0];
            setQuestions([
              {
                type: defaultQuestionType.id.toString(),
                question: '',
                points: 10,
                options: [],
                correctAnswers: [],
                required: true,
              },
            ]);
          }
        }
      } catch (error) {
        console.error('Error fetching types:', error);
      } finally {
        setTypesLoading(false);
      }
    };

    fetchTypes();
  }, []);

  // Load assignment data when in edit mode
  useEffect(() => {
    if (editAssignment && isOpen) {
      setTitle(editAssignment.title || '');
      setDescription(editAssignment.description || '');
      setInstructions(editAssignment.instructions || '');
      setAssignmentTypeId(editAssignment.assignment_type_id?.toString() || '');
      setTotalPoints(editAssignment.total_points || 100);
      setDueDate(editAssignment.due_date ? new Date(editAssignment.due_date).toISOString().slice(0, 16) : '');
      setTimeLimit(editAssignment.time_limit?.toString() || '');
      setAttemptsAllowed(editAssignment.attempts_allowed || 1);
      setShowResults(editAssignment.show_results ?? true);
      setIsPublished(editAssignment.is_published ?? false);

      // Load questions
      const loadedQuestions: Question[] =
        editAssignment.questions?.map((q: any) => ({
          type:
            q.question_type_id?.toString() ||
            questionTypes.find(qt => qt.name === 'ESSAY')?.id.toString() ||
            questionTypes[0]?.id.toString() ||
            '',
          question: q.question_text || '',
          points: q.points || 10,
          options: q.options?.map((opt: any) => opt.option_text) || [],
          correctAnswers:
            q.options?.reduce((acc: number[], opt: any, index: number) => {
              if (opt.is_correct) acc.push(index);
              return acc;
            }, []) || [],
          required: q.required ?? true,
        })) || [];

      if (loadedQuestions.length === 0) {
        const defaultQuestionType = questionTypes.find(qt => qt.name === 'ESSAY') || questionTypes[0];
        loadedQuestions.push({
          type: defaultQuestionType ? defaultQuestionType.id.toString() : '',
          question: '',
          points: 10,
          options: [],
          correctAnswers: [],
          required: true,
        });
      }

      setQuestions(loadedQuestions);
    }
  }, [editAssignment, isOpen, questionTypes]);

  // Reset form when opening in create mode
  useEffect(() => {
    if (isOpen && !editAssignment && questionTypes.length > 0) {
      // Reset to default values for create mode
      const defaultQuestionType = questionTypes.find(qt => qt.name === 'ESSAY') || questionTypes[0];
      const defaultTypeId = defaultQuestionType ? defaultQuestionType.id.toString() : '';

      setTitle('');
      setDescription('');
      setInstructions('');
      setAssignmentTypeId('');
      setTotalPoints(100);
      setDueDate('');
      setTimeLimit('');
      setAttemptsAllowed(1);
      setShowResults(true);
      setIsPublished(false);
      setQuestions([
        {
          type: defaultTypeId,
          question: '',
          points: 10,
          options: [],
          correctAnswers: [],
          required: true,
        },
      ]);
    }
  }, [isOpen, editAssignment, questionTypes]);

  const handleClose = () => {
    if (creating) return;

    const defaultQuestionType = questionTypes.find(qt => qt.name === 'ESSAY') || questionTypes[0];
    const defaultTypeId = defaultQuestionType ? defaultQuestionType.id.toString() : '';

    setTitle('');
    setDescription('');
    setInstructions('');
    setAssignmentTypeId('');
    setTotalPoints(100);
    setDueDate('');
    setTimeLimit('');
    setAttemptsAllowed(1);
    setShowResults(true);
    setIsPublished(false);
    setQuestions([
      {
        type: defaultTypeId,
        question: '',
        points: 10,
        options: [],
        correctAnswers: [],
        required: true,
      },
    ]);
    onClose();
  };

  const addQuestion = () => {
    const defaultQuestionType = questionTypes.find(qt => qt.name === 'ESSAY') || questionTypes[0];
    const defaultTypeId = defaultQuestionType ? defaultQuestionType.id.toString() : '';

    setQuestions([
      ...questions,
      {
        type: defaultTypeId,
        question: '',
        points: 10,
        options: [],
        correctAnswers: [],
        required: true,
      },
    ]);
  };

  const removeQuestion = (index: number) => {
    if (questions.length > 1) {
      setQuestions(questions.filter((_, i) => i !== index));
    }
  };

  const updateQuestion = (index: number, field: keyof Question, value: any) => {
    const updated = [...questions];
    updated[index] = { ...updated[index], [field]: value };

    // Clear options and correct answers when changing question type
    if (field === 'type') {
      updated[index].options = [];
      updated[index].correctAnswers = [];

      // Auto-add True/False options for TRUE_FALSE questions
      const type = questionTypes.find(qt => qt.id.toString() === value);
      if (type && type.name === 'TRUE FALSE') {
        updated[index].options = ['True', 'False'];
      }
    }

    setQuestions(updated);
  };

  const addOption = (questionIndex: number) => {
    const updated = [...questions];
    updated[questionIndex].options.push('');
    setQuestions(updated);
  };

  const updateOption = (questionIndex: number, optionIndex: number, value: string) => {
    const updated = [...questions];
    updated[questionIndex].options[optionIndex] = value;
    setQuestions(updated);
  };

  const removeOption = (questionIndex: number, optionIndex: number) => {
    const updated = [...questions];
    updated[questionIndex].options.splice(optionIndex, 1);

    // Update correct answers indices after removing an option
    updated[questionIndex].correctAnswers = updated[questionIndex].correctAnswers
      .map(idx => (idx > optionIndex ? idx - 1 : idx))
      .filter(idx => idx !== optionIndex);

    setQuestions(updated);
  };

  const toggleCorrectAnswer = (questionIndex: number, optionIndex: number) => {
    const updated = [...questions];
    const question = updated[questionIndex];
    const correctAnswers = [...question.correctAnswers];

    const existingIndex = correctAnswers.indexOf(optionIndex);
    const type = questionTypes.find(qt => qt.id.toString() === question.type);

    if (type && type.name === 'TRUE FALSE') {
      // TRUE_FALSE - only one correct answer
      updated[questionIndex].correctAnswers = [optionIndex];
    } else if (type && type.name === 'MULTIPLE CHOICE') {
      // MULTIPLE_CHOICE - can have multiple correct answers
      if (existingIndex > -1) {
        correctAnswers.splice(existingIndex, 1);
      } else {
        correctAnswers.push(optionIndex);
      }
      updated[questionIndex].correctAnswers = correctAnswers;
    }

    setQuestions(updated);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);

    try {
      // Check if user is authenticated
      if (!session?.user?.id) {
        throw new Error('User not logged in');
      }

      const assignmentData = {
        ...(isEditMode ? {} : { session_id: sessionId }),
        assignment_type_id: parseInt(assignmentTypeId),
        title,
        description: description || null,
        instructions: instructions || null,
        total_points: totalPoints,
        due_date: dueDate ? new Date(dueDate).toISOString() : null,
        time_limit: timeLimit ? parseInt(timeLimit) : null,
        attempts_allowed: attemptsAllowed,
        show_results: showResults,
        is_published: isPublished,
        ...(isEditMode ? {} : { created_by: parseInt(session.user.id) }),
        questions: questions.map((q, index) => ({
          question_type_id: parseInt(q.type),
          question_text: q.question,
          points: q.points,
          order_number: index + 1,
          required: q.required,
          options: q.options
            .filter(opt => opt.trim() !== '')
            .map((option, optIndex) => ({
              option_text: option,
              is_correct: q.correctAnswers.includes(optIndex),
              order_number: optIndex + 1,
            })),
        })),
      };

      const url = isEditMode
        ? `/api/courses/${courseCode}/sessions/${editAssignment.session_id}/assignments/${editAssignment.id}/edit`
        : `/api/courses/${courseCode}/sessions/${sessionId}/assignments`;

      const method = isEditMode ? 'PUT' : 'POST';

      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(assignmentData),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `Failed to ${isEditMode ? 'update' : 'create'} assignment`);
      }

      onSuccess();
      handleClose();
    } catch (error) {
      console.error(`Error ${isEditMode ? 'updating' : 'creating'} assignment:`, error);
      alert(
        `Failed to ${isEditMode ? 'update' : 'create'} assignment: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`
      );
    } finally {
      setCreating(false);
    }
  };

  const getQuestionTypeLabel = (typeId: string) => {
    const type = questionTypes.find(t => t.id.toString() === typeId);
    return type ? type.alt_name || type.name : 'Unknown';
  };

  const needsOptions = (typeId: string) => {
    const type = questionTypes.find(qt => qt.id.toString() === typeId);
    return type && ['MULTIPLE CHOICE', 'TRUE FALSE'].includes(type.name);
  };

  return (
    <Dialog open={isOpen} onOpenChange={open => !open && handleClose()}>
      <DialogContent className="sm:max-w-[800px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FaPlus className="text-blue-600" />
            {isEditMode ? 'Edit Assignment' : 'Create New Assignment'}
          </DialogTitle>
          <DialogDescription>
            {isEditMode
              ? 'Edit assignment with questions for this session.'
              : 'Create a new assignment with questions for this session.'}
          </DialogDescription>
          {isEditMode && hasSubmissions && (
            <div className="bg-orange-50 border border-orange-200 rounded-md p-3 mt-2">
              <div className="flex items-center gap-2 text-orange-800">
                <FaExclamationTriangle className="text-orange-500" />
                <p className="text-sm font-medium">
                  This assignment has student submissions. Some changes may affect grading and student experience.
                </p>
              </div>
            </div>
          )}
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          {typesLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin mr-2" />
              <span>Loading assignment types...</span>
            </div>
          ) : (
            <>
              {/* Basic Assignment Info */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="title">Title *</Label>
                  <Input
                    id="title"
                    value={title}
                    onChange={e => setTitle(e.target.value)}
                    placeholder="Assignment Title"
                    required
                    disabled={creating}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="assignmentType">Assignment Type *</Label>
                  <Select value={assignmentTypeId} onValueChange={setAssignmentTypeId} disabled={creating} required>
                    <SelectTrigger>
                      <SelectValue placeholder="Select assignment type" />
                    </SelectTrigger>
                    <SelectContent>
                      {assignmentTypes.map(type => (
                        <SelectItem key={type.id} value={type.id.toString()}>
                          {type.alt_name || type.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  placeholder="Assignment description (optional)"
                  disabled={creating}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="instructions">Instructions</Label>
                <Textarea
                  id="instructions"
                  value={instructions}
                  onChange={e => setInstructions(e.target.value)}
                  placeholder="Instructions for students (optional)"
                  disabled={creating}
                />
              </div>

              {/* Assignment Settings */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="totalPoints">Total Points</Label>
                  <Input
                    id="totalPoints"
                    type="number"
                    value={totalPoints}
                    onChange={e => setTotalPoints(parseInt(e.target.value) || 100)}
                    min="1"
                    disabled={creating}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="dueDate">Due Date</Label>
                  <Input
                    id="dueDate"
                    type="datetime-local"
                    value={dueDate}
                    onChange={e => setDueDate(e.target.value)}
                    disabled={creating}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="timeLimit">Time Limit (minutes)</Label>
                  <Input
                    id="timeLimit"
                    type="number"
                    value={timeLimit}
                    onChange={e => setTimeLimit(e.target.value)}
                    placeholder="Optional"
                    min="1"
                    disabled={creating}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="attempts">Attempts Allowed</Label>
                  <Input
                    id="attempts"
                    type="number"
                    value={attemptsAllowed}
                    onChange={e => setAttemptsAllowed(parseInt(e.target.value) || 1)}
                    min="1"
                    disabled={creating}
                  />
                </div>
                <div className="flex items-center space-x-2">
                  <input
                    id="showResults"
                    type="checkbox"
                    checked={showResults}
                    onChange={e => setShowResults(e.target.checked)}
                    disabled={creating}
                  />
                  <Label htmlFor="showResults">Show Results to Students</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <input
                    id="isPublished"
                    type="checkbox"
                    checked={isPublished}
                    onChange={e => setIsPublished(e.target.checked)}
                    disabled={creating}
                  />
                  <Label htmlFor="isPublished">Publish Immediately</Label>
                </div>
              </div>

              {/* Questions Section */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold">Questions</h3>
                  <Button type="button" onClick={addQuestion} disabled={creating} size="sm">
                    <FaPlus className="mr-2 h-4 w-4" />
                    Add Question
                  </Button>
                </div>

                {questions.map((question, qIndex) => (
                  <div key={qIndex} className="border rounded-lg p-4 space-y-4">
                    <div className="flex items-center justify-between">
                      <h4 className="font-medium">Question {qIndex + 1}</h4>
                      {questions.length > 1 && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => removeQuestion(qIndex)}
                          disabled={creating}
                        >
                          <FaTrash className="h-4 w-4 text-red-500" />
                        </Button>
                      )}
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="space-y-2">
                        <Label>Question Type</Label>
                        <Select
                          value={question.type}
                          onValueChange={value => updateQuestion(qIndex, 'type', value)}
                          disabled={creating}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {questionTypes.map(type => (
                              <SelectItem key={type.id} value={type.id.toString()}>
                                {type.alt_name || type.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>Points</Label>
                        <Input
                          type="number"
                          value={question.points}
                          onChange={e => updateQuestion(qIndex, 'points', parseInt(e.target.value) || 1)}
                          min="1"
                          disabled={creating}
                        />
                      </div>
                      <div className="flex items-center space-x-2 pt-6">
                        <input
                          type="checkbox"
                          checked={question.required}
                          onChange={e => updateQuestion(qIndex, 'required', e.target.checked)}
                          disabled={creating}
                        />
                        <Label>Required</Label>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label>Question Text</Label>
                      <Textarea
                        value={question.question}
                        onChange={e => updateQuestion(qIndex, 'question', e.target.value)}
                        placeholder="Enter your question here..."
                        disabled={creating}
                      />
                    </div>

                    {needsOptions(question.type) && (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <Label>Options</Label>
                          <Button type="button" size="sm" onClick={() => addOption(qIndex)} disabled={creating}>
                            Add Option
                          </Button>
                        </div>
                        <div className="text-xs text-gray-600 mb-2">
                          {(() => {
                            const type = questionTypes.find(qt => qt.id.toString() === question.type);
                            return type && type.name === 'TRUE FALSE'
                              ? 'Select the correct answer:'
                              : 'Check all correct answers:';
                          })()}
                        </div>
                        {question.options.map((option, oIndex) => (
                          <div key={oIndex} className="flex items-center gap-2">
                            <input
                              type={(() => {
                                const type = questionTypes.find(qt => qt.id.toString() === question.type);
                                return type && type.name === 'TRUE FALSE' ? 'radio' : 'checkbox';
                              })()}
                              name={(() => {
                                const type = questionTypes.find(qt => qt.id.toString() === question.type);
                                return type && type.name === 'TRUE FALSE' ? `correct-${qIndex}` : undefined;
                              })()}
                              checked={question.correctAnswers.includes(oIndex)}
                              onChange={() => toggleCorrectAnswer(qIndex, oIndex)}
                              disabled={creating}
                              className="text-green-600 focus:ring-green-500"
                              title="Mark as correct answer"
                            />
                            <Input
                              value={option}
                              onChange={e => updateOption(qIndex, oIndex, e.target.value)}
                              placeholder={`Option ${oIndex + 1}`}
                              disabled={creating}
                              className="flex-1"
                            />
                            {question.options.length > 1 && (
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => removeOption(qIndex, oIndex)}
                                disabled={creating}
                              >
                                <FaTimes className="h-4 w-4" />
                              </Button>
                            )}
                          </div>
                        ))}
                        {(() => {
                          const type = questionTypes.find(qt => qt.id.toString() === question.type);
                          return (
                            type &&
                            type.name === 'MULTIPLE CHOICE' &&
                            question.correctAnswers.length === 0 &&
                            question.options.length > 0
                          );
                        })() && (
                          <div className="text-xs text-amber-600 bg-amber-50 p-2 rounded">
                            ⚠️ Please select at least one correct answer for this multiple choice question.
                          </div>
                        )}
                        {(() => {
                          const type = questionTypes.find(qt => qt.id.toString() === question.type);
                          return (
                            type &&
                            type.name === 'TRUE FALSE' &&
                            question.correctAnswers.length === 0 &&
                            question.options.length > 0
                          );
                        })() && (
                          <div className="text-xs text-amber-600 bg-amber-50 p-2 rounded">
                            ⚠️ Please select the correct answer for this true/false question.
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {/* Action Buttons */}
              <div className="flex gap-3 pt-4">
                <Button type="button" variant="outline" onClick={handleClose} disabled={creating} className="flex-1">
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={creating || !title || !assignmentTypeId || typesLoading}
                  className="flex-1"
                >
                  {creating ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      {isEditMode ? 'Updating...' : 'Creating...'}
                    </>
                  ) : isEditMode ? (
                    'Update Assignment'
                  ) : (
                    'Create Assignment'
                  )}
                </Button>
              </div>
            </>
          )}
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default AssignmentCreateModal;
