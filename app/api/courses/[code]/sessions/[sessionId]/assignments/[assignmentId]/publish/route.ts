import { NextRequest, NextResponse } from 'next/server';
import { requireCourseManager, teacherIdsForAssignment } from '@/lib/auth/course-access';
import { prisma } from '@/lib/prisma';

// PUT /api/courses/[code]/sessions/[sessionId]/assignments/[assignmentId]/publish
export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ code: string; sessionId: string; assignmentId: string }> }
) {
  try {
    const params = await context.params;
    const assignmentId = parseInt(params.assignmentId);
    if (isNaN(assignmentId)) {
      return NextResponse.json({ error: 'Invalid assignment ID' }, { status: 400 });
    }

    const access = await requireCourseManager(() => teacherIdsForAssignment(assignmentId));
    if (!access.ok) return access.response;

    const body = await request.json();
    const { is_published } = body;

    if (typeof is_published !== 'boolean') {
      return NextResponse.json({ error: 'is_published must be a boolean' }, { status: 400 });
    }

    // Check if assignment exists
    const existingAssignment = await prisma.assignments.findUnique({
      where: { id: assignmentId },
      select: { id: true, title: true, is_published: true },
    });

    if (!existingAssignment) {
      return NextResponse.json({ error: 'Assignment not found' }, { status: 404 });
    }

    // Update the assignment's publication status
    const updatedAssignment = await prisma.assignments.update({
      where: { id: assignmentId },
      data: { is_published },
      select: {
        id: true,
        title: true,
        is_published: true,
        updated_date: true,
      },
    });

    return NextResponse.json({
      success: true,
      data: updatedAssignment,
      message: `Assignment ${is_published ? 'published' : 'unpublished'} successfully`,
    });
  } catch (error) {
    console.error('Error updating assignment publication status:', error);
    return NextResponse.json(
      {
        error: 'Failed to update assignment status',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
