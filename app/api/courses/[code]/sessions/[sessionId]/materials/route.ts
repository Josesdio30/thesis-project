import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// GET /api/courses/[code]/sessions/[sessionId]/materials
export async function GET(request: NextRequest, { params }: { params: Promise<{ code: string; sessionId: string }> }) {
  try {
    const { code, sessionId } = await params;

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
      return NextResponse.json({ success: false, error: 'Session not found' }, { status: 404 });
    }

    // Fetch materials for the session
    const materials = await prisma.materials.findMany({
      where: {
        session_id: parseInt(sessionId),
      },
      orderBy: {
        material_order: 'asc',
      },
    });

    return NextResponse.json({
      success: true,
      data: materials,
    });
  } catch (error) {
    console.error('Error fetching materials:', error);
    return NextResponse.json({ success: false, error: 'Failed to fetch materials' }, { status: 500 });
  }
}

// POST /api/courses/[code]/sessions/[sessionId]/materials
export async function POST(request: NextRequest, { params }: { params: Promise<{ code: string; sessionId: string }> }) {
  try {
    const { code, sessionId } = await params;
    const body = await request.json();
    const { title, content } = body;

    if (!title || title.trim().length === 0) {
      return NextResponse.json({ success: false, error: 'Title is required' }, { status: 400 });
    }

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
      return NextResponse.json({ success: false, error: 'Session not found' }, { status: 404 });
    }

    const lastMaterial = await prisma.materials.findFirst({
      where: { session_id: parseInt(sessionId) },
      orderBy: { material_order: 'desc' },
    });

    const nextOrder = lastMaterial ? lastMaterial.material_order + 1 : 1;

    // Create the material
    const material = await prisma.materials.create({
      data: {
        session_id: parseInt(sessionId),
        title: title.trim(),
        content: content?.trim() || null,
        material_order: nextOrder,
      },
    });

    return NextResponse.json({
      success: true,
      data: material,
    });
  } catch (error) {
    console.error('Error creating material:', error);
    return NextResponse.json({ success: false, error: 'Failed to create material' }, { status: 500 });
  }
}
