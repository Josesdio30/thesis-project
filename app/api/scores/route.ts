import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/auth';
import { prisma } from '@/lib/prisma';

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = parseInt(session.user.id);
    const isTeacher = session.user.role === 'TEACHER' || session.user.role === 'GURU';

    console.log('Fetching scores for user:', userId, 'isTeacher:', isTeacher);

    // Simple test query first
    const totalSubmissions = await prisma.assignment_submissions.count();
    console.log('Total submissions in database:', totalSubmissions);

    if (isTeacher) {
      // For teachers: Get all submissions for assignments they created
      const submissions = await prisma.assignment_submissions.findMany({
        where: {
          assignments: {
            created_by: userId,
          },
        },
        include: {
          assignments: {
            select: {
              id: true,
              title: true,
              description: true,
              total_points: true,
              due_date: true,
              assignment_type_id: true,
              session_id: true,
              sessions: {
                select: {
                  title: true,
                  session_number: true,
                  class_courses: {
                    select: {
                      courses: {
                        select: {
                          course_code: true,
                          course_name: true,
                        },
                      },
                      classes: {
                        select: {
                          class_name: true,
                        },
                      },
                    },
                  },
                },
              },
              enumeration: {
                select: {
                  name: true,
                },
              },
            },
          },
          app_user_assignment_submissions_student_idToapp_user: {
            select: {
              id: true,
              nama_lengkap: true,
              user_name: true,
            },
          },
          enumeration: {
            select: {
              name: true,
            },
          },
        },
        orderBy: [
          { submitted_at: 'desc' },
          { created_date: 'desc' },
        ],
      });

      console.log('Found submissions for teacher:', submissions.length);

      const formattedSubmissions = submissions.map(submission => {
        // Safely get course and class information
        const classCourse = submission.assignments.sessions.class_courses;
        const course = classCourse?.courses;
        const classInfo = classCourse?.classes;

        return {
          id: submission.id,
          assignment_id: submission.assignment_id,
          assignment_title: submission.assignments.title,
          assignment_description: submission.assignments.description,
          assignment_total_points: submission.assignments.total_points,
          assignment_due_date: submission.assignments.due_date?.toISOString(),
          assignment_type: submission.assignments.enumeration.name,
          course_code: course?.course_code || 'N/A',
          course_name: course?.course_name || 'Unknown Course',
          class_name: classInfo?.class_name || 'Unknown Class',
          session_title: submission.assignments.sessions.title,
          session_number: submission.assignments.sessions.session_number,
          student: {
            id: submission.app_user_assignment_submissions_student_idToapp_user.id,
            nama_lengkap: submission.app_user_assignment_submissions_student_idToapp_user.nama_lengkap,
            user_name: submission.app_user_assignment_submissions_student_idToapp_user.user_name,
          },
          attempt_number: submission.attempt_number,
          started_at: submission.started_at?.toISOString(),
          submitted_at: submission.submitted_at?.toISOString(),
          total_score: submission.total_score ? parseFloat(submission.total_score.toString()) : null,
          status: submission.enumeration.name,
          status_id: submission.status_id,
          feedback: submission.feedback,
          graded_by: submission.graded_by,
          graded_at: submission.graded_at?.toISOString(),
        };
      });

      return NextResponse.json({
        success: true,
        data: formattedSubmissions,
      });
    } else {
      // For students: Get their own submissions
      const submissions = await prisma.assignment_submissions.findMany({
        where: {
          student_id: userId,
        },
        include: {
          assignments: {
            select: {
              id: true,
              title: true,
              description: true,
              total_points: true,
              due_date: true,
              assignment_type_id: true,
              session_id: true,
              sessions: {
                select: {
                  title: true,
                  session_number: true,
                  class_courses: {
                    select: {
                      courses: {
                        select: {
                          course_code: true,
                          course_name: true,
                        },
                      },
                      classes: {
                        select: {
                          class_name: true,
                        },
                      },
                    },
                  },
                },
              },
              enumeration: {
                select: {
                  name: true,
                },
              },
            },
          },
          enumeration: {
            select: {
              name: true,
            },
          },
        },
        orderBy: [
          { submitted_at: 'desc' },
          { created_date: 'desc' },
        ],
      });

      console.log('Found submissions for student:', submissions.length);

      const formattedSubmissions = submissions.map(submission => {
        // Safely get course and class information
        const classCourse = submission.assignments.sessions.class_courses;
        const course = classCourse?.courses;
        const classInfo = classCourse?.classes;

        return {
          id: submission.id,
          assignment_id: submission.assignment_id,
          assignment_title: submission.assignments.title,
          assignment_description: submission.assignments.description,
          assignment_total_points: submission.assignments.total_points,
          assignment_due_date: submission.assignments.due_date?.toISOString(),
          assignment_type: submission.assignments.enumeration.name,
          course_code: course?.course_code || 'N/A',
          course_name: course?.course_name || 'Unknown Course',
          class_name: classInfo?.class_name || 'Unknown Class',
          session_title: submission.assignments.sessions.title,
          session_number: submission.assignments.sessions.session_number,
          attempt_number: submission.attempt_number,
          started_at: submission.started_at?.toISOString(),
          submitted_at: submission.submitted_at?.toISOString(),
          total_score: submission.total_score ? parseFloat(submission.total_score.toString()) : null,
          status: submission.enumeration.name,
          status_id: submission.status_id,
          feedback: submission.feedback,
          graded_by: submission.graded_by,
          graded_at: submission.graded_at?.toISOString(),
        };
      });

      return NextResponse.json({
        success: true,
        data: formattedSubmissions,
      });
    }
  } catch (error) {
    console.error('Error fetching scores:', error);
    return NextResponse.json(
      { error: 'Failed to fetch scores', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
