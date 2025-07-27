import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@/lib/generated/prisma';

const prisma = new PrismaClient();

// GET /api/courses/[code]/assignments - Get all assignments for a course
export async function GET(request: NextRequest, { params }: { params: { code: string } }) {
  try {
    const { code } = await params;
    const courseCode = code;

    // Get the course with all its sessions and assignments
    const courseData = await prisma.courses.findUnique({
      where: {
        course_code: courseCode,
      },
      include: {
        class_courses: {
          include: {
            sessions: {
              include: {
                assignments: {
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
                      },
                    },
                    enumeration: true, // assignment type
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

    // Flatten all assignments from all sessions
    const allAssignments = [];
    for (const classCourse of courseData.class_courses) {
      for (const session of classCourse.sessions) {
        for (const assignment of session.assignments) {
          // Transform the assignment data
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
          };

          allAssignments.push(transformedAssignment);
        }
      }
    }

    // Sort assignments by creation date (newest first)
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
