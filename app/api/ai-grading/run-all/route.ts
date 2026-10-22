import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/auth';
import { prisma } from '@/lib/prisma';
import {
  acsTables,
  createGradingJob,
  getAcsAssignmentByAssignmentId,
  updateGradingJobStatus,
} from '@/lib/db2/acs-repo';
import { gradeStudentAnswer } from '@/lib/grading-service';
import { getOpenAI } from '@/lib/openai';
import { resolveProviderName } from '@/lib/ai';
import { getAcsLocalAssignmentByAssignmentId } from '@/lib/ai-local/acs-local-repo';
import { canUseFeature } from '@/lib/feature-access';
import { isAiInstructorRole } from '@/lib/auth/ai-role';

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });

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
    const { assignmentId } = body as { assignmentId: string };

    // 1. Fetch ACS Config for the active provider
    const provider = resolveProviderName();
    const isLocal = provider === 'local';
    const acsData = isLocal
      ? await getAcsLocalAssignmentByAssignmentId(assignmentId)
      : await getAcsAssignmentByAssignmentId(assignmentId);

    if (!acsData) return NextResponse.json({ success: false, error: 'ACS Config not found' }, { status: 404 });

    const groundingRef = isLocal
      ? (acsData as { corpus_id: string | null }).corpus_id
      : (acsData as { vector_store_id: string }).vector_store_id;

    if (!groundingRef) {
      return NextResponse.json(
        { success: false, error: 'No course-material corpus is attached to this assignment' },
        { status: 409 }
      );
    }

    // 1b. Enforce feature access (the course must be enabled)
    const access = await canUseFeature(acsData.course_id, 'ai_grading');
    if (!access.allowed) {
      return NextResponse.json({ success: false, error: access.reason }, { status: 403 });
    }

    // 2. Fetch All Student Submissions from LMS DB
    const submissions = await prisma.assignment_submissions.findMany({
      where: { assignment_id: parseInt(assignmentId) },
      include: {
        // Question text materially improves local retrieval. Purely additive:
        // the OpenAI path ignores it.
        assignment_answers: { include: { assignment_questions: true } }
      }
    });

    if (submissions.length === 0) {
         return NextResponse.json({ success: false, message: 'No submissions found to grade' });
    }

    // 3. Create Job Record
    const tables = acsTables(provider);
    const jobData = await createGradingJob(
      {
        assignment_id: assignmentId,
        total_students: submissions.length,
        status: 'running',
      },
      tables
    );

    // 4. Start Background Processing (Fire and Forget or Queue)
    (async () => {
        try {
            const rawRubric = acsData.rubric;

            for (const sub of submissions) {
                for (const ans of sub.assignment_answers) {
                     let questionRubric: any = null;
                     if (Array.isArray(rawRubric)) {
                        // Use == (loose) to handle number/string mismatch from JSONB vs DB
                        questionRubric = rawRubric.find((r: any) => r.questionId == ans.question_id) ?? null;
                     } else if (rawRubric) {
                        questionRubric = rawRubric;
                     }

                     if (!questionRubric || !ans.answer_text) continue;

                     await gradeStudentAnswer({
                         assignmentId,
                         studentId: sub.student_id.toString(),
                         questionId: ans.question_id.toString(),
                         studentAnswer: ans.answer_text,
                         rubric: questionRubric,
                         groundingRef,
                         questionText: ans.assignment_questions?.question_text ?? undefined,
                         jobId: jobData.id,
                         teacherId: session.user.id,
                         teacherName: session.user.name ?? undefined,
                     });
                }
            }
            await updateGradingJobStatus(jobData.id, 'completed', new Date().toISOString(), tables);

        } catch (err) {
             console.error('Background grading failed:', err);
             await updateGradingJobStatus(jobData.id, 'failed', null, tables);
        } finally {
            // Auto-delete the vector store after grading — it is only needed
            // during grading and costs money to keep. A local corpus is durable
            // and free, so it is deliberately kept: re-grading needs no
            // re-indexing at all.
            if (!isLocal) {
                try {
                    const openai = await getOpenAI();
                    await openai.vectorStores.delete(groundingRef);
                } catch (e: any) {
                    if (e.status !== 404) console.warn('Failed to auto-delete VS after grading:', e.message);
                }
            }
        }
    })();

    return NextResponse.json({
      success: true,
      jobId: jobData.id,
      message: 'Grading started in background',
      provider,
      totalSubmissions: submissions.length,
    });

  } catch (error: any) {
    console.error('Error in run-all:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
