import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/auth';

// GET - Get forum for a course (session-based)
export async function GET(request: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  try {
    const { code } = await params;
    const { searchParams } = new URL(request.url);
    const sessionId = searchParams.get('sessionId');

    console.log('=== FORUM FETCH REQUEST ===');
    console.log('Course Code:', code);
    console.log('Session ID:', sessionId);
    console.log('===========================');

    // Validate session ID if provided
    if (sessionId && isNaN(parseInt(sessionId))) {
      return NextResponse.json(
        {
          success: false,
          error: 'Invalid session ID',
          message: 'Session ID must be a number',
        },
        { status: 400 }
      );
    }

    let forum;

    if (sessionId) {
      // Get session-specific forum
      forum = await prisma.forums.findFirst({
        where: {
          session_id: parseInt(sessionId),
          sessions: {
            class_courses: {
              courses: {
                course_code: code,
              },
            },
          },
        },
        include: {
          app_user: {
            select: {
              id: true,
              nama_lengkap: true,
              profile_picture_url: true,
            },
          },
          sessions: {
            select: {
              id: true,
              title: true,
              session_number: true,
            },
          },
        },
      });

      // If no forum exists for this session, create one
      if (!forum) {
        // First verify the session exists
        const session = await prisma.sessions.findFirst({
          where: {
            id: parseInt(sessionId),
            class_courses: {
              courses: {
                course_code: code,
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
        } // Create forum for this session
        const authSession = await getServerSession(authOptions);
        if (!authSession?.user?.id) {
          return NextResponse.json(
            {
              success: false,
              error: 'Unauthorized',
              message: 'Authentication required to create forum',
            },
            { status: 401 }
          );
        }

        forum = await prisma.forums.create({
          data: {
            session_id: parseInt(sessionId),
            title: `${session.title} - Discussion`,
            description: `Discussion forum for ${session.title}`,
            creator_id: parseInt(authSession.user.id),
          },
          include: {
            app_user: {
              select: {
                id: true,
                nama_lengkap: true,
                profile_picture_url: true,
              },
            },
            sessions: {
              select: {
                id: true,
                title: true,
                session_number: true,
              },
            },
          },
        });
      }
    } else {
      // Get general course forum (if we want course-wide forums)
      // For now, we'll require sessionId
      return NextResponse.json(
        {
          success: false,
          error: 'Session ID required',
          message: 'Session ID is required to access forum',
        },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        forum: {
          id: forum.id,
          title: forum.title,
          description: forum.description,
          created_at: forum.created_at,
          creator: forum.app_user?.nama_lengkap,
          session: forum.sessions,
        },
      },
    });
  } catch (error) {
    console.error('Error fetching forum:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Database error',
        message: 'Failed to fetch forum',
      },
      { status: 500 }
    );
  }
}
