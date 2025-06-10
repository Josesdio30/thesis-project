import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// PUT /api/courses/[code]/sessions/[sessionId]/materials/[id]
export async function PUT(
  request: NextRequest,
  { params }: { params: { code: string; sessionId: string; id: string } }
) {
  try {
    const { code, sessionId, id } = params;
    const body = await request.json();
    const { title, content } = body;

    if (!title || title.trim().length === 0) {
      return NextResponse.json({ success: false, error: 'Title is required' }, { status: 400 });
    }

    const material = await prisma.materials.findFirst({
      where: {
        id: parseInt(id),
        session_id: parseInt(sessionId),
        sessions: {
          class_courses: {
            courses: {
              course_code: code,
            },
          },
        },
      },
    });

    if (!material) {
      return NextResponse.json({ success: false, error: 'Material not found' }, { status: 404 });
    }

    // Update the material
    const updatedMaterial = await prisma.materials.update({
      where: { id: parseInt(id) },
      data: {
        title: title.trim(),
        content: content?.trim() || null,
      },
    });

    return NextResponse.json({
      success: true,
      data: updatedMaterial,
    });
  } catch (error) {
    console.error('Error updating material:', error);
    return NextResponse.json({ success: false, error: 'Failed to update material' }, { status: 500 });
  }
}

// DELETE /api/courses/[code]/sessions/[sessionId]/materials/[id]
export async function DELETE(
  request: NextRequest,
  { params }: { params: { code: string; sessionId: string; id: string } }
) {
  try {
    const { code, sessionId, id } = params;

    const material = await prisma.materials.findFirst({
      where: {
        id: parseInt(id),
        session_id: parseInt(sessionId),
        sessions: {
          class_courses: {
            courses: {
              course_code: code,
            },
          },
        },
      },
    });

    if (!material) {
      return NextResponse.json({ success: false, error: 'Material not found' }, { status: 404 });
    }

    // Delete the material
    await prisma.materials.delete({
      where: { id: parseInt(id) },
    });

    await prisma.$executeRaw`
      UPDATE materials 
      SET material_order = material_order - 1 
      WHERE session_id = ${parseInt(sessionId)} 
      AND material_order > ${material.material_order}
    `;

    return NextResponse.json({
      success: true,
      message: 'Material deleted successfully',
    });
  } catch (error) {
    console.error('Error deleting material:', error);
    return NextResponse.json({ success: false, error: 'Failed to delete material' }, { status: 500 });
  }
}
