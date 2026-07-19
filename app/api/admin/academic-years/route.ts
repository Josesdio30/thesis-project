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
    (role: any) => role.enumeration?.name === 'ADMIN' && role.is_active
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

    // Get all academic years
    const academicYears = await prisma.academic_years.findMany({
      orderBy: {
        year_name: 'desc',
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        academic_years: academicYears,
      },
    });

  } catch (error) {
    console.error('Error fetching academic years:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Internal server error',
        message: 'Failed to fetch academic years',
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
    const { year_name, start_date, end_date, is_active } = body;

    if (!year_name || !start_date || !end_date) {
      return NextResponse.json(
        { success: false, error: 'Semua field wajib diisi' },
        { status: 400 }
      );
    }

    // Cek apakah year_name sudah ada
    const existing = await prisma.academic_years.findUnique({
      where: { year_name },
    });

    if (existing) {
      return NextResponse.json(
        { success: false, error: 'Nama tahun ajaran sudah ada' },
        { status: 400 }
      );
    }

    const startDate = new Date(start_date);
    const endDate = new Date(end_date);
    const isActive = !!is_active;

    // Gunakan transaksi jika isActive bernilai true
    const result = await prisma.$transaction(async (tx: any) => {
      if (isActive) {
        // Nonaktifkan semua tahun ajaran lain
        await tx.academic_years.updateMany({
          where: { is_active: true },
          data: { is_active: false },
        });
      }

      return await tx.academic_years.create({
        data: {
          year_name,
          start_date: startDate,
          end_date: endDate,
          is_active: isActive,
        },
      });
    });

    return NextResponse.json({
      success: true,
      data: result,
    });

  } catch (error) {
    console.error('Error creating academic year:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Internal server error',
        message: 'Failed to create academic year',
      },
      { status: 500 }
    );
  }
}