import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/auth';

// GET - Get forum for a course (session-based)
export async function GET(req: NextRequest) {
  // Dummy response forum
  return NextResponse.json({
    success: true,
    forums: [
      { id: 1, title: 'Forum 1', author: 'Guru A' },
      { id: 2, title: 'Forum 2', author: 'Guru B' },
    ],
  });
}
