'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { FaPlus, FaTimes, FaTrash, FaExclamationTriangle } from 'react-icons/fa';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2 } from 'lucide-react';
import { useSession } from 'next-auth/react';
import { useAssignmentContext } from '@/lib/contexts/AssignmentContext';

// Types
interface Question {
  type: string;
  question: string;
  points: number;
  options: string[];
  correctAnswers: number[];
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

interface AssignmentFormData {
  title: string;
  description: string;
  instructions: string;
  assignmentTypeId: string;
  totalPoints: number;
  dueDate: string;
  timeLimit: string;
  attemptsAllowed: number;
  showResults: boolean;
  isPublished: boolean;
}

interface AssignmentCreateModalProps {
  sessionId: number;
  courseCode: string;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  editAssignment?: any;
}

// Constants
const DEFAULT_QUESTION_POINTS = 10;
const DEFAULT_TOTAL_POINTS = 100;
const DEFAULT_ATTEMPTS = 1;

const AssignmentCreateModal = ({
  sessionId,
  courseCode,
  isOpen,
  onClose,
  onSuccess,
  editAssignment,
}: AssignmentCreateModalProps) => {
  const { data: session } = useSession();
  const [creating, setCreating] = useState(false);

  // Use context for types data
  const { questionTypes, assignmentTypes, loading: typesLoading } = useAssignmentContext();

  // Form state
  const [formData, setFormData] = useState<AssignmentFormData>({
    title: '',
    description: '',
    instructions: '',
    assignmentTypeId: '',
    totalPoints: DEFAULT_TOTAL_POINTS,
    dueDate: '',
    timeLimit: '',
    attemptsAllowed: DEFAULT_ATTEMPTS,
    showResults: true,
    isPublished: false,
  });

  const [questions, setQuestions] = useState<Question[]>([]);

  // Computed values
  const isEditMode = !!editAssignment;
  const hasSubmissions = editAssignment?.submissions?.length > 0;

  // Determine which fields should be disabled when editing assignments with submissions
  const getFieldRestriction = useCallback(
    (fieldName: string) => {
      if (!isEditMode || !hasSubmissions) return false;

      // Fields that CAN be edited even with submissions
      const allowedFields = ['title', 'description', 'instructions', 'dueDate', 'showResults', 'isPublished'];

      // Fields that CANNOT be edited with submissions
      const restrictedFields = ['assignmentTypeId', 'totalPoints', 'timeLimit', 'attemptsAllowed', 'questions'];

      return restrictedFields.includes(fieldName);
    },
    [isEditMode, hasSubmissions]
  );

  const defaultQuestionType = useMemo(() => {
    return questionTypes.find(qt => qt.name === 'ESSAY') || questionTypes[0];
  }, [questionTypes]);

  // Helper functions
  const createDefaultQuestion = useCallback(
    (): Question => ({
      type: defaultQuestionType?.id.toString() || '',
      question: '',
      points: DEFAULT_QUESTION_POINTS,
      options: [],
      correctAnswers: [],
      required: true,
    }),
    [defaultQuestionType]
  );

  const resetForm = useCallback(() => {
    setFormData({
      title: '',
      description: '',
      instructions: '',
      assignmentTypeId: '',
      totalPoints: DEFAULT_TOTAL_POINTS,
      dueDate: '',
      timeLimit: '',
      attemptsAllowed: DEFAULT_ATTEMPTS,
      showResults: true,
      isPublished: false,
    });
    setQuestions([createDefaultQuestion()]);
  }, [createDefaultQuestion]);

  const updateFormData = useCallback((field: keyof AssignmentFormData, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  }, []);

  const getQuestionTypeByName = useCallback(
    (name: string) => {
      return questionTypes.find(qt => qt.name === name);
    },
    [questionTypes]
  );

  const getQuestionTypeById = useCallback(
    (id: string) => {
      return questionTypes.find(qt => qt.id.toString() === id);
    },
    [questionTypes]
  );

  const needsOptions = useCallback(
    (typeId: string) => {
      const type = getQuestionTypeById(typeId);
      return type && ['MULTIPLE CHOICE', 'TRUE FALSE'].includes(type.name);
    },
    [getQuestionTypeById]
  );

  const isMultipleChoice = useCallback(
    (typeId: string) => {
      const type = getQuestionTypeById(typeId);
      return type?.name === 'MULTIPLE CHOICE';
    },
    [getQuestionTypeById]
  );

  const isTrueFalse = useCallback(
    (typeId: string) => {
      const type = getQuestionTypeById(typeId);
      return type?.name === 'TRUE FALSE';
    },
    [getQuestionTypeById]
  );

  // Question management
  const addQuestion = useCallback(() => {
    setQuestions(prev => [...prev, createDefaultQuestion()]);
  }, [createDefaultQuestion]);

  const removeQuestion = useCallback(
    (index: number) => {
      if (questions.length > 1) {
        setQuestions(prev => prev.filter((_, i) => i !== index));
      }
    },
    [questions.length]
  );

  const updateQuestion = useCallback(
    (index: number, field: keyof Question, value: any) => {
      setQuestions(prev => {
        const updated = [...prev];
        updated[index] = { ...updated[index], [field]: value };

        // Handle question type changes
        if (field === 'type') {
          updated[index].options = [];
          updated[index].correctAnswers = [];

          // Auto-add True/False options
          if (isTrueFalse(value)) {
            updated[index].options = ['True', 'False'];
          }
        }

        return updated;
      });
    },
    [isTrueFalse]
  );

  // const addOption = useCallback((questionIndex: number) => {
  //   setQuestions(prev => {
  //     const updated = [...prev];
  //     updated[questionIndex].options.push('');
  //     return updated;
  //   });
  // }, []);
  const addOption = useCallback((questionIndex: number) => {
    setQuestions(prev => {
      const updated = [...prev];
      const currentQuestion = updated[questionIndex];

      // Create a completely new question object with updated options
      updated[questionIndex] = {
        ...currentQuestion,
        options: [...currentQuestion.options, ''],
      };

      return updated;
    });
  }, []);

  const updateOption = useCallback((questionIndex: number, optionIndex: number, value: string) => {
    setQuestions(prev => {
      const updated = [...prev];
      updated[questionIndex].options[optionIndex] = value;
      return updated;
    });
  }, []);

  const removeOption = useCallback((questionIndex: number, optionIndex: number) => {
    setQuestions(prev => {
      const updated = [...prev];
      updated[questionIndex].options.splice(optionIndex, 1);

      // Update correct answers indices
      updated[questionIndex].correctAnswers = updated[questionIndex].correctAnswers
        .map(idx => (idx > optionIndex ? idx - 1 : idx))
        .filter(idx => idx !== optionIndex);

      return updated;
    });
  }, []);

  // const toggleCorrectAnswer = useCallback(
  //   (questionIndex: number, optionIndex: number) => {
  //     setQuestions(prev => {
  //       const updated = [...prev];
  //       const question = updated[questionIndex];
  //       const correctAnswers = [...question.correctAnswers];
  //       const existingIndex = correctAnswers.indexOf(optionIndex);

  //       if (isTrueFalse(question.type)) {
  //         // True/False - only one correct answer
  //         updated[questionIndex].correctAnswers = [optionIndex];
  //       } else if (isMultipleChoice(question.type)) {
  //         // Multiple Choice - multiple correct answers allowed
  //         if (existingIndex > -1) {
  //           correctAnswers.splice(existingIndex, 1);
  //         } else {
  //           correctAnswers.push(optionIndex);
  //         }
  //         updated[questionIndex].correctAnswers = correctAnswers;
  //       }

  //       return updated;
  //     });
  //   },
  //   [isTrueFalse, isMultipleChoice]
  // );

  const toggleCorrectAnswer = useCallback(
    (questionIndex: number, optionIndex: number) => {
      setQuestions(prev => {
        const newQuestions = prev.map((q, qIdx) => {
          if (qIdx !== questionIndex) return q;

          const questionType = getQuestionTypeById(q.type);
          let newCorrectAnswers = [...q.correctAnswers];

          if (questionType?.name === 'TRUE FALSE') {
            // True/False - only one correct answer
            newCorrectAnswers = [optionIndex];
          } else if (questionType?.name === 'MULTIPLE CHOICE') {
            // Multiple Choice - toggle the answer
            const existingIndex = newCorrectAnswers.indexOf(optionIndex);
            if (existingIndex > -1) {
              newCorrectAnswers = newCorrectAnswers.filter(idx => idx !== optionIndex);
            } else {
              newCorrectAnswers = [...newCorrectAnswers, optionIndex];
            }
          }

          return {
            ...q,
            correctAnswers: newCorrectAnswers,
          };
        });

        return newQuestions;
      });
    },
    [getQuestionTypeById]
  );

  // Validation
  const validateQuestion = useCallback(
    (question: Question) => {
      if (!question.question.trim()) return 'Question text is required';
      if (question.points < 1) return 'Points must be at least 1';

      if (needsOptions(question.type)) {
        if (question.options.length === 0) return 'At least one option is required';
        if (question.correctAnswers.length === 0) return 'At least one correct answer must be selected';
        if (question.options.some(opt => !opt.trim())) return 'All options must have text';
      }

      return null;
    },
    [needsOptions]
  );

  const validateForm = useCallback(() => {
    if (!formData.title.trim()) return 'Title is required';
    if (!formData.assignmentTypeId) return 'Assignment type is required';
    if (formData.totalPoints < 1) return 'Total points must be at least 1';

    for (let i = 0; i < questions.length; i++) {
      const error = validateQuestion(questions[i]);
      if (error) return `Question ${i + 1}: ${error}`;
    }

    return null;
  }, [formData, questions, validateQuestion]);

  const loadEditData = useCallback(() => {
    if (!editAssignment || !isOpen) return;

    setFormData({
      title: editAssignment.title || '',
      description: editAssignment.description || '',
      instructions: editAssignment.instructions || '',
      assignmentTypeId: editAssignment.assignment_type_id?.toString() || '',
      totalPoints: editAssignment.total_points || DEFAULT_TOTAL_POINTS,
      dueDate: editAssignment.due_date ? new Date(editAssignment.due_date).toISOString().slice(0, 16) : '',
      timeLimit: editAssignment.time_limit?.toString() || '',
      attemptsAllowed: editAssignment.attempts_allowed || DEFAULT_ATTEMPTS,
      showResults: editAssignment.show_results ?? true,
      isPublished: editAssignment.is_published ?? false,
    });

    const loadedQuestions: Question[] = editAssignment.questions?.map((q: any) => ({
      type: q.question_type_id?.toString() || defaultQuestionType?.id.toString() || '',
      question: q.question_text || '',
      points: q.points || DEFAULT_QUESTION_POINTS,
      options: q.options?.map((opt: any) => opt.option_text) || [],
      correctAnswers:
        q.options?.reduce((acc: number[], opt: any, index: number) => {
          if (opt.is_correct) acc.push(index);
          return acc;
        }, []) || [],
      required: q.required ?? true,
    })) || [createDefaultQuestion()];

    setQuestions(loadedQuestions);
  }, [editAssignment, isOpen, defaultQuestionType, createDefaultQuestion]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const validationError = validateForm();
    if (validationError) {
      alert(validationError);
      return;
    }

    if (!session?.user?.id) {
      alert('User not logged in');
      return;
    }

    setCreating(true);

    try {
      const assignmentData = {
        ...(isEditMode ? {} : { session_id: sessionId }),
        assignment_type_id: parseInt(formData.assignmentTypeId),
        title: formData.title,
        description: formData.description || null,
        instructions: formData.instructions || null,
        total_points: formData.totalPoints,
        due_date: formData.dueDate ? new Date(formData.dueDate).toISOString() : null,
        time_limit: formData.timeLimit ? parseInt(formData.timeLimit) : null,
        attempts_allowed: formData.attemptsAllowed,
        show_results: formData.showResults,
        is_published: formData.isPublished,
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

      const response = await fetch(url, {
        method: isEditMode ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(assignmentData),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `Failed to ${isEditMode ? 'update' : 'create'} assignment`);
      }

      const responseData = await response.json();

      // Show appropriate success message
      if (responseData.warning) {
        alert(`${responseData.message}\n\n${responseData.warning}`);
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

  const handleClose = useCallback(() => {
    if (creating) return;
    resetForm();
    onClose();
  }, [creating, resetForm, onClose]);

  // Effects
  useEffect(() => {
    if (isOpen && !editAssignment && questionTypes.length > 0) {
      resetForm();
    }
  }, [isOpen, editAssignment, questionTypes.length, resetForm]);

  useEffect(() => {
    loadEditData();
  }, [loadEditData]);

  // Render helpers
  const renderQuestionTypeSelect = (question: Question, qIndex: number) => (
    <div className="space-y-2">
      <Label>Question Type</Label>
      <Select value={question.type} onValueChange={value => updateQuestion(qIndex, 'type', value)} disabled={creating}>
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
  );

  const renderQuestionOptions = (question: Question, qIndex: number) => {
    if (!needsOptions(question.type)) return null;

    const hasValidationError = question.correctAnswers.length === 0 && question.options.length > 0;
    const inputType = isTrueFalse(question.type) ? 'radio' : 'checkbox';
    const inputName = isTrueFalse(question.type) ? `correct-${qIndex}` : undefined;

    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label>Options</Label>
          {/* <Button type="button" size="sm" onClick={() => addOption(qIndex)} disabled={creating}>
            Add Option
          </Button> */}
          <Button
            type="button"
            size="sm"
            onClick={e => {
              e.preventDefault();
              e.stopPropagation();
              addOption(qIndex);
            }}
            disabled={creating}
          >
            Add Option
          </Button>
        </div>

        <div className="text-xs text-gray-600 mb-2">
          {isTrueFalse(question.type) ? 'Select the correct answer:' : 'Check all correct answers:'}
        </div>

        {question.options.map((option, oIndex) => (
          <div key={oIndex} className="flex items-center gap-2">
            <input
              type={inputType}
              name={inputName}
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

        {hasValidationError && (
          <div className="text-xs text-amber-600 bg-amber-50 p-2 rounded">
            ⚠️ Please select {isTrueFalse(question.type) ? 'the' : 'at least one'} correct answer for this{' '}
            {isTrueFalse(question.type) ? 'true/false' : 'multiple choice'} question.
          </div>
        )}
      </div>
    );
  };

  if (typesLoading) {
    return (
      <Dialog open={isOpen} onOpenChange={open => !open && handleClose()}>
        <DialogContent className="sm:max-w-[400px]">
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin mr-2" />
            <span>Loading assignment types...</span>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

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
                <div>
                  <p className="text-sm font-medium">This assignment has student submissions.</p>
                  <p className="text-xs text-orange-700 mt-1">
                    You can edit: Title, Description, Instructions, Due Date, Show Results, and Publication Status.
                  </p>
                  <p className="text-xs text-orange-700">
                    Restricted: Assignment Type, Points, Time Limit, Attempts, and Questions.
                  </p>
                </div>
              </div>
            </div>
          )}
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Basic Assignment Info */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="title">Title *</Label>
              <Input
                id="title"
                value={formData.title}
                onChange={e => updateFormData('title', e.target.value)}
                placeholder="Assignment Title"
                required
                disabled={creating}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="assignmentType">Assignment Type *</Label>
              <Select
                value={formData.assignmentTypeId}
                onValueChange={value => updateFormData('assignmentTypeId', value)}
                disabled={creating || getFieldRestriction('assignmentTypeId')}
                required
              >
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
              value={formData.description}
              onChange={e => updateFormData('description', e.target.value)}
              placeholder="Assignment description (optional)"
              disabled={creating}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="instructions">Instructions</Label>
            <Textarea
              id="instructions"
              value={formData.instructions}
              onChange={e => updateFormData('instructions', e.target.value)}
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
                value={formData.totalPoints}
                onChange={e => updateFormData('totalPoints', parseInt(e.target.value) || DEFAULT_TOTAL_POINTS)}
                min="1"
                disabled={creating || getFieldRestriction('totalPoints')}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="dueDate">Due Date</Label>
              <Input
                id="dueDate"
                type="datetime-local"
                value={formData.dueDate}
                onChange={e => updateFormData('dueDate', e.target.value)}
                disabled={creating}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="timeLimit">Time Limit (minutes)</Label>
              <Input
                id="timeLimit"
                type="number"
                value={formData.timeLimit}
                onChange={e => updateFormData('timeLimit', e.target.value)}
                placeholder="Optional"
                min="1"
                disabled={creating || getFieldRestriction('timeLimit')}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="attempts">Attempts Allowed</Label>
              <Input
                id="attempts"
                type="number"
                value={formData.attemptsAllowed}
                onChange={e => updateFormData('attemptsAllowed', parseInt(e.target.value) || DEFAULT_ATTEMPTS)}
                min="1"
                disabled={creating || getFieldRestriction('attemptsAllowed')}
              />
            </div>
            <div className="flex items-center space-x-2">
              <input
                id="showResults"
                type="checkbox"
                checked={formData.showResults}
                onChange={e => updateFormData('showResults', e.target.checked)}
                disabled={creating}
              />
              <Label htmlFor="showResults">Show Results to Students</Label>
            </div>
            <div className="flex items-center space-x-2">
              <input
                id="isPublished"
                type="checkbox"
                checked={formData.isPublished}
                onChange={e => updateFormData('isPublished', e.target.checked)}
                disabled={creating}
              />
              <Label htmlFor="isPublished">Publish Immediately</Label>
            </div>
          </div>

          {/* Questions Section */}
          {!getFieldRestriction('questions') && (
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
                    {renderQuestionTypeSelect(question, qIndex)}
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

                  {renderQuestionOptions(question, qIndex)}
                </div>
              ))}
            </div>
          )}

          {getFieldRestriction('questions') && (
            <div className="bg-gray-50 border border-gray-200 rounded-md p-4">
              <h3 className="text-lg font-semibold text-gray-600 mb-2">Questions</h3>
              <p className="text-sm text-gray-600">
                Questions cannot be modified because students have already submitted responses.
              </p>
              <p className="text-xs text-gray-500 mt-1">Total Questions: {editAssignment?.questions?.length || 0}</p>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex gap-3 pt-4">
            <Button type="button" variant="outline" onClick={handleClose} disabled={creating} className="flex-1">
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={creating || !formData.title || !formData.assignmentTypeId}
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
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default AssignmentCreateModal;
