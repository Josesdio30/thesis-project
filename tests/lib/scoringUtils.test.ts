import {
  QUESTION_TYPES,
  SCORING,
  calculateAssignmentScore,
  calculatePercentage,
  calculateQuestionScore,
  formatScore,
  getLetterGrade,
  getScoreDisplayStatus,
  needsManualGrading,
  type Question,
  type QuestionType,
} from '@/lib/scoringUtils';

const TYPES: Record<string, QuestionType> = {
  mc: { id: 1, name: QUESTION_TYPES.MULTIPLE_CHOICE },
  tf: { id: 2, name: QUESTION_TYPES.TRUE_FALSE },
  essay: { id: 3, name: QUESTION_TYPES.ESSAY },
  file: { id: 4, name: QUESTION_TYPES.FILE_UPLOAD },
  other: { id: 5, name: 'MATCHING' },
};
const ALL_TYPES = Object.values(TYPES);

function choice(id: number, points: number, correctOptionId: number, typeId = TYPES.mc.id): Question {
  return {
    id,
    question_type_id: typeId,
    question_text: `Q${id}`,
    points,
    options: [10, 11, 12].map(optionId => ({
      id: id * 100 + optionId,
      option_text: `option ${optionId}`,
      is_correct: id * 100 + optionId === correctOptionId,
    })),
  };
}

function open(id: number, points: number, typeId = TYPES.essay.id): Question {
  return { id, question_type_id: typeId, question_text: `Q${id}`, points };
}

describe('FR-SUB-4: objective questions (MULTIPLE CHOICE / TRUE FALSE)', () => {
  const q = choice(1, 5, 110);

  test('FR-SUB-4: the correct option earns full points', () => {
    expect(calculateQuestionScore(q, TYPES.mc, { question_id: 1, selected_option_id: 110 })).toBe(5);
  });

  test('FR-SUB-4: TRUE FALSE uses the same rule', () => {
    const tf = choice(2, 2, 210, TYPES.tf.id);
    expect(calculateQuestionScore(tf, TYPES.tf, { question_id: 2, selected_option_id: 210 })).toBe(2);
    expect(calculateQuestionScore(tf, TYPES.tf, { question_id: 2, selected_option_id: 211 })).toBe(0);
  });

  test('FR-SUB-4: a wrong option earns 0 (no partial credit, no negative marking)', () => {
    expect(calculateQuestionScore(q, TYPES.mc, { question_id: 1, selected_option_id: 111 })).toBe(0);
  });

  test.each([
    ['no answer', undefined],
    ['no selected option', { question_id: 1 }],
    ['an option from another question', { question_id: 1, selected_option_id: 999 }],
  ])('FR-SUB-4: %s earns 0', (_label, answer) => {
    expect(calculateQuestionScore(q, TYPES.mc, answer)).toBe(0);
  });

  test('FR-SUB-4: a question without options earns 0', () => {
    expect(calculateQuestionScore({ ...q, options: undefined }, TYPES.mc, { question_id: 1, selected_option_id: 110 })).toBe(0);
  });

  test('a question with 0 or missing points earns 0 even when correct', () => {
    expect(calculateQuestionScore({ ...q, points: 0 }, TYPES.mc, { question_id: 1, selected_option_id: 110 })).toBe(0);
    expect(
      calculateQuestionScore({ ...q, points: undefined as unknown as number }, TYPES.mc, {
        question_id: 1,
        selected_option_id: 110,
      })
    ).toBe(0);
  });

  test('type names are matched exactly (uppercase with a space), see O-21', () => {
    const lowercase = { id: 1, name: 'Multiple Choice' };
    expect(calculateQuestionScore(q, lowercase, { question_id: 1, selected_option_id: 110 })).toBe(0);
  });
});

describe('FR-SUB-5: manual question types are not auto-scored', () => {
  test.each([
    ['ESSAY', TYPES.essay],
    ['FILE_UPLOAD', TYPES.file],
    ['an unknown type', TYPES.other],
  ])('FR-SUB-5: %s scores 0 at submission', (_label, type) => {
    expect(calculateQuestionScore(open(1, 10, type.id), type, { question_id: 1, answer_text: 'my answer' })).toBe(0);
  });

  test('FR-SUB-5: the scoring constants list the auto and manual types', () => {
    expect(SCORING.AUTO_GRADABLE_TYPES).toEqual(['MULTIPLE CHOICE', 'TRUE FALSE']);
    expect(SCORING.MANUAL_GRADABLE_TYPES).toEqual(['ESSAY', 'FILE_UPLOAD']);
  });
});

