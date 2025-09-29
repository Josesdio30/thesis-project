// Assignment scoring constants
export const SCORING = {
  AUTO_GRADABLE_TYPES: ['MULTIPLE CHOICE', 'TRUE FALSE'],
  MANUAL_GRADABLE_TYPES: ['ESSAY', 'FILE_UPLOAD'],
  PARTIAL_CREDIT: true,
  ROUNDING: 2, // decimal places
} as const;

// Question types for scoring
export const QUESTION_TYPES = {
  MULTIPLE_CHOICE: 'MULTIPLE CHOICE',
  TRUE_FALSE: 'TRUE FALSE',
  ESSAY: 'ESSAY',
  FILE_UPLOAD: 'FILE_UPLOAD',
} as const;

export interface SubmissionAnswer {
  question_id: number;
  selected_option_id?: number;
  option_text?: string;
  answer_text?: string;
}

export interface Question {
  id: number;
  question_type_id: number;
  question_text: string;
  points: number;
  options?: Array<{
    id: number;
    option_text: string;
    is_correct: boolean;
  }>;
}

export interface QuestionType {
  id: number;
  name: string;
}

/**
 * Calculate score for a single question
 */
export const calculateQuestionScore = (
  question: Question,
  questionType: QuestionType,
  answer?: SubmissionAnswer
): number => {
  // No answer provided
  if (!answer) return 0;

  const questionPoints = question.points || 0;

  switch (questionType.name) {
    case QUESTION_TYPES.MULTIPLE_CHOICE:
    case QUESTION_TYPES.TRUE_FALSE:
      return calculateMultipleChoiceScore(question, answer, questionPoints);

    case QUESTION_TYPES.ESSAY:
    case QUESTION_TYPES.FILE_UPLOAD:
      // Manual grading required - return 0 for now
      return 0;

    default:
      return 0;
  }
};

/**
 * Calculate score for multiple choice/true false questions
 */
const calculateMultipleChoiceScore = (question: Question, answer: SubmissionAnswer, maxPoints: number): number => {
  if (!question.options || !answer.selected_option_id) return 0;

  // Find the selected option
  const selectedOption = question.options.find(option => option.id === answer.selected_option_id);

  if (!selectedOption) return 0;

  // Return full points if correct, 0 if incorrect
  return selectedOption.is_correct ? maxPoints : 0;
};

/**
 * Calculate total score for an assignment submission
 */
export const calculateAssignmentScore = (
  questions: Question[],
  questionTypes: QuestionType[],
  answers: SubmissionAnswer[]
): {
  totalScore: number;
  maxPossibleScore: number;
  questionScores: Array<{
    questionId: number;
    score: number;
    maxScore: number;
    isAutoGraded: boolean;
  }>;
} => {
  let totalScore = 0;
  let maxPossibleScore = 0;
  const questionScores = [];

  for (const question of questions) {
    const questionType = questionTypes.find(qt => qt.id === question.question_type_id);
    const answer = answers.find(a => a.question_id === question.id);

    const questionScore = questionType && answer ? calculateQuestionScore(question, questionType, answer) : 0;

    const isAutoGraded = questionType ? SCORING.AUTO_GRADABLE_TYPES.includes(questionType.name as any) : false;

    totalScore += questionScore;
    maxPossibleScore += question.points || 0;

    questionScores.push({
      questionId: question.id,
      score: questionScore,
      maxScore: question.points || 0,
      isAutoGraded,
    });
  }

  return {
    totalScore: Math.round(totalScore * Math.pow(10, SCORING.ROUNDING)) / Math.pow(10, SCORING.ROUNDING),
    maxPossibleScore,
    questionScores,
  };
};

/**
 * Calculate percentage score
 */
export const calculatePercentage = (score: number, maxScore: number): number => {
  if (maxScore === 0) return 0;
  return Math.round((score / maxScore) * 100 * Math.pow(10, SCORING.ROUNDING)) / Math.pow(10, SCORING.ROUNDING);
};

/**
 * Get letter grade based on percentage
 */
export const getLetterGrade = (percentage: number): string => {
  if (percentage >= 90) return 'A';
  if (percentage >= 80) return 'B';
  if (percentage >= 70) return 'C';
  if (percentage >= 60) return 'D';
  return 'F';
};

/**
 * Check if assignment needs manual grading
 */
export const needsManualGrading = (questions: Question[], questionTypes: QuestionType[]): boolean => {
  return questions.some(question => {
    const questionType = questionTypes.find(qt => qt.id === question.question_type_id);
    return questionType && SCORING.MANUAL_GRADABLE_TYPES.includes(questionType.name as any);
  });
};

/**
 * Format score display
 */
export const formatScore = (score: number, maxScore: number): string => {
  return `${score}/${maxScore}`;
};

/**
 * Enhanced score display logic
 */
export const getScoreDisplayStatus = (
  totalScore: number | null,
  maxScore: number,
  questions: Question[],
  questionTypes: QuestionType[],
  isFullyGraded: boolean = false
): {
  display: string;
  percentage: number | null;
  letterGrade: string | null;
  status: 'graded' | 'pending' | 'partial';
} => {
  const requiresManualGrading = needsManualGrading(questions, questionTypes);

  // If needs manual grading and not fully graded
  if (requiresManualGrading && !isFullyGraded) {
    return {
      display: 'Pending Grading',
      percentage: null,
      letterGrade: null,
      status: 'pending',
    };
  }

  // If has some auto-graded questions but also manual ones
  if (requiresManualGrading && totalScore !== null && !isFullyGraded) {
    const percentage = calculatePercentage(totalScore, maxScore);
    return {
      display: `${totalScore}/${maxScore} (Partial)`,
      percentage,
      letterGrade: getLetterGrade(percentage),
      status: 'partial',
    };
  }

  // Fully graded
  if (totalScore !== null) {
    const percentage = calculatePercentage(totalScore, maxScore);
    return {
      display: `${totalScore}/${maxScore}`,
      percentage,
      letterGrade: getLetterGrade(percentage),
      status: 'graded',
    };
  }

  return {
    display: 'Not Submitted',
    percentage: null,
    letterGrade: null,
    status: 'pending',
  };
};
