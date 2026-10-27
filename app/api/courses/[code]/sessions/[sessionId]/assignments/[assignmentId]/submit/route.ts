import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { getSessionUser, unauthorizedResponse } from '@/lib/auth/course-access';
import { prisma } from '@/lib/prisma';
import { SubmissionStatus } from '@/lib/enumeration-service';
import { calculateAssignmentScore } from '@/lib/scoringUtils';

// POST /api/courses/[code]/sessions/[sessionId]/assignments/[assignmentId]/submit
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ code: string; sessionId: string; assignmentId: string }> }
) {
  try {
    // Q-12: the submitter is always the signed-in student; a body student_id is ignored.
    const user = await getSessionUser();
    if (!user) return unauthorizedResponse();
    const studentId = user.id;

    const resolvedParams = await params;
    const assignmentId = parseInt(resolvedParams.assignmentId);
    if (isNaN(assignmentId)) {
      return NextResponse.json({ error: 'Invalid assignment ID' }, { status: 400 });
    }

    const body = await request.json();
    const { answers } = body;

    if (!answers || !Array.isArray(answers)) {
      return NextResponse.json({ error: 'Missing required field: answers' }, { status: 400 });
    }

    // Check if assignment exists and is published
    const assignment = await prisma.assignments.findUnique({
      where: { id: assignmentId },
      include: {
        assignment_questions: {
          include: {
            assignment_question_options: true,
            enumeration: true, // Include question type
          },
        },
      },
    });

    if (!assignment) {
      return NextResponse.json({ error: 'Assignment not found' }, { status: 404 });
    }

    // Q-12: only students enrolled in the assignment's class_course may submit.
    const enrollment = await prisma.enrollments.findFirst({
      where: { student_id: studentId, class_courses: { sessions: { some: { id: assignment.session_id } } } },
      select: { id: true },
    });
    if (!enrollment) {
      return NextResponse.json({ error: 'You are not enrolled in this course' }, { status: 403 });
    }

    if (!assignment.is_published) {
      return NextResponse.json({ error: 'Assignment is not published' }, { status: 400 });
    }

    // Check if due date has passed
    if (assignment.due_date && new Date(assignment.due_date) < new Date()) {
      return NextResponse.json({ error: 'Assignment due date has passed' }, { status: 400 });
    }

    // Check existing submissions for attempts
    const existingSubmissions = await prisma.assignment_submissions.count({
      where: {
        assignment_id: assignmentId,
        student_id: studentId,
      },
    });

    if (existingSubmissions >= (assignment.attempts_allowed || 1)) {
      return NextResponse.json({ error: 'Maximum attempts reached' }, { status: 400 });
    }

    // Create submission and answers in a transaction
    const result = await prisma.$transaction(async tx => {
      // Get the correct status ID for SUBMITTED
      const submittedStatusId = await SubmissionStatus.getSubmittedId();

      if (!submittedStatusId) {
        throw new Error('SUBMITTED status not found in enumeration table');
      }

      // Create submission
      const submission = await tx.assignment_submissions.create({
        data: {
          assignment_id: assignmentId,
          student_id: studentId,
          attempt_number: existingSubmissions + 1,
          status_id: submittedStatusId,
          submitted_at: new Date(),
        },
      });

      // Create answers and collect them for scoring
      const submissionAnswers = [];
      for (const answer of answers) {
        const question = assignment.assignment_questions.find(q => q.id === answer.question_id);
        if (!question) continue;

        const submissionAnswer = await tx.assignment_answers.create({
          data: {
            submission_id: submission.id,
            question_id: answer.question_id,
            answer_text: answer.answer_text || null,
            selected_option_id: answer.selected_option_id || null,
            points_earned: 0, // Will be calculated during scoring
          },
        });

        submissionAnswers.push({
          id: submissionAnswer.id, // Keep id for database updates
          question_id: answer.question_id,
          selected_option_id: answer.selected_option_id,
          answer_text: answer.answer_text,
        });
      }

      // Calculate scores
      const scoreResult = calculateAssignmentScore(
        assignment.assignment_questions.map(q => ({
          id: q.id,
          question_type_id: q.question_type_id,
          question_text: q.question_text,
          points: q.points || 1,
          options:
            q.assignment_question_options?.map(opt => ({
              id: opt.id,
              option_text: opt.option_text,
              is_correct: opt.is_correct || false,
            })) || [], // Include properly formatted options for auto-grading
        })),
        assignment.assignment_questions.map(q => ({
          id: q.enumeration.id,
          name: q.enumeration.name,
          category: q.enumeration.category,
          is_active: q.enumeration.is_active,
        })),
        submissionAnswers.map(sa => ({
          question_id: sa.question_id,
          selected_option_id: sa.selected_option_id,
          answer_text: sa.answer_text,
        }))
      );

      // Check if assignment needs manual grading (has essay questions)
      const hasEssayQuestions = assignment.assignment_questions.some(
        q => q.enumeration.name === 'ESSAY' || q.enumeration.name === 'FILE_UPLOAD'
      );

      // Update submission with score - null if needs manual grading for essays
      await tx.assignment_submissions.update({
        where: { id: submission.id },
        data: {
          total_score: hasEssayQuestions ? null : scoreResult.totalScore,
        },
      });

      // Update individual question scores
      for (const questionScore of scoreResult.questionScores) {
        const submissionAnswer = submissionAnswers.find(sa => sa.question_id === questionScore.questionId);
        if (submissionAnswer) {
          await tx.assignment_answers.update({
            where: { id: submissionAnswer.id },
            data: {
              points_earned: questionScore.score,
              feedback: questionScore.isAutoGraded ? 'Auto-graded' : 'Requires manual grading',
            },
          });
        }
      }

      return {
        ...submission,
        total_score: hasEssayQuestions ? null : scoreResult.totalScore,
        scoreResult,
        needsManualGrading: hasEssayQuestions,
      };
    });

    return NextResponse.json({
      success: true,
      data: result,
      message: 'Assignment submitted successfully',
    });
  } catch (error) {
    // FR-SUB-1 / O-18: a concurrent submit can pass the attempt count above; the
    // unique (assignment_id, student_id, attempt_number) index rejects the loser.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return NextResponse.json({ error: 'Maximum attempts reached' }, { status: 409 });
    }
    console.error('Error submitting assignment:', error);
    return NextResponse.json(
      { error: 'Failed to submit assignment' },
      { status: 500 }
    );
  }
}
