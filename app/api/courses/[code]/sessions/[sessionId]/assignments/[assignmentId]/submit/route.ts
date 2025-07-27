import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@/lib/generated/prisma';
import { SubmissionStatus } from '@/lib/enumeration-service';

const prisma = new PrismaClient();

// POST /api/courses/[code]/sessions/[sessionId]/assignments/[assignmentId]/submit
export async function POST(
  request: NextRequest,
  { params }: { params: { code: string; sessionId: string; assignmentId: string } }
) {
  try {
    const assignmentId = parseInt(params.assignmentId);
    if (isNaN(assignmentId)) {
      return NextResponse.json({ error: 'Invalid assignment ID' }, { status: 400 });
    }

    const body = await request.json();
    const { student_id, answers } = body;

    if (!student_id || !answers || !Array.isArray(answers)) {
      return NextResponse.json({ error: 'Missing required fields: student_id, answers' }, { status: 400 });
    }

    // Check if assignment exists and is published
    const assignment = await prisma.assignments.findUnique({
      where: { id: assignmentId },
      include: {
        assignment_questions: {
          include: {
            assignment_question_options: true,
          },
        },
      },
    });

    if (!assignment) {
      return NextResponse.json({ error: 'Assignment not found' }, { status: 404 });
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
        student_id: parseInt(student_id),
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
          student_id: parseInt(student_id),
          attempt_number: existingSubmissions + 1,
          status_id: submittedStatusId,
          submitted_at: new Date(),
        },
      });

      // Create answers
      for (const answer of answers) {
        const question = assignment.assignment_questions.find(q => q.id === answer.question_id);
        if (!question) continue;

        await tx.assignment_answers.create({
          data: {
            submission_id: submission.id,
            question_id: answer.question_id,
            answer_text: answer.answer_text || null,
            selected_option_id: answer.selected_option_id || null,
            points_earned: 0, // Will be calculated during grading
          },
        });
      }

      return submission;
    });

    return NextResponse.json({
      success: true,
      data: result,
      message: 'Assignment submitted successfully',
    });
  } catch (error) {
    console.error('Error submitting assignment:', error);
    return NextResponse.json(
      { error: 'Failed to submit assignment', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
