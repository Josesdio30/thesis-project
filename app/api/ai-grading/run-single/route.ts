import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/auth';
import { getAcsAssignmentByAssignmentId } from '@/lib/db2/acs-repo';
import { resolveProviderName } from '@/lib/ai';
import { getAcsLocalAssignmentByAssignmentId } from '@/lib/ai-local/acs-local-repo';
import { gradeStudentAnswer } from '@/lib/grading-service';
import { canUseFeature } from '@/lib/feature-access';
import { Rubric } from '@/lib/types';
import { isAiInstructorRole } from '@/lib/auth/ai-role';

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    if (!isAiInstructorRole(session.user.role)) {
      return NextResponse.json(
        { success: false, error: 'Forbidden: Teachers only' },
        { status: 403 }
      );
    }

    let body: Record<string, unknown>;
    try {
      body = (await request.json()) as Record<string, unknown>;
    } catch {
      return NextResponse.json(
        { success: false, error: 'Invalid JSON body' },
        { status: 400 }
      );
    }
    const { assignmentId, studentId, questionId, studentAnswer, questionText } = body as {
      assignmentId: string;
      studentId: string;
      questionId: string;
      studentAnswer: string;
      /** Optional. Improves local retrieval; ignored on the OpenAI path. */
      questionText?: string;
    };

    // 1. Get ACS Config & Rubric for the active provider
    const provider = resolveProviderName();
    const isLocal = provider === 'local';
    const acsData = isLocal
      ? await getAcsLocalAssignmentByAssignmentId(assignmentId)
      : await getAcsAssignmentByAssignmentId(assignmentId);

    if (!acsData) {
      return NextResponse.json({ success: false, error: 'ACS configuration not found' }, { status: 404 });
    }

    const groundingRef = isLocal
      ? (acsData as { corpus_id: string | null }).corpus_id
      : (acsData as { vector_store_id: string }).vector_store_id;

    if (!groundingRef) {
      return NextResponse.json(
        { success: false, error: 'No course-material corpus is attached to this assignment' },
        { status: 409 }
      );
    }

    const access = await canUseFeature(acsData.course_id, 'ai_grading');
    if (!access.allowed) {
      return NextResponse.json({ success: false, error: access.reason }, { status: 403 });
    }

    // Type assertion for the stored JSONB
    const rawRubric = acsData.rubric;
    let questionRubric: any = null;

    if (Array.isArray(rawRubric)) {
      // Use == (loose) to handle number/string mismatch from JSONB vs DB
      questionRubric = rawRubric.find((r: any) => r.questionId == questionId) ?? null;
    } else if (rawRubric) {
      questionRubric = rawRubric;
    }

    if (!questionRubric) {
        return NextResponse.json({ success: false, error: 'Rubric for question not found' }, { status: 400 });
    }

    // 2. Run Grading
    const result = await gradeStudentAnswer({
      assignmentId,
      studentId,
      questionId,
      studentAnswer,
      rubric: questionRubric,
      groundingRef,
      questionText,
      teacherId: session.user.id,
      teacherName: session.user.name ?? undefined,
    });

    return NextResponse.json({ success: true, data: result });

  } catch (error: any) {
    console.error('Error in run-single:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
