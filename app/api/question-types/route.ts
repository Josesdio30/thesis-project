import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(request: NextRequest) {
  try {
    const questionTypes = await prisma.enumeration.findMany({
      where: {
        category: 'QUESTION_TYPE',
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

    return NextResponse.json(questionTypes);
  } catch (error) {
    console.error('Error fetching question types:', error);
    return NextResponse.json({ error: 'Failed to fetch question types' }, { status: 500 });
  }
}
