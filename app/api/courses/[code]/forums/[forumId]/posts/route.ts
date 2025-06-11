import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/auth';

// GET - Get posts in a forum
export async function GET(request: NextRequest, { params }: { params: Promise<{ code: string; forumId: string }> }) {
  try {
    const { forumId } = await params;
    const forumIdNum = parseInt(forumId);
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '20');
    const offset = parseInt(searchParams.get('offset') || '0');

    console.log('=== FORUM POSTS FETCH REQUEST ===');
    console.log('Forum ID:', forumId);
    console.log('Limit:', limit, 'Offset:', offset);
    console.log('==================================');

    if (isNaN(forumIdNum)) {
      return NextResponse.json(
        {
          success: false,
          error: 'Invalid forum ID',
          message: 'Forum ID must be a number',
        },
        { status: 400 }
      );
    }

    // Verify forum exists
    const forum = await prisma.forums.findUnique({
      where: { id: forumIdNum },
      select: { id: true, title: true },
    });

    if (!forum) {
      return NextResponse.json(
        {
          success: false,
          error: 'Forum not found',
          message: 'Forum not found',
        },
        { status: 404 }
      );
    }

    // Get posts with replies count
    const posts = await prisma.forum_posts.findMany({
      where: {
        forum_id: forumIdNum,
        is_deleted: false,
      },
      include: {
        app_user: {
          select: {
            id: true,
            nama_lengkap: true,
            profile_picture_url: true,
          },
        },
        forum_replies: {
          where: {
            is_deleted: false,
          },
          select: {
            id: true,
          },
        },
        forum_attachments: {
          select: {
            id: true,
            file_name: true,
            file_url: true,
            file_size: true,
          },
        },
      },
      orderBy: {
        created_at: 'desc',
      },
      take: limit,
      skip: offset,
    });

    const totalPosts = await prisma.forum_posts.count({
      where: {
        forum_id: forumIdNum,
        is_deleted: false,
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        forum: {
          id: forum.id,
          title: forum.title,
        },
        posts: posts.map(post => ({
          id: post.id,
          title: post.title,
          content: post.content,
          content_type: post.content_type,
          created_at: post.created_at,
          updated_at: post.updated_at,
          author: {
            id: post.app_user?.id,
            nama_lengkap: post.app_user?.nama_lengkap,
            profile_picture_url: post.app_user?.profile_picture_url,
          },
          reply_count: post.forum_replies.length,
          attachments: post.forum_attachments.map(attachment => ({
            id: attachment.id,
            file_name: attachment.file_name,
            file_url: attachment.file_url,
            file_size: attachment.file_size,
          })),
        })),
        pagination: {
          total: totalPosts,
          limit,
          offset,
          hasMore: offset + limit < totalPosts,
        },
      },
    });
  } catch (error) {
    console.error('Error fetching forum posts:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Database error',
        message: 'Failed to fetch forum posts',
      },
      { status: 500 }
    );
  }
}

// POST - Create new post in forum
export async function POST(request: NextRequest, { params }: { params: Promise<{ code: string; forumId: string }> }) {
  try {
    const { forumId } = await params;
    const forumIdNum = parseInt(forumId);
    const body = await request.json();

    console.log('=== CREATE FORUM POST REQUEST ===');
    console.log('Forum ID:', forumId);
    console.log('Request Body:', body);
    console.log('==================================');

    if (isNaN(forumIdNum)) {
      return NextResponse.json(
        {
          success: false,
          error: 'Invalid forum ID',
          message: 'Forum ID must be a number',
        },
        { status: 400 }
      );
    } // Get user from session
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json(
        {
          success: false,
          error: 'Unauthorized',
          message: 'Authentication required to create post',
        },
        { status: 401 }
      );
    }

    // Validate required fields
    if (!body.title || !body.content) {
      return NextResponse.json(
        {
          success: false,
          error: 'Missing required fields',
          message: 'Title and content are required',
        },
        { status: 400 }
      );
    }

    // Verify forum exists
    const forum = await prisma.forums.findUnique({
      where: { id: forumIdNum },
      select: { id: true },
    });

    if (!forum) {
      return NextResponse.json(
        {
          success: false,
          error: 'Forum not found',
          message: 'Forum not found',
        },
        { status: 404 }
      );
    } // Create new post
    const newPost = await prisma.forum_posts.create({
      data: {
        forum_id: forumIdNum,
        user_id: parseInt(session.user.id),
        title: body.title,
        content: body.content,
        content_type: body.content_type || 'plaintext',
      },
      include: {
        app_user: {
          select: {
            id: true,
            nama_lengkap: true,
            profile_picture_url: true,
          },
        },
        forum_attachments: {
          select: {
            id: true,
            file_name: true,
            file_url: true,
            file_size: true,
          },
        },
      },
    });

    // Handle attachments if provided
    let attachments = [];
    if (body.attachments && Array.isArray(body.attachments) && body.attachments.length > 0) {
      const attachmentPromises = body.attachments.map((attachment: any) =>
        prisma.forum_attachments.create({
          data: {
            post_id: newPost.id,
            uploader_id: parseInt(session.user.id),
            file_name: attachment.file_name,
            file_url: attachment.file_url,
            file_size: attachment.file_size,
          },
        })
      );

      attachments = await Promise.all(attachmentPromises);
    }
    return NextResponse.json({
      success: true,
      data: {
        post: {
          id: newPost.id,
          title: newPost.title,
          content: newPost.content,
          content_type: newPost.content_type,
          created_at: newPost.created_at,
          updated_at: newPost.updated_at,
          author: {
            id: newPost.app_user?.id,
            nama_lengkap: newPost.app_user?.nama_lengkap,
            profile_picture_url: newPost.app_user?.profile_picture_url,
          },
          reply_count: 0,
          attachments: attachments.map(attachment => ({
            id: attachment.id,
            file_name: attachment.file_name,
            file_url: attachment.file_url,
            file_size: attachment.file_size,
          })),
        },
      },
      message: 'Post created successfully',
    });
  } catch (error) {
    console.error('Error creating forum post:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Database error',
        message: 'Failed to create forum post',
      },
      { status: 500 }
    );
  }
}
