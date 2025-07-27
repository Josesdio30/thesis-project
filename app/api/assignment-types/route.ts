import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(request: NextRequest) {
  try {
    const assignmentTypes = await prisma.enumeration.findMany({
      where: {
        category: 'ASSIGNMENT_TYPE',
      },
      select: {
        id: true,
        name: true,
        alt_name: true,
      },
      orderBy: {
        id: 'asc',
      },
    });

    return NextResponse.json(assignmentTypes);
  } catch (error) {
    console.error('Error fetching assignment types:', error);
    return NextResponse.json({ error: 'Failed to fetch assignment types' }, { status: 500 });
  }
}
