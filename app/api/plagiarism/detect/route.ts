
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/auth';
import { initDetection, processDetection } from '@/lib/plagiarism/detection';
import { prisma } from '@/lib/prisma';
import { canUseFeature } from '@/lib/feature-access';
import { isAiInstructorRole } from '@/lib/auth/ai-role';

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);

    if (!session || !session.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const role = (session.user.role || '').toUpperCase();
    if (!isAiInstructorRole(role)) {
       return NextResponse.json({ error: 'Forbidden: Teachers only' }, { status: 403 });
    }

    let body: Record<string, unknown>;
    try {
      body = (await request.json()) as Record<string, unknown>;
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }
    const { assignmentId, questionIds } = body as {
      assignmentId?: string;
      questionIds?: unknown;
    };

    if (!assignmentId) {
      return NextResponse.json({ error: 'Missing assignmentId' }, { status: 400 });
    }

    // Enforce feature access for teachers (admins bypass).
    if (!role.includes('ADMIN')) {
      const assignment = await prisma.assignments.findUnique({
        where: { id: parseInt(assignmentId, 10) },
        include: { sessions: { include: { class_courses: true } } },
      });
      const courseId = assignment?.sessions?.class_courses?.course_id;
      if (!courseId) {
        return NextResponse.json(
          { error: 'Could not resolve course for assignment' },
          { status: 400 }
        );
      }
      const access = await canUseFeature(String(courseId), 'plagiarism');
      if (!access.allowed) {
        return NextResponse.json({ error: access.reason }, { status: 403 });
      }
    }

    // questionIds: string[] — empty or missing means "all essay questions"
    const normalizedQuestionIds: string[] = Array.isArray(questionIds) ? questionIds : [];

    const detectionId = await initDetection(assignmentId, session.user.id, normalizedQuestionIds);

    processDetection(detectionId, assignmentId, session.user.id, normalizedQuestionIds).catch(err => {
      console.error('[PDS] Background detection error:', err);
    });

    return NextResponse.json({ detectionId });

  } catch (error: any) {
    console.error('API Error:', error);
    return NextResponse.json(
      { error: 'Internal Server Error', details: error.message },
      { status: 500 }
    );
  }
}
