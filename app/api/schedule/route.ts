import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/auth';
import { prisma } from '@/lib/prisma';
import { format } from 'date-fns';
import { tr } from 'date-fns/locale';

export async function GET(request: NextRequest) {
  try {
    // Get session for authentication
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    const { searchParams } = new URL(request.url);
    const dateParam = searchParams.get('date'); // Format: YYYY-MM-DD
    const monthParam = searchParams.get('month'); // Format: YYYY-MM
    const userId = parseInt(session.user.id);

    let whereClause: any = {};

    if (dateParam) {
      const [year, month, day] = dateParam.split('-').map(Number);
      const targetDate = new Date(year, month - 1, day); // month is 0-indexed

      const startOfDay = new Date(targetDate);
      startOfDay.setHours(0, 0, 0, 0);

      const endOfDay = new Date(targetDate);
      endOfDay.setHours(23, 59, 59, 999);

      whereClause.start_time = {
        gte: startOfDay,
        lte: endOfDay,
      };
    } else if (monthParam) {
      const [year, month] = monthParam.split('-').map(Number);

      const startOfMonth = new Date(year, month - 1, 1); // month is 0-indexed
      startOfMonth.setHours(0, 0, 0, 0);

      const endOfMonth = new Date(year, month, 0); // Last day of the month
      endOfMonth.setHours(23, 59, 59, 999);

      whereClause.start_time = {
        gte: startOfMonth,
        lte: endOfMonth,
      };
    } else {
      const now = new Date();
      const currentYear = now.getFullYear();
      const currentMonth = now.getMonth();

      const startOfMonth = new Date(currentYear, currentMonth, 1);
      startOfMonth.setHours(0, 0, 0, 0);

      const endOfMonth = new Date(currentYear, currentMonth + 1, 0);
      endOfMonth.setHours(23, 59, 59, 999);

      whereClause.start_time = {
        gte: startOfMonth,
        lte: endOfMonth,
      };
    }

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

    console.log('User Details Debug:', {
      userId: userDetails.id,
      hasStudentDetails: !!userDetails.student_details,
      hasTeacherDetails: !!userDetails.teacher_details,
      roles: userDetails.app_user_role?.map(role => ({
        roleName: role.enumeration?.name,
        isActive: role.is_active,
      })),
    });
    let sessions: any[] = [];

    const isStudent =
      userDetails.student_details !== null ||
      userDetails.app_user_role?.some(role => role.enumeration?.name === 'STUDENT' && role.is_active);
    const isTeacher =
      userDetails.teacher_details !== null ||
      userDetails.app_user_role?.some(role => role.enumeration?.name === 'TEACHER' && role.is_active);

    console.log('Role Determination:', {
      isStudent,
      isTeacher,
      finalRole: isStudent ? 'student' : isTeacher ? 'teacher' : 'admin',
    });

    if (isStudent) {
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
                      classes: true,
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

      sessions = enrollments.flatMap(enrollment => enrollment.class_courses?.sessions || []);
    } else if (isTeacher) {
      const teacherCourses = await prisma.class_courses.findMany({
        where: { teacher_id: userId },
        include: {
          sessions: {
            where: whereClause,
            include: {
              class_courses: {
                include: {
                  courses: true,
                  classes: true,
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

      sessions = teacherCourses.flatMap(course => course.sessions || []);
    }
    const scheduleData = sessions.map(session => ({
      id: session.id,
      subject: session.class_courses?.courses?.course_name || 'Unknown Course',
      teacher: session.class_courses?.app_user?.nama_lengkap || 'Unknown Teacher',
      class_name: session.class_courses?.classes?.class_name || 'Unknown Class',
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

    let allDatesWithSchedule: string[] = [];

    let monthWhereClause: any = {};
    if (dateParam) {
      const [year, month, day] = dateParam.split('-').map(Number);
      const startOfMonth = new Date(year, month - 1, 1);
      startOfMonth.setHours(0, 0, 0, 0);
      const endOfMonth = new Date(year, month, 0);
      endOfMonth.setHours(23, 59, 59, 999);
      monthWhereClause.start_time = { gte: startOfMonth, lte: endOfMonth };
    } else if (monthParam) {
      const [year, month] = monthParam.split('-').map(Number);
      const startOfMonth = new Date(year, month - 1, 1);
      startOfMonth.setHours(0, 0, 0, 0);
      const endOfMonth = new Date(year, month, 0);
      endOfMonth.setHours(23, 59, 59, 999);
      monthWhereClause.start_time = { gte: startOfMonth, lte: endOfMonth };
    } else {
      const now = new Date();
      const currentYear = now.getFullYear();
      const currentMonth = now.getMonth();
      const startOfMonth = new Date(currentYear, currentMonth, 1);
      startOfMonth.setHours(0, 0, 0, 0);
      const endOfMonth = new Date(currentYear, currentMonth + 1, 0);
      endOfMonth.setHours(23, 59, 59, 999);
      monthWhereClause.start_time = { gte: startOfMonth, lte: endOfMonth };
    }

    let allSessions: any[] = [];

    if (isStudent) {
      const allEnrollments = await prisma.enrollments.findMany({
        where: { student_id: userId },
        include: {
          class_courses: {
            include: {
              sessions: {
                where: monthWhereClause,
                include: {
                  class_courses: {
                    include: {
                      courses: true,
                      classes: true,
                      app_user: {
                        include: {
                          user_profile: true,
                          teacher_details: true,
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      });
      allSessions = allEnrollments.flatMap(enrollment => enrollment.class_courses?.sessions || []);
    } else if (isTeacher) {
      const allTeacherCourses = await prisma.class_courses.findMany({
        where: { teacher_id: userId },
        include: {
          sessions: {
            where: monthWhereClause,
            include: {
              class_courses: {
                include: {
                  courses: true,
                  classes: true,
                  app_user: {
                    include: {
                      user_profile: true,
                      teacher_details: true,
                    },
                  },
                },
              },
            },
          },
        },
      });
      allSessions = allTeacherCourses.flatMap(course => course.sessions || []);
    }
    const uniqueDates = new Set(allSessions.map(session => format(new Date(session.start_time), 'yyyy-MM-dd')));
    allDatesWithSchedule = Array.from(uniqueDates);

    console.log('Calendar Dots Debug:', {
      dateParam,
      monthParam,
      monthWhereClause: monthWhereClause.start_time
        ? {
            gte: monthWhereClause.start_time.gte.toISOString(),
            lte: monthWhereClause.start_time.lte.toISOString(),
          }
        : 'none',
      allSessionsCount: allSessions.length,
      allDatesWithSchedule,
    });
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
          dates_with_schedule: allDatesWithSchedule,
          user_role: isStudent ? 'student' : isTeacher ? 'teacher' : 'admin',
        },
      });
    }

    return NextResponse.json({
      success: true,
      data: {
        schedule: scheduleData,
        date: dateParam,
        dates_with_schedule: allDatesWithSchedule,
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
