import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/auth';
import { prisma } from '@/lib/prisma';
import { isAdminRole, isTeacherRole, requireCourseManager } from '@/lib/auth/course-access';
import {
  getAcsAssignmentByAssignmentId,
  getUploadedFilesByResourceIds,
  insertUploadedFiles,
  upsertAcsAssignment,
} from '@/lib/db2/acs-repo';
import fs from 'fs';
import path from 'path';
import { getOpenAI } from '@/lib/openai';
import { resolveProviderName } from '@/lib/ai';
import { createLocalCorpus } from '@/lib/ai-local/rag/ingest';
import {
  getAcsLocalAssignmentByAssignmentId,
  upsertAcsLocalAssignment,
} from '@/lib/ai-local/acs-local-repo';

export async function POST(request: NextRequest) {
  try {
    // 1. Auth Check
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    // 2. Validate Instructor Role
    const userDetails = await prisma.app_user.findUnique({
      where: { id: parseInt(session.user.id) },
      include: { app_user_role: { include: { enumeration: true } } },
    });

    const isInstructor = userDetails?.app_user_role?.some(
      role => (isTeacherRole(role.enumeration?.name) || isAdminRole(role.enumeration?.name)) && role.is_active
    );

    if (!isInstructor) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }

    // 3. Parse Body
    const body = await request.json();
    const { assignmentId, courseId, rubric, resourceIds } = body;

    if (!assignmentId || !courseId || !rubric) {
      return NextResponse.json({ success: false, error: 'Missing required fields' }, { status: 400 });
    }

    const assignmentKey = Number(assignmentId);
    if (!Number.isSafeInteger(assignmentKey) || assignmentKey <= 0) {
      return NextResponse.json({ success: false, error: 'Invalid assignmentId' }, { status: 400 });
    }
    const assignment = await prisma.assignments.findUnique({
      where: { id: assignmentKey },
      select: {
        sessions: { select: {
          class_course_id: true,
          class_courses: { select: { teacher_id: true, course_id: true, courses: { select: { course_code: true } } } },
        } },
      },
    });
    const classCourse = assignment?.sessions?.class_courses;
    const access = await requireCourseManager(async () => classCourse ? [classCourse.teacher_id] : []);
    if (!access.ok) return access.response;
    const classCourseId = assignment?.sessions?.class_course_id;
    if (!classCourse || classCourseId == null || classCourse.course_id == null) {
      return NextResponse.json({ success: false, error: 'Assignment course not found' }, { status: 404 });
    }
    // The UI normally sends a numeric course id and falls back to its code.
    // Both must match the assignment's persisted parent, never define it.
    if (String(courseId) !== String(classCourse.course_id) && String(courseId) !== classCourse.courses?.course_code) {
      return NextResponse.json({ success: false, error: 'Course does not match assignment' }, { status: 400 });
    }

    // resourceIds is required — user must explicitly choose which materials to use
    const selectedResourceIds: number[] = Array.isArray(resourceIds) ? [...new Set<number>(resourceIds)] : [];
    if (selectedResourceIds.length === 0) {
      return NextResponse.json(
        { success: false, error: 'No materials selected', details: 'Select at least one course material file to use as grading reference.' },
        { status: 422 }
      );
    }
    if (selectedResourceIds.some(id => !Number.isSafeInteger(id) || id <= 0)) {
      return NextResponse.json({ success: false, error: 'Invalid resourceIds' }, { status: 400 });
    }

    // 4. Fetch only the selected resources from LMS DB
    const courseResources = await prisma.resources.findMany({
      where: { id: { in: selectedResourceIds }, sessions: { class_course_id: classCourseId } },
      select: { id: true, file_url: true, file_name: true, file_type: true },
    });

    if (courseResources.length === 0) {
      return NextResponse.json(
        { success: false, error: 'No valid resources found for the given IDs' },
        { status: 422 }
      );
    }
    if (courseResources.length !== selectedResourceIds.length) {
      return NextResponse.json(
        { success: false, error: 'Every selected resource must belong to the assignment class course' },
        { status: 422 }
      );
    }

    const provider = resolveProviderName();
    const existingAssignment =
      provider === 'local'
        ? await getAcsLocalAssignmentByAssignmentId(assignmentKey.toString())
        : await getAcsAssignmentByAssignmentId(assignmentKey.toString());
    const isRerun = Boolean(existingAssignment);

    const rerunFieldsFor = (rerun: boolean) =>
      rerun
        ? { rerun_grading: true, rerun_grading_at: new Date().toISOString(), archived_at: null }
        : { rerun_grading: false, rerun_grading_at: null, archived_at: null };

    if (provider === 'local') {
      const corpus = await createLocalCorpus({
        assignmentId: assignmentKey.toString(),
        courseId: courseId.toString(),
        createdBy: session.user.id,
        resources: courseResources.map(r => ({
          id: r.id,
          file_url: r.file_url,
          file_name: r.file_name,
        })),
      });

      if (corpus.files_indexed === 0) {
        return NextResponse.json(
          {
            success: false,
            error: 'Course materials could not be indexed',
            details: corpus.warning ?? 'None of the selected files produced any usable text.',
          },
          { status: 422 }
        );
      }

      const localRecord = await upsertAcsLocalAssignment({
        assignment_id: assignmentKey.toString(),
        course_id: courseId.toString(),
        corpus_id: corpus.corpus_id,
        rubric,
        created_by: session.user.id,
        status: 'setup',
        ...rerunFieldsFor(isRerun),
      });

      return NextResponse.json({
        success: true,
        data: {
          acs_assignment_id: localRecord.id,
          // Key name preserved so AutoGradingModal needs no change; the value
          // is a rag_corpora id rather than an OpenAI vector store id.
          vector_store_id: corpus.corpus_id,
          files_reused: corpus.files_reused,
          files_uploaded: corpus.files_uploaded,
          files_indexed: corpus.files_indexed,
          files_failed: corpus.files_failed,
          ...(corpus.warning ? { warning: corpus.warning } : {}),
        },
      });
    }

    // `getOpenAI()` rather than `new OpenAI()`: the latter ignores the
    // admin-managed credential in `api_credential` and only ever reads the env
    // var, so a key rotated through the admin UI had no effect here.
    const openai = await getOpenAI();

    // 5. Cross-assignment dedup: look up existing OpenAI files by resource_id
    //    This avoids re-uploading the same course material for different assignments.
    const existingUploads = await getUploadedFilesByResourceIds(selectedResourceIds);
    const existingByResourceId = new Map(existingUploads.map(f => [f.resource_id!, f.file_id]));

    const allFileIds: string[] = [];
    const newFileRecords: { resource_id: number; file_id: string; filename: string; type_file: string }[] = [];

    for (const resource of courseResources) {
      // Check if this resource was already uploaded to OpenAI (by any assignment)
      if (existingByResourceId.has(resource.id)) {
        const existingId = existingByResourceId.get(resource.id)!;
        try {
          await openai.files.retrieve(existingId);
          allFileIds.push(existingId);
          continue; // still valid on OpenAI, reuse
        } catch {
          console.warn(`OpenAI file ${existingId} for resource ${resource.id} no longer exists, re-uploading`);
        }
      }

      // Upload file
      const localFilePath = path.join(process.cwd(), 'public', resource.file_url);
      if (!fs.existsSync(localFilePath)) {
        console.warn(`File not found on disk: ${localFilePath}`);
        continue;
      }

      try {
        const openaiFile = await openai.files.create({
          file: fs.createReadStream(localFilePath),
          purpose: 'assistants',
        });
        allFileIds.push(openaiFile.id);
        const ext = path.extname(resource.file_name).toLowerCase();
        newFileRecords.push({
          resource_id: resource.id,
          file_id: openaiFile.id,
          filename: resource.file_name,
          type_file: resource.file_type ?? ext.replace('.', '') ?? 'unknown',
        });
      } catch (err) {
        console.error(`Failed to upload resource ${resource.id} to OpenAI:`, err);
      }
    }

    // 6. Guard: abort if no files are available
    if (allFileIds.length === 0) {
      return NextResponse.json(
        { success: false, error: 'No course materials available', details: 'None of the selected files could be loaded or uploaded.' },
        { status: 422 }
      );
    }

    // 7. Delete old Vector Store if rerun
    if (isRerun && existingAssignment && 'vector_store_id' in existingAssignment) {
      try {
        await openai.vectorStores.delete(existingAssignment.vector_store_id);
      } catch (e) {
        console.warn('Failed to delete old vector store during rerun:', e);
      }
    }

    // 8. Create new Vector Store
    const vectorStore = await openai.vectorStores.create({
      name: `VS_${courseId}_${assignmentId}`,
    });

    // 9. Attach files and wait for indexing
    let filesIndexed = 0;
    let filesFailed = 0;
    try {
      const batch = await openai.vectorStores.fileBatches.createAndPoll(vectorStore.id, {
        file_ids: allFileIds,
      });
      filesIndexed = batch.file_counts.completed;
      filesFailed = batch.file_counts.failed;
    } catch (e) {
      console.error('Failed to attach files to vector store:', e);
      await openai.vectorStores.delete(vectorStore.id);
      return NextResponse.json(
        { success: false, error: 'Failed to index course materials', details: String(e) },
        { status: 502 }
      );
    }

    if (filesIndexed === 0) {
      await openai.vectorStores.delete(vectorStore.id);
      return NextResponse.json(
        {
          success: false,
          error: 'Course materials could not be indexed',
          details: `${filesFailed} file(s) failed to be processed by OpenAI.`,
        },
        { status: 502 }
      );
    }

    // 10. Save to DB
    const rerunFields = rerunFieldsFor(isRerun);

    let data;
    try {
      data = await upsertAcsAssignment({
        assignment_id: assignmentKey.toString(),
        course_id: courseId.toString(),
        vector_store_id: vectorStore.id,
        rubric,
        created_by: session.user.id,
        status: 'setup',
        ...rerunFields,
      });
    } catch (error: any) {
      await openai.vectorStores.delete(vectorStore.id);
      console.error('DB2 error:', error);
      return NextResponse.json(
        { success: false, error: 'Database error', details: error?.message ?? String(error) },
        { status: 500 }
      );
    }

    // 11. Save newly uploaded file records (with resource_id for future dedup)
    if (newFileRecords.length > 0) {
      try {
        await insertUploadedFiles(
          newFileRecords.map(rec => ({
            assignment_id: assignmentKey.toString(),
            resource_id: rec.resource_id,
            file_id: rec.file_id,
            filename: rec.filename,
            type_file: rec.type_file,
          }))
        );
      } catch (fileError) {
        console.error('Failed to record uploaded files in DB:', fileError);
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        acs_assignment_id: data.id,
        vector_store_id: vectorStore.id,
        files_reused: allFileIds.length - newFileRecords.length,
        files_uploaded: newFileRecords.length,
        files_indexed: filesIndexed,
        files_failed: filesFailed,
        ...(filesFailed > 0 && {
          warning: `${filesFailed} file(s) failed to index and will not be used during grading.`,
        }),
      },
    });

  } catch (error: any) {
    console.error('Error creating assignment setup:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error', message: error.message },
      { status: 500 }
    );
  }
}
