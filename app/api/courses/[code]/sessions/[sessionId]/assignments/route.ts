import { NextRequest, NextResponse } from 'next/server';
import {
  canManageCourse,
  requireCourseManager,
  requireSessionMember,
  teacherIdsForSession,
} from '@/lib/auth/course-access';
import { prisma } from '@/lib/prisma';

// GET /api/courses/[code]/sessions/[sessionId]/assignments
export async function GET(request: NextRequest, { params }: { params: Promise<{ code: string; sessionId: string }> }) {
  try {
    const resolvedParams = await params;
    const sessionId = parseInt(resolvedParams.sessionId);
    if (isNaN(sessionId)) {
      return NextResponse.json({ error: 'Invalid session ID' }, { status: 400 });
    }

    // FR-ASG-5 / Q-07: same rules as the assignment detail route. Course members
    // may list; only the course teacher and admins see answer keys and every submission.
    const member = await requireSessionMember(sessionId, { courseCode: resolvedParams.code });
    if (!member.ok) return member.response;
    const user = member.user;
    const isManager = canManageCourse(user, await teacherIdsForSession(sessionId));

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
          ...(isManager ? { is_correct: option.is_correct } : {}),
          order_number: option.order_number,
        })),
      })),
      submissions: assignment.assignment_submissions
        .filter(submission => isManager || submission.student_id === user.id)
        .map(submission => ({
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
      { error: 'Failed to fetch assignments' },
      { status: 500 }
    );
  }
}

// POST /api/courses/[code]/sessions/[sessionId]/assignments
export async function POST(request: NextRequest, { params }: { params: Promise<{ code: string; sessionId: string }> }) {
  try {
    const resolvedParams = await params;
    const sessionId = parseInt(resolvedParams.sessionId);
    if (isNaN(sessionId)) {
      return NextResponse.json({ error: 'Invalid session ID' }, { status: 400 });
    }
    // Q-07: only the course teacher or an admin may create (and publish) assignments.
    const access = await requireCourseManager(() => teacherIdsForSession(sessionId));
    if (!access.ok) return access.response;

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
      questions,
    } = body;

    // Validate required fields. created_by is always the session user (Q-12); a body value is ignored.
    if (!title || !assignment_type_id) {
      return NextResponse.json({ error: 'Missing required fields: title, assignment_type_id' }, { status: 400 });
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
          created_by: access.user.id,
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
      { error: 'Failed to create assignment' },
      { status: 500 }
    );
  }
}
