import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/auth';
import { prisma } from '@/lib/prisma';

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

    // Get all roles
    const roles = await prisma.enumeration.findMany({
      where: {
        category: 'ROLE',
        is_active: true,
      },
      orderBy: {
        name: 'asc',
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        roles: roles.map(role => ({
          id: role.id,
          name: role.name,
          category: role.category,
        })),
      },
    });

  } catch (error) {
    console.error('Error fetching roles:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Internal server error',
        message: 'Failed to fetch roles',
      },
      { status: 500 }
    );
  }
} 