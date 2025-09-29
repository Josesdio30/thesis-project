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
    const enrollmentId = parseInt(id);
    if (isNaN(enrollmentId)) {
      return NextResponse.json(
        { success: false, error: 'Invalid enrollment ID' },
        { status: 400 }
      );
    }

    // Check if enrollment exists
    const existingEnrollment = await prisma.enrollments.findUnique({
      where: { id: enrollmentId },
    });

    if (!existingEnrollment) {
      return NextResponse.json(
        { success: false, error: 'Enrollment tidak ditemukan' },
        { status: 404 }
      );
    }

    // Delete enrollment
    await prisma.enrollments.delete({
      where: { id: enrollmentId },
    });

    return NextResponse.json({
      success: true,
      message: 'Enrollment berhasil dihapus',
    });

  } catch (error) {
    console.error('Error deleting enrollment:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Internal server error',
        message: 'Failed to delete enrollment',
      },
      { status: 500 }
    );
  }
} 