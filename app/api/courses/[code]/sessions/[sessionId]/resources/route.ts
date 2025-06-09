import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function POST(request: NextRequest, { params }: { params: { code: string; sessionId: string } }) {
  try {
    const { code, sessionId } = params;
    const sessionIdNum = parseInt(sessionId);
    const body = await request.json();

    console.log('=== RESOURCE SAVE REQUEST ===');
    console.log('Course Code:', code);
    console.log('Session ID:', sessionId);
    console.log('Request Body:', body);
    console.log('============================');

    // Validate required fields
    if (!body.file_url || !body.file_name || !body.file_type) {
      return NextResponse.json(
        {
          success: false,
          error: 'Missing required fields',
          message: 'file_url, file_name, and file_type are required',
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
    } // Create new resource in database using Prisma
    const newResource = await prisma.resources.create({
      data: {
        session_id: sessionIdNum,
        uploader_id: 1, // TODO: Get actual user ID from auth session
        file_url: body.file_url,
        file_name: body.file_name,
        file_tittle: body.file_tittle, // Add file_tittle field
        file_size: body.file_size || 0,
        file_type: body.file_type,
        content_type: body.content_type || 'application/octet-stream',
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
      message: 'Resource saved successfully',
      data: {
        id: newResource.id,
        file_name: newResource.file_name,
        file_tittle: newResource.file_tittle, // Include file_tittle in response
        file_url: newResource.file_url,
        file_type: newResource.file_type,
        file_size: newResource.file_size,
        uploader: newResource.app_user?.nama_lengkap,
        title: body.title,
        description: body.description,
      },
    });
  } catch (error) {
    console.error('=== API ERROR ===');
    console.error('Error details:', error);

    return NextResponse.json(
      {
        success: false,
        error: 'Database error',
        details: error instanceof Error ? error.message : 'Failed to save resource',
      },
      { status: 500 }
    );
  }
}

// export async function GET(request: NextRequest, { params }: { params: { code: string; sessionId: string } }) {
//   try {
//     const { sessionId } = await params;
//     const sessionIdNum = parseInt(sessionId);

//     console.log('=== RESOURCE FETCH REQUEST ===');
//     console.log('Session ID:', sessionId);
//     console.log('===============================');

//     // Fetch resources from database using Prisma
//     const resources = await prisma.resources.findMany({
//       where: {
//         session_id: sessionIdNum,
//       },
//       include: {
//         app_user: {
//           select: {
//             nama_lengkap: true,
//           },
//         },
//       },
//       orderBy: {
//         id: 'desc', // Use id instead of upload_date since upload_date doesn't exist
//       },
//     });

//     return NextResponse.json({
//       success: true,
//       data: resources.map(resource => ({
//         id: resource.id,
//         file_name: resource.file_name,
//         file_tittle: resource.file_tittle, // Include file_tittle field
//         file_url: resource.file_url,
//         file_type: resource.file_type,
//         file_size: resource.file_size,
//         content_type: resource.content_type,
//         version: resource.version,
//         is_public: resource.is_public,
//         download_count: resource.download_count,
//         uploader: resource.app_user?.nama_lengkap,
//       })),
//     });
//   } catch (error) {
//     console.error('=== FETCH ERROR ===');
//     console.error('Error details:', error);

//     return NextResponse.json(
//       {
//         success: false,
//         error: 'Database error',
//         details: error instanceof Error ? error.message : 'Failed to fetch resources',
//       },
//       { status: 500 }
//     );
//   }
// }

export async function GET(request: NextRequest, { params }: { params: Promise<{ code: string; sessionId: string }> }) {
  try {
    // Await params before using its properties
    const { sessionId } = await params;
    const sessionIdNum = parseInt(sessionId);

    console.log('=== RESOURCE FETCH REQUEST ===');
    console.log('Session ID:', sessionId);
    console.log('===============================');

    // Fetch resources from database using Prisma
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
        id: 'desc', // Use id instead of upload_date since upload_date doesn't exist
      },
    });

    return NextResponse.json({
      success: true,
      data: resources.map(resource => ({
        id: resource.id,
        file_name: resource.file_name,
        file_tittle: resource.file_tittle, // Include file_tittle field
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
    console.error('=== FETCH ERROR ===');
    console.error('Error details:', error);

    return NextResponse.json(
      {
        success: false,
        error: 'Database error',
        details: error instanceof Error ? error.message : 'Failed to fetch resources',
      },
      { status: 500 }
    );
  }
}
