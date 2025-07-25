import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/auth';

// GET - Get replies for a specific post
export async function GET(req: NextRequest) {
  // Dummy response replies
  return NextResponse.json({
    success: true,
    replies: [
      { id: 1, content: 'Reply 1', author: 'Guru A' },
      { id: 2, content: 'Reply 2', author: 'Student B' },
    ],
  });
}

// POST - Create new reply to a post
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ code: string; forumId: string; postId: string }> }
) {
  try {
    const { postId } = await params;
    const postIdNum = parseInt(postId);
    const body = await request.json();

    console.log('=== CREATE FORUM REPLY REQUEST ===');
    console.log('Post ID:', postId);
    console.log('Request Body:', body);
    console.log('==================================');

    if (isNaN(postIdNum)) {
      return NextResponse.json(
        {
          success: false,
          error: 'Invalid post ID',
          message: 'Post ID must be a number',
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
          message: 'Authentication required to create reply',
        },
        { status: 401 }
      );
    }

    // Validate required fields
    if (!body.content) {
      return NextResponse.json(
        {
          success: false,
          error: 'Missing required fields',
          message: 'Content is required',
        },
        { status: 400 }
      );
    }

    // Verify post exists
    const post = await prisma.forum_posts.findUnique({
      where: { id: postIdNum },
      select: { id: true },
    });

    if (!post) {
      return NextResponse.json(
        {
          success: false,
          error: 'Post not found',
          message: 'Post not found',
        },
        { status: 404 }
      );
    }

    // If replying to another reply, verify parent reply exists
    if (body.parent_reply_id) {
      const parentReply = await prisma.forum_replies.findUnique({
        where: { id: parseInt(body.parent_reply_id) },
        select: { id: true },
      });

      if (!parentReply) {
        return NextResponse.json(
          {
            success: false,
            error: 'Parent reply not found',
            message: 'Parent reply not found',
          },
          { status: 404 }
        );
      }
    } // Create new reply
    const newReply = await prisma.forum_replies.create({
      data: {
        post_id: postIdNum,
        user_id: parseInt(session.user.id),
        parent_reply_id: body.parent_reply_id ? parseInt(body.parent_reply_id) : null,
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
            reply_id: newReply.id,
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
        reply: {
          id: newReply.id,
          content: newReply.content,
          content_type: newReply.content_type,
          created_at: newReply.created_at,
          updated_at: newReply.updated_at,
          parent_reply_id: newReply.parent_reply_id,
          author: {
            id: newReply.app_user?.id,
            nama_lengkap: newReply.app_user?.nama_lengkap,
            profile_picture_url: newReply.app_user?.profile_picture_url,
          },
          attachments: attachments.map(attachment => ({
            id: attachment.id,
            file_name: attachment.file_name,
            file_url: attachment.file_url,
            file_size: attachment.file_size,
          })),
          nested_replies: [],
        },
      },
      message: 'Reply created successfully',
    });
  } catch (error) {
    console.error('Error creating forum reply:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Database error',
        message: 'Failed to create forum reply',
      },
      { status: 500 }
    );
  }
}
