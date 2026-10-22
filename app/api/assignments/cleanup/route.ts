import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/auth';
import { prisma } from '@/lib/prisma';
import { getOpenAI } from '@/lib/openai';
import {
  archiveAcsAssignment,
  getAcsAssignmentByAssignmentId,
  getUploadedFilesByAssignmentId,
} from '@/lib/db2/acs-repo';
import { resolveProviderName } from '@/lib/ai';
import { archiveAcsLocalAssignment, getAcsLocalAssignmentByAssignmentId } from '@/lib/ai-local/acs-local-repo';
import { isAiInstructorRole } from '@/lib/auth/ai-role';

export async function POST(request: NextRequest) {
  try {
    // 1. Auth Check
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const userDetails = await prisma.app_user.findUnique({
      where: { id: parseInt(session.user.id) },
      include: { app_user_role: { include: { enumeration: true } } },
    });

    // Shared helper so GURU (Indonesian for teacher) is accepted alongside TEACHER/ADMIN.
    const isInstructor = userDetails?.app_user_role?.some(
      role => role.is_active && isAiInstructorRole(role.enumeration?.name)
    );

    if (!isInstructor) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }

    // 2. Parse Body
    const body = await request.json();
    const { assignmentId } = body;

    if (!assignmentId) {
      return NextResponse.json({ success: false, error: 'Missing assignmentId' }, { status: 400 });
    }

    if (resolveProviderName() === 'local') {
      const localAssignment = await getAcsLocalAssignmentByAssignmentId(assignmentId);
      if (!localAssignment) {
        return NextResponse.json({ success: false, error: 'ACS Assignment not found' }, { status: 404 });
      }

      // The corpus is deliberately kept: local corpora cost nothing to retain,
      // and a later re-grade reuses its parsed and embedded documents.
      let assignmentStatusUpdate: 'success' | 'failed' = 'failed';
      try {
        await archiveAcsLocalAssignment(assignmentId, new Date().toISOString());
        assignmentStatusUpdate = 'success';
      } catch (updateError) {
        console.error('Failed to update local ACS assignment status to archived:', updateError);
      }

      return NextResponse.json({
        success: true,
        cleanupDetails: { provider: 'local', corpus: 'kept', assignmentStatusUpdate },
      });
    }

    // 3. Get ACS Assignment details and uploaded files
    const acsAssignment = await getAcsAssignmentByAssignmentId(assignmentId);

    if (!acsAssignment) {
      return NextResponse.json({ success: false, error: 'ACS Assignment not found' }, { status: 404 });
    }

    const uploadedFiles = await getUploadedFilesByAssignmentId(assignmentId);

    const filesToDelete = uploadedFiles?.map(f => f.file_id) || [];

    // 4. Delete OpenAI Resources
    const cleanupResults = {
        vectorStore: 'failed',
        files: [] as { fileId: string; status: string }[],
        assignmentStatusUpdate: 'failed'
    };

    const openai = await getOpenAI();

    try {
        // Delete Vector Store
        await openai.vectorStores.delete(acsAssignment.vector_store_id);
        cleanupResults.vectorStore = 'success';
    } catch (e: any) {
        if (e.status === 404) cleanupResults.vectorStore = 'not_found';
        console.warn(`Failed to delete Vector Store ${acsAssignment.vector_store_id}:`, e.message);
    }

    // Delete individual files
    for (const fileId of filesToDelete) {
      try{
        await openai.files.delete(fileId);
        cleanupResults.files.push({ fileId, status: 'success' });
      } catch (e: any) {
        if (e.status === 404) cleanupResults.files.push({ fileId, status: 'not_found' });
        else cleanupResults.files.push({ fileId, status: 'failed' });
        console.warn(`Failed to delete file ${fileId}:`, e.message);
      }
    }

    // 5. Update assignment status in DB2
    try {
        await archiveAcsAssignment(assignmentId, new Date().toISOString());
        cleanupResults.assignmentStatusUpdate = 'success';
    } catch (updateError) {
        console.error('Failed to update ACS assignment status to archived:', updateError);
    }

    return NextResponse.json({ success: true, cleanupDetails: cleanupResults });

  } catch (error: any) {
    console.error('Error during cleanup:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Internal server error',
        message: error.message,
      },
      { status: 500 }
    );
  }
}
