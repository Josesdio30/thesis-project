import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/auth';
import { prisma } from '@/lib/prisma';

// Helper function to check admin access
async function checkAdminAccess(session: any) {
  if (!session?.user?.id) {
    return { isAdmin: false, error: 'Unauthorized' };
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
    return { isAdmin: false, error: 'User not found' };
  }

  const isAdmin = userDetails.app_user_role?.some(
    role => role.enumeration?.name === 'ADMIN' && role.is_active
  );

  if (!isAdmin) {
    return { isAdmin: false, error: 'Admin access required' };
  }

  return { isAdmin: true };
}

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const { isAdmin, error } = await checkAdminAccess(session);
    
    if (!isAdmin) {
      return NextResponse.json({ success: false, error }, { status: 401 });
    }

    // Get all enrollments with related data
    const enrollments = await prisma.enrollments.findMany({
      include: {
        app_user: {
          include: {
            student_details: true,
          },
        },
        class_courses: {
          include: {
            classes: true,
            courses: true,
            app_user: {
              include: {
                teacher_details: true,
              },
            },
          },
        },
      },
      orderBy: {
        enrollment_date: 'desc',
      },
    });

    const enrollmentData = enrollments.map(enrollment => ({
      id: enrollment.id,
      student_id: enrollment.student_id,
      student_name: enrollment.app_user?.nama_lengkap,
      student_nis: enrollment.app_user?.student_details?.nis,
      class_course_id: enrollment.class_course_id,
      class_name: enrollment.class_courses?.classes?.class_name,
      course_name: enrollment.class_courses?.courses?.course_name,
      teacher_name: enrollment.class_courses?.app_user?.nama_lengkap,
      roll_number: enrollment.roll_number,
      enrollment_date: enrollment.enrollment_date,
    }));

    return NextResponse.json({
      success: true,
      data: {
        enrollments: enrollmentData,
      },
    });

  } catch (error) {
    console.error('Error fetching enrollments:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Internal server error',
        message: 'Failed to fetch enrollments',
      },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const { isAdmin, error } = await checkAdminAccess(session);
    
    if (!isAdmin) {
      return NextResponse.json({ success: false, error }, { status: 401 });
    }

    const body = await request.json();
    const { student_id, class_course_id, roll_number } = body;

    // Validate required fields
    if (!student_id || !class_course_id) {
      return NextResponse.json(
        { success: false, error: 'Student ID dan Class Course ID harus diisi' },
        { status: 400 }
      );
    }

    // Check if student exists and is a student
    const student = await prisma.app_user.findUnique({
      where: { id: parseInt(student_id) },
      include: {
        student_details: true,
        app_user_role: {
          include: {
            enumeration: true,
          },
        },
      },
    });

    if (!student) {
      return NextResponse.json(
        { success: false, error: 'Student tidak ditemukan' },
        { status: 404 }
      );
    }

    const isStudent = student.app_user_role?.some(
      role => role.enumeration?.name === 'STUDENT' && role.is_active
    );

    if (!isStudent) {
      return NextResponse.json(
        { success: false, error: 'User bukan student' },
        { status: 400 }
      );
    }

    // Check if class course exists
    const classCourse = await prisma.class_courses.findUnique({
      where: { id: parseInt(class_course_id) },
      include: {
        classes: true,
        courses: true,
      },
    });

    if (!classCourse) {
      return NextResponse.json(
        { success: false, error: 'Class course tidak ditemukan' },
        { status: 404 }
      );
    }

    // Check if enrollment already exists
    const existingEnrollment = await prisma.enrollments.findFirst({
      where: {
        student_id: parseInt(student_id),
        class_course_id: parseInt(class_course_id),
      },
    });

    if (existingEnrollment) {
      return NextResponse.json(
        { success: false, error: 'Student sudah ter-enroll di class ini' },
        { status: 400 }
      );
    }

    // Create enrollment
    const newEnrollment = await prisma.enrollments.create({
      data: {
        student_id: parseInt(student_id),
        class_course_id: parseInt(class_course_id),
        roll_number: roll_number || 1,
        enrollment_date: new Date(),
      },
      include: {
        app_user: {
          include: {
            student_details: true,
          },
        },
        class_courses: {
          include: {
            classes: true,
            courses: true,
            app_user: {
              include: {
                teacher_details: true,
              },
            },
          },
        },
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        enrollment: {
          id: newEnrollment.id,
          student_id: newEnrollment.student_id,
          student_name: newEnrollment.app_user?.nama_lengkap,
          student_nis: newEnrollment.app_user?.student_details?.nis,
          class_course_id: newEnrollment.class_course_id,
          class_name: newEnrollment.class_courses?.classes?.class_name,
          course_name: newEnrollment.class_courses?.courses?.course_name,
          teacher_name: newEnrollment.class_courses?.app_user?.nama_lengkap,
          roll_number: newEnrollment.roll_number,
          enrollment_date: newEnrollment.enrollment_date,
        },
      },
      message: 'Student berhasil di-enroll ke class',
    });

  } catch (error) {
    console.error('Error creating enrollment:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Internal server error',
        message: 'Failed to create enrollment',
      },
      { status: 500 }
    );
  }
} 