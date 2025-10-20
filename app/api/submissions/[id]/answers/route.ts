import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/auth';
import prisma from '@/lib/prisma';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const submissionId = parseInt(id);

    if (isNaN(submissionId)) {
      return NextResponse.json({ error: 'Invalid submission ID' }, { status: 400 });
    }

    // First, verify that the user has permission to view this submission
    // Either they are the student who submitted it, or they are a teacher for the course
    const submission = await prisma.assignment_submissions.findUnique({
      where: { id: submissionId },
      include: {
        assignments: {
          include: {
            sessions: {
              include: {
                class_courses: {
                  include: {
                    courses: true,
                    classes: true,
                  },
                },
              },
            },
          },
        },
        app_user_assignment_submissions_student_idToapp_user: true,
      },
    });

    if (!submission) {
      return NextResponse.json({ error: 'Submission not found' }, { status: 404 });
    }

    const userRole = session.user.role;
    const isTeacher = userRole === 'TEACHER' || userRole === 'ADMIN';
    const isOwnSubmission = submission.student_id === parseInt(session.user.id);

    // Check permissions
    if (!isTeacher && !isOwnSubmission) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // If teacher, verify they teach this course
    if (isTeacher && !isOwnSubmission) {
      const teacherCourse = await prisma.class_courses.findFirst({
        where: {
          course_id: submission.assignments.sessions.class_courses?.course_id,
          class_id: submission.assignments.sessions.class_courses?.class_id,
          teacher_id: parseInt(session.user.id),
        },
      });

      if (!teacherCourse) {
        return NextResponse.json({ error: 'Forbidden - Not your course' }, { status: 403 });
      }
    }

    // Fetch the submission answers
    const answers = await prisma.assignment_answers.findMany({
      where: {
        submission_id: submissionId,
      },
      include: {
        assignment_questions: {
          include: {
            assignment_question_options: true,
          },
        },
        assignment_question_options: true,
      },
      orderBy: {
        assignment_questions: {
          order_number: 'asc',
        },
      },
    });

    // Format the response
    const formattedAnswers = answers.map((answer: any) => ({
      id: answer.id,
      question_id: answer.question_id,
      selected_option_id: answer.selected_option_id,
      answer_text: answer.answer_text,
      points_earned: answer.points_earned,
      question: {
        id: answer.assignment_questions.id,
        question_text: answer.assignment_questions.question_text,
        points: answer.assignment_questions.points,
        order_number: answer.assignment_questions.order_number,
        options: answer.assignment_questions.assignment_question_options.map((option: any) => ({
          id: option.id,
          option_text: option.option_text,
          // Only include is_correct for teachers/admins
          ...(isTeacher && { is_correct: option.is_correct }),
          order_number: option.order_number,
        })),
      },
      selected_option: answer.assignment_question_options
        ? {
            id: answer.assignment_question_options.id,
            option_text: answer.assignment_question_options.option_text,
            // Only include is_correct for teachers/admins
            ...(isTeacher && { is_correct: answer.assignment_question_options.is_correct }),
            order_number: answer.assignment_question_options.order_number,
          }
        : null,
    }));

    return NextResponse.json(formattedAnswers);
  } catch (error) {
    console.error('Error fetching submission answers:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}