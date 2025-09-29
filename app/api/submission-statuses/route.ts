import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(request: NextRequest) {
  try {
    const submissionStatuses = await prisma.enumeration.findMany({
      where: {
        category: 'SUBMISSION_STATUS',
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

    return NextResponse.json(submissionStatuses);
  } catch (error) {
    console.error('Error fetching submission statuses:', error);
    return NextResponse.json({ error: 'Failed to fetch submission statuses' }, { status: 500 });
  }
}
