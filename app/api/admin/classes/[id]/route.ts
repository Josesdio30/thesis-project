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

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getServerSession(authOptions);
    const { isAdmin, error } = await checkAdminAccess(session);
    
    if (!isAdmin) {
      return NextResponse.json({ success: false, error }, { status: 401 });
    }

    const { id } = await params;
    const classId = parseInt(id);
    if (isNaN(classId)) {
      return NextResponse.json(
        { success: false, error: 'Invalid class ID' },
        { status: 400 }
      );
    }

    const body = await request.json();
    const { class_name, grade_level, year_id } = body;

    // Validate required fields
    if (!class_name || !grade_level || !year_id) {
      return NextResponse.json(
        { success: false, error: 'Semua field harus diisi' },
        { status: 400 }
      );
    }

    // Check if class exists
    const existingClass = await prisma.classes.findUnique({
      where: { id: classId },
    });

    if (!existingClass) {
      return NextResponse.json(
        { success: false, error: 'Class tidak ditemukan' },
        { status: 404 }
      );
    }

    // Check if class name already exists for the same academic year (excluding current class)
    const duplicateClass = await prisma.classes.findFirst({
      where: {
        class_name,
        year_id: parseInt(year_id),
        id: { not: classId },
      },
    });

    if (duplicateClass) {
      return NextResponse.json(
        { success: false, error: 'Nama class sudah ada untuk academic year ini' },
        { status: 400 }
      );
    }

    // Check if academic year exists
    const academicYear = await prisma.academic_years.findUnique({
      where: { id: parseInt(year_id) },
    });

    if (!academicYear) {
      return NextResponse.json(
        { success: false, error: 'Academic year tidak ditemukan' },
        { status: 404 }
      );
    }

    // Update class
    const updatedClass = await prisma.classes.update({
      where: { id: classId },
      data: {
        class_name,
        grade_level,
        year_id: parseInt(year_id),
      },
      include: {
        academic_years: true,
      },
    });

    return NextResponse.json({
      success: true,
      class: {
        id: updatedClass.id,
        name: updatedClass.class_name,
        grade_level: updatedClass.grade_level,
        year_id: updatedClass.year_id,
        year_name: updatedClass.academic_years?.year_name,
      },
      message: 'Class berhasil diupdate',
    });

  } catch (error) {
    console.error('Error updating class:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Internal server error',
        message: 'Failed to update class',
      },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getServerSession(authOptions);
    const { isAdmin, error } = await checkAdminAccess(session);
    
    if (!isAdmin) {
      return NextResponse.json({ success: false, error }, { status: 401 });
    }

    const { id } = await params;
    const classId = parseInt(id);
    if (isNaN(classId)) {
      return NextResponse.json(
        { success: false, error: 'Invalid class ID' },
        { status: 400 }
      );
    }

    // Check if class exists
    const existingClass = await prisma.classes.findUnique({
      where: { id: classId },
    });

    if (!existingClass) {
      return NextResponse.json(
        { success: false, error: 'Class tidak ditemukan' },
        { status: 404 }
      );
    }

    // Check if class is used in class_courses
    const classCourses = await prisma.class_courses.findFirst({
      where: { class_id: classId },
    });

    if (classCourses) {
      return NextResponse.json(
        { success: false, error: 'Class tidak dapat dihapus karena masih digunakan di class courses' },
        { status: 400 }
      );
    }

    // Check if class is used in enrollments
    const enrollments = await prisma.enrollments.findFirst({
      where: {
        class_courses: {
          class_id: classId,
        },
      },
    });

    if (enrollments) {
      return NextResponse.json(
        { success: false, error: 'Class tidak dapat dihapus karena masih memiliki students yang ter-enroll' },
        { status: 400 }
      );
    }

    // Delete class
    await prisma.classes.delete({
      where: { id: classId },
    });

    return NextResponse.json({
      success: true,
      message: 'Class berhasil dihapus',
    });

  } catch (error) {
    console.error('Error deleting class:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Internal server error',
        message: 'Failed to delete class',
      },
      { status: 500 }
    );
  }
} 