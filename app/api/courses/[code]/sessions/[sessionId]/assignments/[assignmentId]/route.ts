import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@/lib/generated/prisma';
import { SubmissionStatus } from '@/lib/enumeration-service';

const prisma = new PrismaClient();

// GET /api/courses/[code]/sessions/[sessionId]/assignments/[assignmentId]
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ code: string; sessionId: string; assignmentId: string }> }
) {
  try {
    const { assignmentId: assignmentIdParam } = await params;
    const assignmentId = parseInt(assignmentIdParam);
    if (isNaN(assignmentId)) {
      return NextResponse.json({ error: 'Invalid assignment ID' }, { status: 400 });
    }

    const assignment = await prisma.assignments.findUnique({
      where: { id: assignmentId },
      include: {
        assignment_questions: {
          orderBy: { order_number: 'asc' },
          include: {
            assignment_question_options: {
              orderBy: { order_number: 'asc' },
            },
          },
        },
        assignment_submissions: {
          include: {
            app_user_assignment_submissions_student_idToapp_user: {
              select: {
                id: true,
                nama_lengkap: true,
                user_name: true,
              },
            },
            assignment_answers: {
              include: {
                assignment_questions: true,
                assignment_question_options: true,
              },
            },
          },
        },
        enumeration: true,
      },
    });

    if (!assignment) {
      return NextResponse.json({ error: 'Assignment not found' }, { status: 404 });
    }

    // Transform the data
    const transformedAssignment = {
      id: assignment.id,
      title: assignment.title,
      description: assignment.description,
      instructions: assignment.instructions,
      total_points: assignment.total_points,
      due_date: assignment.due_date?.toISOString(),
      start_date: assignment.start_date?.toISOString(),
      time_limit: assignment.time_limit,
      attempts_allowed: assignment.attempts_allowed,
      show_results: assignment.show_results,
      is_published: assignment.is_published,
      assignment_type_id: assignment.assignment_type_id,
      assignment_type: assignment.enumeration.name,
      created_date: assignment.created_date?.toISOString(),
      questions: assignment.assignment_questions.map(question => ({
        id: question.id,
        question_text: question.question_text,
        points: question.points,
        question_type_id: question.question_type_id,
        order_number: question.order_number,
        required: question.required,
        options: question.assignment_question_options.map(option => ({
          id: option.id,
          option_text: option.option_text,
          is_correct: option.is_correct,
          order_number: option.order_number,
        })),
      })),
      submissions: assignment.assignment_submissions.map(submission => ({
        id: submission.id,
        student: {
          id: submission.app_user_assignment_submissions_student_idToapp_user.id,
          nama_lengkap: submission.app_user_assignment_submissions_student_idToapp_user.nama_lengkap,
          user_name: submission.app_user_assignment_submissions_student_idToapp_user.user_name,
        },
        attempt_number: submission.attempt_number,
        submitted_at: submission.submitted_at?.toISOString(),
        total_score: submission.total_score ? parseFloat(submission.total_score.toString()) : null,
        status_id: submission.status_id,
        answers: submission.assignment_answers.map(answer => ({
          question_id: answer.question_id,
          answer_text: answer.answer_text,
          selected_option_id: answer.selected_option_id,
          points_earned: answer.points_earned ? parseFloat(answer.points_earned.toString()) : null,
          feedback: answer.feedback,
        })),
      })),
    };

    return NextResponse.json({
      success: true,
      data: transformedAssignment,
    });
  } catch (error) {
    console.error('Error fetching assignment:', error);
    return NextResponse.json(
      { error: 'Failed to fetch assignment', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

// POST /api/courses/[code]/sessions/[sessionId]/assignments/[assignmentId]/submit
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ code: string; sessionId: string; assignmentId: string }> }
) {
  try {
    const { assignmentId: assignmentIdParam } = await params;
    const assignmentId = parseInt(assignmentIdParam);
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