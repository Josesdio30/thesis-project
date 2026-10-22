
import { requireCourseManager, teacherIdsForAssignment } from '@/lib/auth/course-access';
import { NextResponse } from 'next/server';
import { resolveProviderName } from '@/lib/ai';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/auth';
import { queryLMS } from '@/lib/lms-db';
import { getComparisonsBySubmissionIds, pdsTables } from '@/lib/db2/pds-repo';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ assignmentId: string }> }
) {
  try {
    const tables = pdsTables(resolveProviderName());
    const session = await getServerSession(authOptions);
    if (!session || !session.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { assignmentId } = await params;

    // 1. Fetch Students
    const numericId = parseInt(assignmentId, 10);
    const access = await requireCourseManager(() => teacherIdsForAssignment(numericId));
    if (!access.ok) return access.response;
    const sql = `
      SELECT 
        s.id::text as submission_id,
        s.student_id::text as student_id,
        u.nama_lengkap as student_name
      FROM assignment_submissions s
      JOIN app_user u ON s.student_id = u.id
      WHERE s.assignment_id = $1
    `;
    const submissions = await queryLMS(sql, [numericId]);
    const submissionIds = submissions.map(s => s.submission_id);

    // 2. Fetch Comparisons
    const comparisons = await getComparisonsBySubmissionIds(submissionIds, tables);

    // 3. Transform to CSV-friendly format
    // Row per match: Source Name, Target Name, Similarity %, Risk Level
    
    // Create Map for quick name lookup
    const nameMap = new Map<string, string>();
    submissions.forEach(s => nameMap.set(s.submission_id, s.student_name));

    // Resolve Target Names as well (some targets might be from other assignments/years if we expand later, 
    // but for now targets are likely in the same set if internal check. 
    // Wait, compareSubmissions in detection.ts only compared within the same assignment batch. 
    // So targets are in 'submissions' list.
    
    const rows = comparisons.map(comp => ({
      SourceStudent: nameMap.get(comp.source_submission_id) || 'Unknown',
      TargetStudent: nameMap.get(comp.target_submission_id) || 'Unknown',
      Similarity: (comp.combined_score * 100).toFixed(2) + '%',
      RiskLevel: comp.risk_level
    }));

    // 4. Generate CSV String
    const header = 'Source Student,Target Student,Similarity,Risk Level\n';
    const csvContent = rows.map(r => 
      `"${r.SourceStudent}","${r.TargetStudent}","${r.Similarity}","${r.RiskLevel}"`
    ).join('\n');

    const csv = header + csvContent;

    return new NextResponse(csv, {
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename="plagiarism-report-${assignmentId}.csv"`,
      },
    });

  } catch (error: any) {
    console.error('API Error:', error);
    return NextResponse.json(
      { error: 'Internal Server Error', details: error.message },
      { status: 500 }
    );
  }
}
