import { NextRequest, NextResponse } from 'next/server';
import { canManageCourse, forbiddenResponse, getSessionUser, unauthorizedResponse } from '@/lib/auth/course-access';
import { prisma } from '@/lib/prisma';
import path from 'path';

export async function GET(request: NextRequest) {
  try {
    const user = await getSessionUser();
    if (!user) return unauthorizedResponse();

    const assignmentId = Number(request.nextUrl.searchParams.get('assignmentId'));
    if (!Number.isSafeInteger(assignmentId) || assignmentId <= 0) {
      return NextResponse.json({ success: false, error: 'Invalid assignmentId' }, { status: 400 });
    }

    const assignment = await prisma.assignments.findUnique({
      where: { id: assignmentId },
      select: { sessions: { select: {
        class_course_id: true,
        class_courses: { select: { teacher_id: true } },
      } } },
    });
    const offering = assignment?.sessions;
    if (offering?.class_course_id == null || !offering.class_courses) {
      return NextResponse.json({ success: false, error: 'Assignment course not found' }, { status: 404 });
    }
    if (!canManageCourse(user, [offering.class_courses.teacher_id])) return forbiddenResponse();

    const supportedExtensions = ['.pdf', '.docx', '.doc', '.txt', '.md', '.pptx'];

    // Match the offering restriction enforced by grading setup, including for admins.
    const sessions = await prisma.sessions.findMany({
      where: {
        class_course_id: offering.class_course_id,
      },
      select: {
        id: true,
        title: true,
        session_number: true,
        resources: {
          select: {
            id: true,
            file_name: true,
            file_url: true,
            file_type: true,
            file_tittle: true,
          },
        },
      },
      orderBy: { session_number: 'asc' },
    });

    // Filter resources to supported file types and shape output
    const result = sessions
      .map(s => ({
        session_id: s.id,
        session_title: s.title,
        session_number: s.session_number,
        resources: s.resources
          .filter(r => supportedExtensions.includes(path.extname(r.file_name).toLowerCase()))
          .map(r => ({
            id: r.id,
            file_name: r.file_name,
            file_title: r.file_tittle || r.file_name,
            file_type: r.file_type,
          })),
      }))
      .filter(s => s.resources.length > 0); // hide sessions with no supported files

    return NextResponse.json({ success: true, data: result });

  } catch (error: any) {
    console.error('Error fetching course materials:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error', message: error.message },
      { status: 500 }
    );
  }
}
