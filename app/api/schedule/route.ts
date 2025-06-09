import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/auth';
import { prisma } from '@/lib/prisma';
import { format } from 'date-fns';

export async function GET(request: NextRequest) {
  try {
    // Get session for authentication
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const dateParam = searchParams.get('date'); // Format: YYYY-MM-DD
    const userId = parseInt(session.user.id);

    let whereClause: any = {};

    // If date is specified, filter by that date
    if (dateParam) {
      const targetDate = new Date(dateParam);
      const startOfDay = new Date(targetDate);
      startOfDay.setHours(0, 0, 0, 0);

      const endOfDay = new Date(targetDate);
      endOfDay.setHours(23, 59, 59, 999);

      whereClause.start_time = {
        gte: startOfDay,
        lte: endOfDay,
      };
    }

    // Check if user is a student or teacher to get appropriate schedule
    const userDetails = await prisma.app_user.findUnique({
      where: { id: userId },
      include: {
        student_details: true,
        teacher_details: true,
        app_user_role: {
          include: {
            enumeration: true,
          },
        },
      },
    });

    if (!userDetails) {
      return NextResponse.json({ success: false, error: 'User not found' }, { status: 404 });
    }

    let sessions: any[] = [];

    // Determine user role and fetch appropriate sessions
    const isStudent = userDetails.student_details !== null;
    const isTeacher = userDetails.teacher_details !== null;

    if (isStudent) {
      // Get sessions for courses the student is enrolled in
      const enrollments = await prisma.enrollments.findMany({
        where: { student_id: userId },
        include: {
          class_courses: {
            include: {
              sessions: {
                where: whereClause,
                include: {
                  class_courses: {
                    include: {
                      courses: true,
                      app_user: {
                        include: {
                          user_profile: true,
                          teacher_details: true,
                        },
                      },
                    },
                  },
                },
                orderBy: {
                  start_time: 'asc',
                },
              },
            },
          },
        },
      });

      // Flatten sessions from all enrollments
      sessions = enrollments.flatMap(enrollment => enrollment.class_courses?.sessions || []);
    } else if (isTeacher) {
      // Get sessions for courses the teacher teaches
      const teacherCourses = await prisma.class_courses.findMany({
        where: { teacher_id: userId },
        include: {
          sessions: {
            where: whereClause,
            include: {
              class_courses: {
                include: {
                  courses: true,
                  app_user: {
                    include: {
                      user_profile: true,
                      teacher_details: true,
                    },
                  },
                },
              },
            },
            orderBy: {
              start_time: 'asc',
            },
          },
        },
      });

      // Flatten sessions from all courses
      sessions = teacherCourses.flatMap(course => course.sessions || []);
    }

    // Transform sessions to schedule format
    const scheduleData = sessions.map(session => ({
      id: session.id,
      subject: session.class_courses?.courses?.course_name || 'Unknown Course',
      teacher: session.class_courses?.app_user?.nama_lengkap || 'Unknown Teacher',
      session_title: session.title,
      description: session.description,
      start_time: session.start_time,
      end_time: session.end_time,
      time: `${format(new Date(session.start_time), 'HH:mm')} - ${format(new Date(session.end_time), 'HH:mm')}`,
      date: format(new Date(session.start_time), 'yyyy-MM-dd'),
      course_code: session.class_courses?.courses?.course_code,
      session_number: session.session_number,
      is_completed: session.is_completed,
    }));

    // If no date specified, group by date
    if (!dateParam) {
      const groupedSchedule: Record<string, typeof scheduleData> = {};

      scheduleData.forEach(item => {
        if (!groupedSchedule[item.date]) {
          groupedSchedule[item.date] = [];
        }
        groupedSchedule[item.date].push(item);
      });

      return NextResponse.json({
        success: true,
        data: {
          schedule: groupedSchedule,
          dates_with_schedule: Object.keys(groupedSchedule),
          user_role: isStudent ? 'student' : isTeacher ? 'teacher' : 'admin',
        },
      });
    }

    // Return schedule for specific date
    return NextResponse.json({
      success: true,
      data: {
        schedule: scheduleData,
        date: dateParam,
        user_role: isStudent ? 'student' : isTeacher ? 'teacher' : 'admin',
      },
    });
  } catch (error) {
    console.error('Error fetching schedule:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Internal server error',
        message: 'Failed to fetch schedule data',
      },
      { status: 500 }
    );
  }
}
