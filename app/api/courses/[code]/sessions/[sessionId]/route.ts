import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(request: NextRequest, { params }: { params: Promise<{ code: string; sessionId: string }> }) {
  try {
    const { code, sessionId } = await params;
    const sessionIdNum = parseInt(sessionId);

    if (isNaN(sessionIdNum)) {
      return NextResponse.json(
        {
          success: false,
          error: 'Invalid session ID',
          message: 'Session ID must be a number',
        },
        { status: 400 }
      );
    }

    // First, verify the course exists and get course info
    const course = await prisma.courses.findUnique({
      where: {
        course_code: code,
      },
      select: {
        course_code: true,
        course_name: true,
      },
    });

    if (!course) {
      return NextResponse.json(
        {
          success: false,
          error: 'Course not found',
          message: 'Course not found',
        },
        { status: 404 }
      );
    }

    // Get the specific session with all details
    const session = await prisma.sessions.findFirst({
      where: {
        id: sessionIdNum,
        class_courses: {
          courses: {
            course_code: code,
          },
        },
      },
      include: {
        class_courses: {
          include: {
            courses: true,
          },
        },
      },
    });

    if (!session) {
      return NextResponse.json(
        {
          success: false,
          error: 'Session not found',
          message: 'Session not found for this course',
        },
        { status: 404 }
      );
    }

    // Get all sessions for navigation (lightweight)
    const allSessions = await prisma.sessions.findMany({
      where: {
        class_courses: {
          courses: {
            course_code: code,
          },
        },
      },
      select: {
        id: true,
        session_number: true,
        title: true,
      },
      orderBy: {
        session_number: 'asc',
      },
    });

    // Get session materials (if any)
    const materials = await prisma.materials.findMany({
      where: {
        session_id: sessionIdNum,
      },
      select: {
        title: true,
        content: true,
      },
      orderBy: {
        id: 'asc',
      },
    });

    const sessionData = {
      session: {
        id: session.id,
        session_number: session.session_number,
        title: session.title,
        description: session.description,
        start_time: session.start_time,
        end_time: session.end_time,
        materials: materials,
      },
      course: {
        course_code: course.course_code,
        course_name: course.course_name,
      },
      allSessions: allSessions,
    };

    return NextResponse.json({
      success: true,
      data: sessionData,
    });
  } catch (error) {
    console.error('Error fetching session data:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Database error',
        message: 'Failed to fetch session data',
      },
      { status: 500 }
    );
  }
}
