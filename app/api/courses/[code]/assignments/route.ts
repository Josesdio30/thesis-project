import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/auth';
import {
  canManageCourse,
  forbiddenResponse,
  getSessionUser,
  isAdminRole,
  isStudentRole,
  isTeacherRole,
  unauthorizedResponse,
} from '@/lib/auth/course-access';
import { prisma } from '@/lib/prisma';

export async function GET(
  request: NextRequest, 
  { params }: { params: Promise<{ code: string }> }
) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { code } = await params;
    const courseCode = code;
    const isTeacher = session.user.role === 'TEACHER' || session.user.role === 'ADMIN';
    const user = await getSessionUser();
    if (!user) return unauthorizedResponse();
    if (!isAdminRole(user.role) && !isTeacherRole(user.role) && !isStudentRole(user.role)) return forbiddenResponse();

    const { code } = await params;
    const courseCode = code;
    // A course code can be offered to several classes. Scope the database read
    // to the caller's offerings, rather than granting access to the entire code.
    const offeringScope = isAdminRole(user.role)
      ? {}
      : isTeacherRole(user.role)
        ? { teacher_id: user.id }
        : { enrollments: { some: { student_id: user.id } } };

    const courseData = await prisma.courses.findUnique({
      where: {
        course_code: courseCode,
      },
      include: {
        class_courses: {
          include: {
          where: offeringScope,
          include: {
            enrollments: { where: { student_id: user.id }, select: { id: true } },
            sessions: {
              include: {
                assignments: {
                  include: {
                    assignment_questions: {
                      orderBy: { order_number: 'asc' },
                      include: {
                        enumeration: true,
                        assignment_question_options: {
                          orderBy: { order_number: 'asc' },
                        },
                      },
                    },
                    assignment_submissions: {
                      where: isStudentRole(user.role) ? { student_id: user.id } : {},
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
                    enumeration: true,
                  },
                  orderBy: { created_date: 'desc' },
                },
              },
            },
          },
        },
      },
    });

    if (!courseData) {
      return NextResponse.json({ error: 'Course not found' }, { status: 404 });
    }

    const allAssignments = [];
    for (const classCourse of courseData.class_courses) {
    const allowedOfferings = courseData.class_courses.filter(classCourse =>
      canManageCourse(user, [classCourse.teacher_id]) ||
      (isStudentRole(user.role) && classCourse.enrollments.length > 0)
    );
    if (!isAdminRole(user.role) && allowedOfferings.length === 0) return forbiddenResponse();

    const allAssignments = [];
    for (const classCourse of allowedOfferings) {
      const isManager = canManageCourse(user, [classCourse.teacher_id]);
      for (const session of classCourse.sessions) {
        for (const assignment of session.assignments) {
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
            session_id: session.id,
            session_title: session.title,
            session_description: session.description,
            session_number: session.session_number,
            questions: assignment.assignment_questions.map(question => ({
              id: question.id,
              question_text: question.question_text,
              points: question.points,
              question_type_id: question.question_type_id,
              question_type: question.enumeration.name,
              order_number: question.order_number,
              required: question.required,
              options: question.assignment_question_options.map(option => ({
                id: option.id,
                option_text: option.option_text,
                ...(isTeacher && { is_correct: option.is_correct }),
                order_number: option.order_number,
              })),
            })),
            submissions: assignment.assignment_submissions.map(submission => ({
                ...(isManager && { is_correct: option.is_correct }),
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
          };

          allAssignments.push(transformedAssignment);
        }
      }
    }

    allAssignments.sort((a, b) => {
      const dateA = a.created_date ? new Date(a.created_date).getTime() : 0;
      const dateB = b.created_date ? new Date(b.created_date).getTime() : 0;
      return dateB - dateA;
    });

    return NextResponse.json({
      success: true,
      data: allAssignments,
    });
  } catch (error) {
    console.error('Error fetching course assignments:', error);
    return NextResponse.json(
      { error: 'Failed to fetch assignments', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

      { error: 'Failed to fetch assignments' },
      { status: 500 }
    );
  }
}
