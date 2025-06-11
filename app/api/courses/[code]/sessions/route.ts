import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(request: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  try {
    const { code } = await params;
    const { searchParams } = new URL(request.url);
    const sessionId = searchParams.get('sessionId');

    if (!sessionId) {
      return NextResponse.json(
        {
          success: false,
          error: 'Missing session ID',
          message: 'Session ID is required',
        },
        { status: 400 }
      );
    }

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

    // First, verify the course and session exist
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

    // Fetch resources for this session
    const resources = await prisma.resources.findMany({
      where: {
        session_id: sessionIdNum,
      },
      include: {
        app_user: {
          select: {
            nama_lengkap: true,
          },
        },
      },
      orderBy: {
        id: 'desc',
      },
    });

    return NextResponse.json({
      success: true,
      data: resources.map(resource => ({
        id: resource.id,
        file_name: resource.file_name,
        file_url: resource.file_url,
        file_type: resource.file_type,
        file_size: resource.file_size,
        content_type: resource.content_type,
        version: resource.version,
        is_public: resource.is_public,
        download_count: resource.download_count,
        uploader: resource.app_user?.nama_lengkap,
      })),
    });
  } catch (error) {
    console.error('Error fetching session resources:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Database error',
        message: 'Failed to fetch session resources',
      },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  try {
    const { code } = await params;
    const body = await request.json();
    const sessionId = body.sessionId;

    if (!sessionId) {
      return NextResponse.json(
        {
          success: false,
          error: 'Missing session ID',
          message: 'Session ID is required',
        },
        { status: 400 }
      );
    }

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

    const { file_url, file_name, file_type, file_size, content_type, uploader_id } = body;

    // Validate required fields
    if (!file_url || !file_name || !file_type || !uploader_id) {
      return NextResponse.json(
        {
          success: false,
          error: 'Missing required fields',
          message: 'file_url, file_name, file_type, and uploader_id are required',
        },
        { status: 400 }
      );
    }

    // Verify session exists
    const session = await prisma.sessions.findFirst({
      where: {
        id: sessionIdNum,
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
    } // Create new resource
    const newResource = await prisma.resources.create({
      data: {
        session_id: sessionIdNum,
        uploader_id: uploader_id,
        file_url: file_url,
        file_name: file_name,
        file_size: file_size || 0,
        file_type: file_type,
        content_type: content_type,
        version: 1,
        is_public: true,
        download_count: 0,
      },
      include: {
        app_user: {
          select: {
            nama_lengkap: true,
          },
        },
      },
    });
    return NextResponse.json({
      success: true,
      data: {
        id: newResource.id,
        file_name: newResource.file_name,
        file_url: newResource.file_url,
        file_type: newResource.file_type,
        file_size: newResource.file_size,
        uploader: newResource.app_user?.nama_lengkap,
      },
      message: 'Resource uploaded successfully',
    });
  } catch (error) {
    console.error('Error creating resource:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Database error',
        message: 'Failed to upload resource',
      },
      { status: 500 }
    );
  }
}
