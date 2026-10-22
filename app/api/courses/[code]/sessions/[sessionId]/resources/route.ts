import { NextRequest, NextResponse } from 'next/server';
<<<<<<< HEAD
import { prisma } from '@/lib/prisma';
import { notifyNewResource } from '@/lib/notification-service';
=======
import { requireCourseManager, teacherIdsForSession } from '@/lib/auth/course-access';
import { prisma } from '@/lib/prisma';
>>>>>>> test-plagiarism-correction-feature
import { getServerSession } from 'next-auth';
import { authOptions } from '@/auth';

export async function POST(request: NextRequest, { params }: { params: Promise<{ code: string; sessionId: string }> }) {
  try {
<<<<<<< HEAD
    const { code, sessionId } = await params;
    const sessionIdNum = parseInt(sessionId);
    const body = await request.json();

    // Get current user session
    const session = await getServerSession(authOptions);
    const uploaderName = session?.user?.name || 'Guru';
=======
    const session = await getServerSession(authOptions);
    if (!session || !session.user || !session.user.id) {
      return NextResponse.json(
        {
          success: false,
          error: 'Unauthorized',
          message: 'You must be logged in to upload resources',
        },
        { status: 401 }
      );
    }

    const { code, sessionId } = await params;
    const sessionIdNum = parseInt(sessionId);
    const access = await requireCourseManager(() => teacherIdsForSession(sessionId));
    if (!access.ok) return access.response;

    const body = await request.json();
>>>>>>> test-plagiarism-correction-feature

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
<<<<<<< HEAD
    const sessionData = await prisma.sessions.findFirst({
=======
    const dbSession = await prisma.sessions.findFirst({
>>>>>>> test-plagiarism-correction-feature
      where: {
        id: sessionIdNum,
        class_courses: {
          courses: {
            course_code: code,
          },
        },
      },
    });

<<<<<<< HEAD
    if (!sessionData) {
=======
    if (!dbSession) {
>>>>>>> test-plagiarism-correction-feature
      return NextResponse.json(
        {
          success: false,
          error: 'Session not found',
          message: 'Session not found for this course',
        },
        { status: 404 }
      );
<<<<<<< HEAD
    }

    // Create new resource in database using Prisma
    const newResource = await prisma.resources.create({
      data: {
        session_id: sessionIdNum,
        uploader_id: session?.user?.id ? parseInt(session.user.id) : 1,
=======
    } // Create new resource in database using Prisma
    const newResource = await prisma.resources.create({
      data: {
        session_id: sessionIdNum,
        uploader_id: parseInt(session.user.id),
>>>>>>> test-plagiarism-correction-feature
        file_url: body.file_url,
        file_name: body.file_name,
        file_tittle: body.file_tittle,
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

<<<<<<< HEAD
    // 🔔 Send notification to enrolled students
    try {
      const resourceTitle = body.file_tittle || body.file_name || 'File Baru';
      await notifyNewResource(sessionIdNum, resourceTitle, uploaderName);
      console.log('Notifications sent for new resource');
    } catch (notifError) {
      console.error('Failed to send notifications:', notifError);
      // Don't fail the request if notification fails
    }

=======
>>>>>>> test-plagiarism-correction-feature
    return NextResponse.json({
      success: true,
      message: 'Resource saved successfully',
      data: {
        id: newResource.id,
        file_name: newResource.file_name,
        file_tittle: newResource.file_tittle,
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
<<<<<<< HEAD
        details: error instanceof Error ? error.message : 'Failed to save resource',
=======
>>>>>>> test-plagiarism-correction-feature
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
        file_tittle: resource.file_tittle,
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
<<<<<<< HEAD
        details: error instanceof Error ? error.message : 'Failed to fetch resources',
=======
>>>>>>> test-plagiarism-correction-feature
      },
      { status: 500 }
    );
  }
}
