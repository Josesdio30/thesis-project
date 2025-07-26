import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/auth';
import { prisma } from '@/lib/prisma';

export async function POST(request: NextRequest) {
  try {
    // Get session for authentication
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    // Check if user is admin
    const userDetails = await prisma.app_user.findUnique({
      where: { id: parseInt(session.user.id) },
      include: {
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

    const isAdmin = userDetails.app_user_role?.some(
      role => role.enumeration?.name === 'ADMIN' && role.is_active
    );

    if (!isAdmin) {
      return NextResponse.json({ success: false, error: 'Admin access required' }, { status: 403 });
    }

    const body = await request.json();
    const {
      title,
      description,
      startTime,
      endTime,
      date,
      courseCode,
      teacherId,
      classId,
      sessionNumber
    } = body;

    // Validate required fields
    if (!title || !startTime || !endTime || !date || !courseCode || !teacherId || !classId || !sessionNumber) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Parse and validate date/time
    const sessionDate = new Date(date);
    const startDateTime = new Date(`${date}T${startTime}`);
    const endDateTime = new Date(`${date}T${endTime}`);

    if (startDateTime >= endDateTime) {
      return NextResponse.json(
        { success: false, error: 'End time must be after start time' },
        { status: 400 }
      );
    }

    // Check if teacher exists
    const teacher = await prisma.app_user.findUnique({
      where: { id: parseInt(teacherId) },
      include: {
        teacher_details: true,
      },
    });

    if (!teacher || !teacher.teacher_details) {
      return NextResponse.json(
        { success: false, error: 'Teacher not found' },
        { status: 404 }
      );
    }

    // Check if class exists
    const classData = await prisma.classes.findUnique({
      where: { id: parseInt(classId) },
    });

    if (!classData) {
      return NextResponse.json(
        { success: false, error: 'Class not found' },
        { status: 404 }
      );
    }

    // Check if course exists
    const course = await prisma.courses.findUnique({
      where: { course_code: courseCode },
    });

    if (!course) {
      return NextResponse.json(
        { success: false, error: 'Course not found' },
        { status: 404 }
      );
    }

    // Check if class_course exists or create it
    let classCourse = await prisma.class_courses.findFirst({
      where: {
        course_id: course.id,
        class_id: parseInt(classId),
        is_active: true,
      },
    });

    if (!classCourse) {
      try {
        // Create new class_course
        classCourse = await prisma.class_courses.create({
          data: {
            course_id: course.id,
            class_id: parseInt(classId),
            teacher_id: parseInt(teacherId),
            start_date: new Date(),
            end_date: new Date(new Date().setFullYear(new Date().getFullYear() + 1)),
            is_active: true,
          },
        });
      } catch (err: any) {
        // Jika error duplikat (P2002), ambil data yang sudah ada
        if (err.code === 'P2002') {
          classCourse = await prisma.class_courses.findFirst({
            where: {
              course_id: course.id,
              class_id: parseInt(classId),
              is_active: true,
            },
          });
        } else {
          throw err;
        }
      }
    }

    // Pastikan classCourse tidak null
    if (!classCourse) {
      return NextResponse.json(
        { success: false, error: 'Gagal mendapatkan atau membuat class_courses' },
        { status: 500 }
      );
    }

    // Create session
    const newSession = await prisma.sessions.create({
      data: {
        title,
        description: description || '',
        start_time: startDateTime,
        end_time: endDateTime,
        session_number: parseInt(sessionNumber),
        class_course_id: classCourse.id,
        is_completed: false,
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        id: newSession.id,
        title: newSession.title,
        description: newSession.description,
        start_time: newSession.start_time,
        end_time: newSession.end_time,
        session_number: newSession.session_number,
        class_course_id: newSession.class_course_id,
        is_completed: newSession.is_completed,
      },
      message: 'Session created successfully',
    });

  } catch (error) {
    console.error('Error creating session:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Internal server error',
        message: 'Failed to create session',
      },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    // Get session for authentication
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    // Check if user is admin
    const userDetails = await prisma.app_user.findUnique({
      where: { id: parseInt(session.user.id) },
      include: {
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

    const isAdmin = userDetails.app_user_role?.some(
      role => role.enumeration?.name === 'ADMIN' && role.is_active
    );

    if (!isAdmin) {
      return NextResponse.json({ success: false, error: 'Admin access required' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const dateParam = searchParams.get('date');

    let whereClause: any = {};

    if (dateParam) {
      const [year, month, day] = dateParam.split('-').map(Number);
      const targetDate = new Date(year, month - 1, day);

      const startOfDay = new Date(targetDate);
      startOfDay.setHours(0, 0, 0, 0);

      const endOfDay = new Date(targetDate);
      endOfDay.setHours(23, 59, 59, 999);

      whereClause.start_time = {
        gte: startOfDay,
        lte: endOfDay,
      };
    }

    const sessions = await prisma.sessions.findMany({
      where: whereClause,
      include: {
        class_courses: {
          include: {
            courses: true,
            classes: true,
            app_user: {
              include: {
                user_profile: true,
              },
            },
          },
        },
      },
      orderBy: {
        start_time: 'asc',
      },
    });

    const sessionData = sessions.map(session => ({
      id: session.id,
      title: session.title,
      description: session.description,
      start_time: session.start_time,
      end_time: session.end_time,
      session_number: session.session_number,
      is_completed: session.is_completed,
      course_code: session.class_courses?.courses?.course_code,
      course_name: session.class_courses?.courses?.course_name,
      class_name: session.class_courses?.classes?.class_name,
      teacher_name: session.class_courses?.app_user?.nama_lengkap,
    }));

    return NextResponse.json({
      success: true,
      data: sessionData,
    });

  } catch (error) {
    console.error('Error fetching sessions:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Internal server error',
        message: 'Failed to fetch sessions',
      },
      { status: 500 }
    );
  }
} 