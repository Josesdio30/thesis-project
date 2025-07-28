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

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    const { isAdmin, error } = await checkAdminAccess(session);
    
    if (!isAdmin) {
      return NextResponse.json({ success: false, error }, { status: 401 });
    }

    const { id } = await params;
    const courseId = parseInt(id);
    if (isNaN(courseId)) {
      return NextResponse.json(
        { success: false, error: 'Invalid course ID' },
        { status: 400 }
      );
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

    // Check if course exists
    const existingCourse = await prisma.courses.findUnique({
      where: { id: courseId },
    });

    if (!existingCourse) {
      return NextResponse.json(
        { success: false, error: 'Course tidak ditemukan' },
        { status: 404 }
      );
    }

    // Check if course code already exists (excluding current course)
    const duplicateCourse = await prisma.courses.findFirst({
      where: {
        course_code,
        id: { not: courseId },
      },
    });

    if (duplicateCourse) {
      return NextResponse.json(
        { success: false, error: 'Kode course sudah ada' },
        { status: 400 }
      );
    }

    // Update course
    const updatedCourse = await prisma.courses.update({
      where: { id: courseId },
      data: {
        course_code,
        course_name,
        description,
      },
    });

    return NextResponse.json({
      success: true,
      course: {
        id: updatedCourse.id,
        course_code: updatedCourse.course_code,
        course_name: updatedCourse.course_name,
        description: updatedCourse.description,
      },
      message: 'Course berhasil diupdate',
    });

  } catch (error) {
    console.error('Error updating course:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Internal server error',
        message: 'Failed to update course',
      },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    const { isAdmin, error } = await checkAdminAccess(session);
    
    if (!isAdmin) {
      return NextResponse.json({ success: false, error }, { status: 401 });
    }

    const { id } = await params;
    const courseId = parseInt(id);
    if (isNaN(courseId)) {
      return NextResponse.json(
        { success: false, error: 'Invalid course ID' },
        { status: 400 }
      );
    }

    // Check if course exists
    const existingCourse = await prisma.courses.findUnique({
      where: { id: courseId },
    });

    if (!existingCourse) {
      return NextResponse.json(
        { success: false, error: 'Course tidak ditemukan' },
        { status: 404 }
      );
    }

    // Check if course is being used in class_courses
    const classCourses = await prisma.class_courses.findFirst({
      where: { course_id: courseId },
    });

    if (classCourses) {
      return NextResponse.json(
        { success: false, error: 'Course tidak dapat dihapus karena masih digunakan di kelas' },
        { status: 400 }
      );
    }

    // Delete course
    await prisma.courses.delete({
      where: { id: courseId },
    });

    return NextResponse.json({
      success: true,
      message: 'Course berhasil dihapus',
    });

  } catch (error) {
    console.error('Error deleting course:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Internal server error',
        message: 'Failed to delete course',
      },
      { status: 500 }
    );
  }
} 