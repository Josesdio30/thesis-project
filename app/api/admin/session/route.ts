import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/auth';
import { prisma } from '@/lib/prisma';

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

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
      role => role.enumeration?.name?.toLowerCase() === 'admin' && role.is_active
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

    if (!title || !startTime || !endTime || !date || !courseCode || !teacherId || !classId || !sessionNumber) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields' },
        { status: 400 }
      );
    }

    const sessionDate = new Date(date);
    const startDateTime = new Date(`${date}T${startTime}`);
    const endDateTime = new Date(`${date}T${endTime}`);

    if (startDateTime >= endDateTime) {
      return NextResponse.json(
        { success: false, error: 'End time must be after start time' },
        { status: 400 }
      );
    }

    const teacher = await prisma.app_user.findUnique({
      where: { id: parseInt(teacherId) },
      include: {
        teacher_details: true,
        app_user_role: {
          include: {
            enumeration: true,
          },
        },
      },
    });

    // Check if user exists and is a teacher (has teacher_details OR has teacher role)
    const isTeacher = teacher?.teacher_details !== null ||
      teacher?.app_user_role?.some(role =>
        role.enumeration?.name?.toLowerCase() === 'teacher' && role.is_active
      );

    if (!teacher || !isTeacher) {
      return NextResponse.json(
        { success: false, error: 'Teacher not found' },
        { status: 404 }
      );
    }

    const classData = await prisma.classes.findUnique({
      where: { id: parseInt(classId) },
    });

    if (!classData) {
      return NextResponse.json(
        { success: false, error: 'Class not found' },
        { status: 404 }
      );
    }

    const course = await prisma.courses.findUnique({
      where: { course_code: courseCode },
    });

    if (!course) {
      return NextResponse.json(
        { success: false, error: 'Course not found' },
        { status: 404 }
      );
    }

    let classCourse = await prisma.class_courses.findFirst({
      where: {
        course_id: course.id,
        class_id: parseInt(classId),
        is_active: true,
      },
    });

    if (!classCourse) {
      try {
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

    if (!classCourse) {
      return NextResponse.json(
        { success: false, error: 'Gagal mendapatkan atau membuat class_courses' },
        { status: 500 }
      );
    }

    if (classCourse.teacher_id !== parseInt(teacherId)) {
      classCourse = await prisma.class_courses.update({
        where: { id: classCourse.id },
        data: { teacher_id: parseInt(teacherId) },
      });
    }

    const allClassCoursesInClass = await prisma.class_courses.findMany({
      where: {
        class_id: parseInt(classId),
        is_active: true,
      },
      select: {
        id: true,
        enrollments: {
          select: {
            student_id: true,
          },
        },
      },
    });

    console.log('=== AUTO-ENROLLMENT DEBUG ===');
    console.log('Total class_courses found:', allClassCoursesInClass.length);

    const allStudentIds = new Set<number>();
    
    // 1. Fetch from direct class assignment in student_details
    const directClassStudents = await prisma.student_details.findMany({
      where: {
        class_id: parseInt(classId),
      },
      select: {
        user_id: true,
      },
    });
    directClassStudents.forEach(s => allStudentIds.add(s.user_id));

    // 2. Fetch from existing enrollments in the same class (backward compatibility)
    for (const cc of allClassCoursesInClass) {
      console.log(`Class course ${cc.id}: ${cc.enrollments.length} enrollments`);
      for (const enrollment of cc.enrollments) {
        if (enrollment.student_id) {
          allStudentIds.add(enrollment.student_id);
        }
      }
    }

    console.log('Unique students in class:', Array.from(allStudentIds));

    const studentsAlreadyEnrolled = await prisma.enrollments.findMany({
      where: {
        class_course_id: classCourse.id,
      },
      select: {
        student_id: true,
      },
    });

    const enrolledSet = new Set(
      studentsAlreadyEnrolled
        .map(e => e.student_id)
        .filter((id): id is number => id !== null)
    );

    console.log('Already enrolled in this class_course:', Array.from(enrolledSet));

    const studentsToEnroll = Array.from(allStudentIds).filter(
      studentId => !enrolledSet.has(studentId)
    );

    console.log('Students to auto-enroll:', studentsToEnroll);

    if (studentsToEnroll.length > 0) {
      const result = await prisma.enrollments.createMany({
        data: studentsToEnroll.map(studentId => ({
          student_id: studentId,
          class_course_id: classCourse.id,
          roll_number: 1,
          enrollment_date: new Date(),
        })),
        skipDuplicates: true,
      });
      console.log('Enrollments created:', result.count);
    } else {
      console.log('No students to enroll');
    }
    console.log('===========================');

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
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

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
      role => role.enumeration?.name?.toLowerCase() === 'admin' && role.is_active
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