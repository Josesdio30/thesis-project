import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { unlink } from 'fs/promises';
import path from 'path';

interface RouteParams {
  code: string;
  sessionId: string;
  resourceId: string;
}

// GET - Get individual resource
export async function GET(request: NextRequest, { params }: { params: Promise<RouteParams> }) {
  try {
    const { resourceId } = await params;
    const resourceIdNum = parseInt(resourceId);

    const resource = await prisma.resources.findUnique({
      where: {
        id: resourceIdNum,
      },
      include: {
        app_user: {
          select: {
            nama_lengkap: true,
          },
        },
      },
    });

    if (!resource) {
      return NextResponse.json(
        {
          success: false,
          error: 'Resource not found',
        },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: {
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
      },
    });
  } catch (error) {
    console.error('=== GET RESOURCE ERROR ===');
    console.error('Error details:', error);

    return NextResponse.json(
      {
        success: false,
        error: 'Database error',
        details: error instanceof Error ? error.message : 'Failed to fetch resource',
      },
      { status: 500 }
    );
  }
}

// DELETE - Delete resource
export async function DELETE(request: NextRequest, { params }: { params: Promise<RouteParams> }) {
  try {
    const { code, sessionId, resourceId } = await params;
    const resourceIdNum = parseInt(resourceId);
    const sessionIdNum = parseInt(sessionId);

    const existingResource = await prisma.resources.findFirst({
      where: {
        id: resourceIdNum,
        session_id: sessionIdNum,
        sessions: {
          class_courses: {
            courses: {
              course_code: code,
            },
          },
        },
      },
    });

    if (!existingResource) {
      return NextResponse.json(
        {
          success: false,
          error: 'Resource not found',
          message: 'Resource not found or does not belong to this session',
        },
        { status: 404 }
      );
    }

    // Delete from database
    await prisma.resources.delete({
      where: {
        id: resourceIdNum,
      },
    });

    if (existingResource.file_type !== 'link' && existingResource.file_url.startsWith('/uploads/')) {
      try {
        const filePath = path.join(process.cwd(), 'public', existingResource.file_url);
        await unlink(filePath);
        console.log('Physical file deleted:', filePath);
      } catch (fileError) {
        console.warn('Could not delete physical file:', fileError);
      }
    }

    return NextResponse.json({
      success: true,
      message: 'Resource deleted successfully',
      data: {
        id: resourceIdNum,
        file_name: existingResource.file_name,
      },
    });
  } catch (error) {
    console.error('=== DELETE RESOURCE ERROR ===');
    console.error('Error details:', error);

    return NextResponse.json(
      {
        success: false,
        error: 'Database error',
        details: error instanceof Error ? error.message : 'Failed to delete resource',
      },
      { status: 500 }
    );
  }
}