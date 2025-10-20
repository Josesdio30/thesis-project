import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/auth';
import { prisma } from '@/lib/prisma';

// Define the type by inferring from the actual query
const getAssignments = async () => {
  return await prisma.assignments.findMany({
    include: {
      sessions: {
        include: {
          class_courses: {
            include: {
              courses: true,
              classes: true,
            },
          },
        },
      },
      enumeration: true,
    },
  });
};

type AssignmentWithRelations = Awaited<ReturnType<typeof getAssignments>>[number];

export async function GET(request: NextRequest) {
  try {
    // Get session for authentication
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    // Get user details
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

    // Get assignments based on user role
    const isStudent = userDetails.app_user_role?.some(
      role => role.enumeration?.name === 'STUDENT' && role.is_active
    );

    const isTeacher = userDetails.app_user_role?.some(
      role => role.enumeration?.name === 'TEACHER' && role.is_active
    );

    const isAdmin = userDetails.app_user_role?.some(
      role => role.enumeration?.name === 'ADMIN' && role.is_active
    );

    let assignments: AssignmentWithRelations[];

    if (isStudent) {
      // For students, get assignments from their enrolled courses
      assignments = await prisma.assignments.findMany({
        where: {
          is_published: true,
          sessions: {
            class_courses: {
              enrollments: {
                some: {
                  student_id: parseInt(session.user.id),
                },
              },
            },
          },
        },
        include: {
          sessions: {
            include: {
              class_courses: {
                include: {
                  courses: true,
                  classes: true,
                },
              },
            },
          },
          enumeration: true,
        },
        orderBy: {
          due_date: 'asc',
        },
      });
    } else if (isTeacher || isAdmin) {
      // For teachers and admins, get all assignments
      assignments = await prisma.assignments.findMany({
        where: {
          is_published: true,
        },
        include: {
          sessions: {
            include: {
              class_courses: {
                include: {
                  courses: true,
                  classes: true,
                },
              },
            },
          },
          enumeration: true,
        },
        orderBy: {
          due_date: 'asc',
        },
      });
    } else {
      assignments = [];
    }

    return NextResponse.json({
      success: true,
      data: {
        assignments,
      },
    });

  } catch (error) {
    console.error('Error fetching assignments:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Internal server error',
        message: 'Failed to fetch assignments',
      },
      { status: 500 }
    );
  }
}