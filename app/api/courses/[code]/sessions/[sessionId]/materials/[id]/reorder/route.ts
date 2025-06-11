import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// PATCH /api/courses/[code]/sessions/[sessionId]/materials/[id]/reorder
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ code: string; sessionId: string; id: string }> }
) {
  try {
    const { code, sessionId, id } = await params;
    const body = await request.json();
    const { direction } = body;

    if (!direction || !['up', 'down'].includes(direction)) {
      return NextResponse.json({ success: false, error: 'Invalid direction. Must be "up" or "down"' }, { status: 400 });
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

    const currentOrder = material.material_order;
    let targetOrder: number;

    if (direction === 'up') {
      targetOrder = currentOrder - 1;
      if (targetOrder < 1) {
        return NextResponse.json({ success: false, error: 'Material is already at the top' }, { status: 400 });
      }
    } else {
      targetOrder = currentOrder + 1;

      const maxOrder = await prisma.materials.findFirst({
        where: { session_id: parseInt(sessionId) },
        orderBy: { material_order: 'desc' },
        select: { material_order: true },
      });

      if (!maxOrder || targetOrder > maxOrder.material_order) {
        return NextResponse.json({ success: false, error: 'Material is already at the bottom' }, { status: 400 });
      }
    }

    const targetMaterial = await prisma.materials.findFirst({
      where: {
        session_id: parseInt(sessionId),
        material_order: targetOrder,
      },
    });

    if (!targetMaterial) {
      return NextResponse.json({ success: false, error: 'No material found at target position' }, { status: 400 });
    }

    await prisma.$transaction([
      prisma.materials.update({
        where: { id: parseInt(id) },
        data: { material_order: targetOrder },
      }),
      prisma.materials.update({
        where: { id: targetMaterial.id },
        data: { material_order: currentOrder },
      }),
    ]);

    return NextResponse.json({
      success: true,
      message: 'Material reordered successfully',
    });
  } catch (error) {
    console.error('Error reordering material:', error);
    return NextResponse.json({ success: false, error: 'Failed to reorder material' }, { status: 500 });
  }
}