describe('FR-SUB-4/5: whole-assignment scoring', () => {
  const questions = [choice(1, 2, 110), choice(2, 3, 210, TYPES.tf.id), open(3, 5)];

  test('FR-SUB-4: totals the auto-graded points and reports each question', () => {
    const result = calculateAssignmentScore(questions, ALL_TYPES, [
      { question_id: 1, selected_option_id: 110 },
      { question_id: 2, selected_option_id: 211 },
      { question_id: 3, answer_text: 'essay' },
    ]);

    expect(result.totalScore).toBe(2);
    expect(result.maxPossibleScore).toBe(10);
    expect(result.questionScores).toEqual([
      { questionId: 1, score: 2, maxScore: 2, isAutoGraded: true },
      { questionId: 2, score: 0, maxScore: 3, isAutoGraded: true },
      { questionId: 3, score: 0, maxScore: 5, isAutoGraded: false },
    ]);
  });

  test('FR-SUB-4: unanswered questions score 0 but still count towards the maximum', () => {
    const result = calculateAssignmentScore(questions, ALL_TYPES, []);
    expect(result.totalScore).toBe(0);
    expect(result.maxPossibleScore).toBe(10);
  });

  test('a question whose type is unknown scores 0 and is not auto-graded', () => {
    const result = calculateAssignmentScore([choice(1, 2, 110, 99)], ALL_TYPES, [
      { question_id: 1, selected_option_id: 110 },
    ]);
    expect(result.questionScores[0]).toEqual({ questionId: 1, score: 0, maxScore: 2, isAutoGraded: false });
  });

  test('a question with missing points counts 0 towards the maximum', () => {
    const result = calculateAssignmentScore(
      [{ ...open(1, 0), points: undefined as unknown as number }],
      ALL_TYPES,
      []
    );
    expect(result.maxPossibleScore).toBe(0);
    expect(result.questionScores[0].maxScore).toBe(0);
  });

  test('FR-SUB-4: the total is rounded to 2 decimal places', () => {
    const result = calculateAssignmentScore([choice(1, 0.333, 110), choice(2, 0.333, 210)], ALL_TYPES, [
      { question_id: 1, selected_option_id: 110 },
      { question_id: 2, selected_option_id: 210 },
    ]);
    expect(result.totalScore).toBe(0.67);
  });
});

describe('FR-SCR-2: percentage and letter grade', () => {
  test('percentage is rounded to 2 decimal places', () => {
    expect(calculatePercentage(1, 3)).toBe(33.33);
    expect(calculatePercentage(2, 3)).toBe(66.67);
  });

  test('a zero maximum gives 0% instead of dividing by zero', () => {
    expect(calculatePercentage(5, 0)).toBe(0);
  });

  test.each([
    [100, 'A'],
    [90, 'A'],
    [89.99, 'B'],
    [80, 'B'],
    [79.99, 'C'],
    [70, 'C'],
    [69.99, 'D'],
    [60, 'D'],
    [59.99, 'F'],
    [0, 'F'],
  ])('FR-SCR-2: %d%% → %s (scale pending Q-20)', (percentage, grade) => {
    expect(getLetterGrade(percentage)).toBe(grade);
  });

  test('formatScore renders score/max', () => {
    expect(formatScore(7.5, 10)).toBe('7.5/10');
  });
});

describe('FR-SCR-3: score display status', () => {
  const objective = [choice(1, 10, 110)];
  const withEssay = [choice(1, 10, 110), open(2, 10)];

  test('needsManualGrading is true only when an ESSAY or FILE_UPLOAD question exists', () => {
    expect(needsManualGrading(objective, ALL_TYPES)).toBe(false);
    expect(needsManualGrading(withEssay, ALL_TYPES)).toBe(true);
    expect(needsManualGrading([open(1, 5, TYPES.file.id)], ALL_TYPES)).toBe(true);
    expect(needsManualGrading([open(1, 5, 99)], ALL_TYPES)).toBe(false);
  });

  test('FR-SCR-3: manual questions not yet graded show "Pending Grading"', () => {
    expect(getScoreDisplayStatus(null, 20, withEssay, ALL_TYPES)).toEqual({
      display: 'Pending Grading',
      percentage: null,
      letterGrade: null,
      status: 'pending',
    });
  });

  test('FR-SCR-3: a fully graded assignment with manual questions shows the score', () => {
    expect(getScoreDisplayStatus(18, 20, withEssay, ALL_TYPES, true)).toEqual({
      display: '18/20',
      percentage: 90,
      letterGrade: 'A',
      status: 'graded',
    });
  });

  test('FR-SCR-3: an objective-only assignment shows its score right away', () => {
    expect(getScoreDisplayStatus(7, 10, objective, ALL_TYPES)).toEqual({
      display: '7/10',
      percentage: 70,
      letterGrade: 'C',
      status: 'graded',
    });
  });

  test('FR-SCR-3: no score on an objective-only assignment shows "Not Submitted"', () => {
    expect(getScoreDisplayStatus(null, 10, objective, ALL_TYPES)).toEqual({
      display: 'Not Submitted',
      percentage: null,
      letterGrade: null,
      status: 'pending',
    });
  });

  describe('characterization: the "Partial" status is unreachable', () => {
    // RISK DC-16: the partial branch (manual questions, a score, not fully
    // graded) is shadowed by the "Pending Grading" check above it, so a
    // partially auto-scored assignment never shows "x/y (Partial)".
    test('DC-16: an auto-scored part with ungraded essays still shows "Pending Grading"', () => {
      expect(getScoreDisplayStatus(10, 20, withEssay, ALL_TYPES, false).display).toBe('Pending Grading');
    });
  });
});
