import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/auth';
import { prisma } from '@/lib/prisma';
import { getOpenAI } from '@/lib/openai';
import { getUploadedFilesByResourceIds } from '@/lib/db2/acs-repo';
import { resolveProviderName } from '@/lib/ai';
import {
  checkLocalResources,
  type CheckFilesResponse,
  type CheckResource,
  type FileCheckResult,
} from '@/lib/ai-local/rag/check';
import path from 'path';
import fs from 'fs';

// Defined in the lib module so the local check and this route share one type.
export type { FileCheckResult, CheckFilesResponse };

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { resourceIds } = body;

    if (!Array.isArray(resourceIds) || resourceIds.length === 0) {
      return NextResponse.json({ success: false, error: 'Missing resourceIds' }, { status: 400 });
    }

    // 1. Fetch resource metadata from LMS DB
    const resources = await prisma.resources.findMany({
      where: { id: { in: resourceIds.map(Number) } },
      select: { id: true, file_url: true, file_name: true },
    });

    // Same response contract either way: AutoGradingModal reads only the
    // per-file status and the summary computed below.
    const files =
      resolveProviderName() === 'local'
        ? await checkLocalResources(resources)
        : await checkOpenAiResources(resources, resourceIds.map(Number));

    const summary = {
      ok: files.filter(f => f.status === 'ok').length,
      missing_openai: files.filter(f => f.status === 'missing_openai').length,
      missing_local: files.filter(f => f.status === 'missing_local').length,
      new: files.filter(f => f.status === 'new').length,
    };

    const can_proceed = files.some(f =>
      f.status === 'ok' ||
      f.status === 'missing_openai' ||
      (f.status === 'new' && f.local_exists)
    );

    return NextResponse.json({
      success: true,
      data: { files, summary, can_proceed } as CheckFilesResponse,
    });

  } catch (error: any) {
    console.error('Error in check-files:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error', message: error.message },
      { status: 500 }
    );
  }
}

async function checkOpenAiResources(resources: CheckResource[], resourceIds: number[]): Promise<FileCheckResult[]> {
  // 2. Cross-assignment lookup by resource_id
  const existingUploads = await getUploadedFilesByResourceIds(resourceIds);
  const uploadMap = new Map(existingUploads.map(f => [f.resource_id!, f.file_id]));

  // 3. Check each resource
  const files: FileCheckResult[] = [];
  const openai = await getOpenAI();

  await Promise.all(
    resources.map(async (resource) => {
      const localPath = resource.file_url;
      const absolutePath = path.join(process.cwd(), 'public', localPath);
      const localExists = fs.existsSync(absolutePath);
      const openaiFileId = uploadMap.get(resource.id) ?? null;

      let openaiExists = false;
      if (openaiFileId) {
        try {
          await openai.files.retrieve(openaiFileId);
          openaiExists = true;
        } catch {
          openaiExists = false;
        }
      }

      let status: FileCheckResult['status'];
      if (openaiFileId && openaiExists) {
        status = 'ok';
      } else if (openaiFileId && !openaiExists && localExists) {
        status = 'missing_openai';
      } else if (openaiFileId && !openaiExists && !localExists) {
        status = 'missing_local';
      } else {
        status = 'new';
      }

      files.push({
        resource_id: resource.id,
        filename: resource.file_name,
        local_path: localPath,
        local_exists: localExists,
        openai_file_id: openaiFileId,
        openai_exists: openaiExists,
        status,
      });
    })
  );

  return files;
}
