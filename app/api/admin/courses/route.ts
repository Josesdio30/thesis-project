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

    // Get all teachers
    const teachers = await prisma.app_user.findMany({
      where: {
        teacher_details: {
          isNot: null,
        },
        is_active: true,
        is_deleted: false,
      },
      include: {
        teacher_details: true,
        user_profile: true,
      },
      orderBy: {
        nama_lengkap: 'asc',
      },
    });

    // Get all classes
    const classes = await prisma.classes.findMany({
      where: {
        academic_years: {
          is_active: true,
        },
      },
      include: {
        academic_years: true,
      },
      orderBy: {
        class_name: 'asc',
      },
    });

    // Get all courses
    const courses = await prisma.courses.findMany({
      orderBy: {
        course_name: 'asc',
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        teachers: teachers.map(teacher => ({
          id: teacher.id,
          name: teacher.nama_lengkap,
          kode_guru: teacher.teacher_details?.kode_guru,
          niy: teacher.teacher_details?.niy,
        })),
        classes: classes.map(classData => ({
          id: classData.id,
          name: classData.class_name,
          grade_level: classData.grade_level,
          year_name: classData.academic_years?.year_name,
        })),
        courses: courses.map(course => ({
          id: course.id,
          course_code: course.course_code,
          course_name: course.course_name,
          description: course.description,
        })),
      },
    });

  } catch (error) {
    console.error('Error fetching courses data:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Internal server error',
        message: 'Failed to fetch courses data',
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
    const { course_code, course_name, description } = body;

    // Validate required fields
    if (!course_code || !course_name || !description) {
      return NextResponse.json(
        { success: false, error: 'Semua field harus diisi' },
        { status: 400 }
      );
    }

    // Check if course code already exists
    const existingCourse = await prisma.courses.findFirst({
      where: { course_code },
    });

    if (existingCourse) {
      return NextResponse.json(
        { success: false, error: 'Kode course sudah ada' },
        { status: 400 }
      );
    }

    // Create new course
    const newCourse = await prisma.courses.create({
      data: {
        course_code,
        course_name,
        description,
      },
    });

    return NextResponse.json({
      success: true,
      course: {
        id: newCourse.id,
        course_code: newCourse.course_code,
        course_name: newCourse.course_name,
        description: newCourse.description,
      },
      message: 'Course berhasil ditambahkan',
    });

  } catch (error) {
    console.error('Error creating course:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Internal server error',
        message: 'Failed to create course',
      },
      { status: 500 }
    );
  }
} 