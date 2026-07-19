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

    const { id: rawId } = await params;
    const id = parseInt(rawId);
    if (isNaN(id)) {
      return NextResponse.json({ success: false, error: 'ID tidak valid' }, { status: 400 });
    }

    const body = await request.json();
    const { year_name, start_date, end_date, is_active } = body;

    if (!year_name || !start_date || !end_date) {
      return NextResponse.json(
        { success: false, error: 'Semua field wajib diisi' },
        { status: 400 }
      );
    }

    // Cek apakah data tahun ajaran ada
    const target = await prisma.academic_years.findUnique({
      where: { id },
    });

    if (!target) {
      return NextResponse.json({ success: false, error: 'Tahun ajaran tidak ditemukan' }, { status: 404 });
    }

    // Cek apakah year_name unik (tidak bentrok dengan data lain)
    const existing = await prisma.academic_years.findFirst({
      where: {
        year_name,
        id: { not: id },
      },
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

    const result = await prisma.$transaction(async (tx: any) => {
      if (isActive) {
        // Nonaktifkan semua tahun ajaran lain
        await tx.academic_years.updateMany({
          where: {
            id: { not: id },
            is_active: true,
          },
          data: { is_active: false },
        });
      }

      return await tx.academic_years.update({
        where: { id },
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
    console.error('Error updating academic year:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Internal server error',
        message: 'Failed to update academic year',
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

    const { id: rawId } = await params;
    const id = parseInt(rawId);
    if (isNaN(id)) {
      return NextResponse.json({ success: false, error: 'ID tidak valid' }, { status: 400 });
    }

    // Cek apakah data tahun ajaran ada
    const target = await prisma.academic_years.findUnique({
      where: { id },
      include: {
        classes: true,
      },
    });

    if (!target) {
      return NextResponse.json({ success: false, error: 'Tahun ajaran tidak ditemukan' }, { status: 404 });
    }

    // Cegah penghapusan jika ada kelas yang dikaitkan
    if (target.classes && target.classes.length > 0) {
      return NextResponse.json(
        { success: false, error: 'Tidak dapat menghapus tahun ajaran karena masih memiliki kelas terkait. Hapus atau pindahkan kelas terlebih dahulu.' },
        { status: 400 }
      );
    }

    await prisma.academic_years.delete({
      where: { id },
    });

    return NextResponse.json({
      success: true,
      message: 'Tahun ajaran berhasil dihapus',
    });

  } catch (error) {
    console.error('Error deleting academic year:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Internal server error',
        message: 'Failed to delete academic year',
      },
      { status: 500 }
    );
  }
}
