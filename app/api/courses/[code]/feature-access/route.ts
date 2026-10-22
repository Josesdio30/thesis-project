import { NextRequest, NextResponse } from 'next/server';
import { courseService } from '@/lib/prisma-services';
import { isScopeEnabled } from '@/lib/db2/admin-repo';
import { ApiResponse } from '@/types';

interface FeatureAccess {
  ai_grading: boolean;
  plagiarism: boolean;
}

export async function GET(_request: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  try {
    const { code } = await params;

    const course = await courseService.findByCode(code);
    if (!course) {
      const response: ApiResponse<null> = {
        success: false,
        error: 'Not found',
        message: 'Course not found',
      };
      return NextResponse.json(response, { status: 404 });
    }

    const courseId = String(course.id);
    const [aiGrading, plagiarism] = await Promise.all([
      isScopeEnabled('course', courseId, 'ai_grading'),
      isScopeEnabled('course', courseId, 'plagiarism'),
    ]);

    const response: ApiResponse<FeatureAccess> = {
      success: true,
      data: { ai_grading: aiGrading, plagiarism },
    };
    return NextResponse.json(response);
  } catch (error) {
    console.error('Error fetching course feature access:', error);
    const response: ApiResponse<null> = {
      success: false,
      error: 'Internal server error',
      message: 'Failed to fetch feature access',
    };
    return NextResponse.json(response, { status: 500 });
  }
}
