import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@/lib/generated/prisma';

const prisma = new PrismaClient();

// GET /api/courses/[code]/sessions/[sessionId]/assignments
export async function GET(request: NextRequest, { params }: { params: { code: string; sessionId: string } }) {
  try {
    const sessionId = parseInt(params.sessionId);
    if (isNaN(sessionId)) {
      return NextResponse.json({ error: 'Invalid session ID' }, { status: 400 });
    }

    const assignments = await prisma.assignments.findMany({
      where: {
        session_id: sessionId,
      },
      include: {
        sessions: {
          select: {
            id: true,
            title: true,
            description: true,
            session_number: true,
          },
        },
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
          },
        },
        enumeration: true, // assignment type
      },
      orderBy: { created_date: 'desc' },
    });

    // Transform the data to match the expected format
    const transformedAssignments = assignments.map(assignment => ({
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
      session_id: assignment.session_id,
      session_title: assignment.sessions?.title,
      session_description: assignment.sessions?.description,
      session_number: assignment.sessions?.session_number,
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
      })),
    }));

    return NextResponse.json({
      success: true,
      data: transformedAssignments,
    });
  } catch (error) {
    console.error('Error fetching assignments:', error);
    return NextResponse.json(
      { error: 'Failed to fetch assignments', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

// POST /api/courses/[code]/sessions/[sessionId]/assignments
export async function POST(request: NextRequest, { params }: { params: { code: string; sessionId: string } }) {
  try {
    const sessionId = parseInt(params.sessionId);
    if (isNaN(sessionId)) {
      return NextResponse.json({ error: 'Invalid session ID' }, { status: 400 });
    }

    const body = await request.json();
    const {
      assignment_type_id,
      title,
      description,
      instructions,
      total_points,
      due_date,
      time_limit,
      attempts_allowed,
      show_results,
      is_published,
      created_by,
      questions,
    } = body;

    // Validate required fields
    if (!title || !assignment_type_id || !created_by) {
      return NextResponse.json(
        { error: 'Missing required fields: title, assignment_type_id, created_by' },
        { status: 400 }
      );
    }

    // Create assignment with questions in a transaction
    const result = await prisma.$transaction(async tx => {
      // Create the assignment
      const assignment = await tx.assignments.create({
        data: {
          session_id: sessionId,
          assignment_type_id: parseInt(assignment_type_id),
          title,
          description: description || null,
          instructions: instructions || null,
          total_points: parseInt(total_points) || 100,
          due_date: due_date ? new Date(due_date) : null,
          time_limit: time_limit ? parseInt(time_limit) : null,
          attempts_allowed: parseInt(attempts_allowed) || 1,
          show_results: Boolean(show_results),
          is_published: Boolean(is_published),
          created_by: parseInt(created_by),
        },
      });

      // Create questions if provided
      if (questions && Array.isArray(questions)) {
        for (const question of questions) {
          const createdQuestion = await tx.assignment_questions.create({
            data: {
              assignment_id: assignment.id,
              question_type_id: parseInt(question.question_type_id),
              question_text: question.question_text,
              points: parseInt(question.points) || 1,
              order_number: question.order_number || 1,
              required: Boolean(question.required),
            },
          });

          // Create options if provided
          if (question.options && Array.isArray(question.options)) {
            for (const option of question.options) {
              await tx.assignment_question_options.create({
                data: {
                  question_id: createdQuestion.id,
                  option_text: option.option_text,
                  is_correct: Boolean(option.is_correct),
                  order_number: option.order_number || 1,
                },
              });
            }
          }
        }
      }

      return assignment;
    });

    return NextResponse.json({
      success: true,
      data: result,
      message: 'Assignment created successfully',
    });
  } catch (error) {
    console.error('Error creating assignment:', error);
    return NextResponse.json(
      { error: 'Failed to create assignment', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
