import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/auth';
import { prisma } from '@/lib/prisma';
import { getOpenAI } from '@/lib/openai';
import {
  getAcsAssignmentByAssignmentId,
  insertUploadedFiles,
} from '@/lib/db2/acs-repo';
import { resolveProviderName } from '@/lib/ai';
import { getAcsLocalAssignmentByAssignmentId } from '@/lib/ai-local/acs-local-repo';
import {
  addFileToAssignmentCorpus,
  CorpusNotConfiguredError,
  UnprocessableFileError,
} from '@/lib/ai-local/rag/ingest';
import { isAiInstructorRole } from '@/lib/auth/ai-role';
import path from 'path';
import fs from 'fs';
import os from 'os';

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

    // 2. Parse Form Data
    const formData = await request.formData();
    const file = formData.get('file') as File;
    const assignmentId = formData.get('assignmentId') as string;

    if (!file || !assignmentId) {
      return NextResponse.json({ success: false, error: 'Missing file or assignmentId' }, { status: 400 });
    }

    if (resolveProviderName() === 'local') {
      // Awaited so a rethrown infrastructure error reaches the 500 handler below.
      return await uploadToLocalCorpus(assignmentId, file);
    }

    // 3. Get Vector Store ID from DB2
    const assignmentData = await getAcsAssignmentByAssignmentId(assignmentId);

    if (!assignmentData) {
      return NextResponse.json({ success: false, error: 'Assignment not found or ACS not configured' }, { status: 404 });
    }

    const vectorStoreId = assignmentData.vector_store_id;

    // 4. Save file temporarily to upload to OpenAI
    const tempDir = os.tmpdir();
    const tempFilePath = path.join(tempDir, `${Date.now()}_${file.name}`);
    
    // Write file to temp
    const buffer = Buffer.from(await file.arrayBuffer());
    await fs.promises.writeFile(tempFilePath, buffer);

    const openai = await getOpenAI();

    try {
        // 5. Upload to OpenAI
        const fileStream = fs.createReadStream(tempFilePath);
        const openaiFile = await openai.files.create({
            file: fileStream,
            purpose: 'assistants',
        });

        // 6. Attach to Vector Store
        await openai.vectorStores.files.create(vectorStoreId, {
            file_id: openaiFile.id
        });

        // 7. Record in DB2
        try {
          await insertUploadedFiles([
            {
              assignment_id: assignmentId,
              file_id: openaiFile.id,
              filename: file.name,
            },
          ]);
        } catch (dbError) {
            console.error('Error saving file record to DB2:', dbError);
        }

        return NextResponse.json({
            success: true,
            data: {
                file_id: openaiFile.id,
                filename: file.name
            }
        });

    } finally {
        // Cleanup temp file
        if (fs.existsSync(tempFilePath)) {
            await fs.promises.unlink(tempFilePath);
        }
    }

  } catch (error: any) {
    console.error('Error uploading file:', error);
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

const NOT_CONFIGURED = { success: false, error: 'Assignment not found or ACS not configured' } as const;

async function uploadToLocalCorpus(assignmentId: string, file: File): Promise<NextResponse> {
  const localAssignment = await getAcsLocalAssignmentByAssignmentId(assignmentId);
  if (!localAssignment) {
    return NextResponse.json(NOT_CONFIGURED, { status: 404 });
  }

  try {
    const result = await addFileToAssignmentCorpus({
      assignmentId,
      fileName: file.name,
      buffer: Buffer.from(await file.arrayBuffer()),
    });
    // Same shape as the OpenAI branch; file_id is a rag_documents id here.
    return NextResponse.json({ success: true, data: { file_id: result.document_id, filename: file.name } });
  } catch (error) {
    if (error instanceof CorpusNotConfiguredError) {
      return NextResponse.json(NOT_CONFIGURED, { status: 404 });
    }
    if (error instanceof UnprocessableFileError) {
      // Fixed text only: parser errors can carry internal paths and library detail.
      console.error('[RAG] rejected uploaded file:', error);
      return NextResponse.json(
        {
          success: false,
          error: 'File could not be indexed',
          details: 'Unsupported file type or no extractable text. Supported: pdf, docx, pptx, txt, md.',
        },
        { status: 400 }
      );
    }
    throw error;
  }
}
