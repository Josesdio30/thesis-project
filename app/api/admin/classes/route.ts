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

    // Get all classes with academic year info
    const classes = await prisma.classes.findMany({
      include: {
        academic_years: true,
      },
      orderBy: {
        class_name: 'asc',
      },
    });

    const classData = classes.map(cls => ({
      id: cls.id,
      name: cls.class_name,
      grade_level: cls.grade_level,
      year_id: cls.year_id,
      year_name: cls.academic_years?.year_name,
    }));

    return NextResponse.json({
      success: true,
      data: {
        classes: classData,
      },
    });

  } catch (error) {
    console.error('Error fetching classes:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Internal server error',
        message: 'Failed to fetch classes',
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
    const { class_name, grade_level, year_id } = body;

    // Validate required fields
    if (!class_name || !grade_level || !year_id) {
      return NextResponse.json(
        { success: false, error: 'Semua field harus diisi' },
        { status: 400 }
      );
    }

    // Check if class name already exists for the same academic year
    const existingClass = await prisma.classes.findFirst({
      where: {
        class_name,
        year_id: parseInt(year_id),
      },
    });

    if (existingClass) {
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

    // Create new class
    const newClass = await prisma.classes.create({
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
        id: newClass.id,
        name: newClass.class_name,
        grade_level: newClass.grade_level,
        year_id: newClass.year_id,
        year_name: newClass.academic_years?.year_name,
      },
      message: 'Class berhasil ditambahkan',
    });

  } catch (error) {
    console.error('Error creating class:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Internal server error',
        message: 'Failed to create class',
      },
      { status: 500 }
    );
  }
} 