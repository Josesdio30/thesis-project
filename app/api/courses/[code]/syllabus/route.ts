import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { ApiResponse } from '@/types';

export async function GET(request: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  try {
    const { code } = await params;

    // Find the class_course by course code to get the syllabus
    const classCourse = await prisma.class_courses.findFirst({
      where: {
        courses: {
          course_code: code,
        },
      },
      include: {
        courses: {
          select: {
            course_code: true,
            course_name: true,
          },
        },
      },
    });

    if (!classCourse) {
      return NextResponse.json(
        {
          success: false,
          error: 'Course not found',
          message: 'Course not found',
        },
        { status: 404 }
      );
    }

    const response: ApiResponse<{
      syllabus: string | null;
      course_code: string;
      course_name: string;
    }> = {
      success: true,
      data: {
        syllabus: classCourse.syllabus,
        course_code: classCourse.courses?.course_code || code,
        course_name: classCourse.courses?.course_name || '',
      },
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error('Error fetching syllabus:', error);

    const response: ApiResponse<null> = {
      success: false,
      error: 'Internal server error',
      message: 'Failed to fetch syllabus',
    };

    return NextResponse.json(response, { status: 500 });
  }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  try {
    const { code } = await params;
    const body = await request.json();
    const { syllabus, updated_by } = body;

    // Find the class_course by course code
    const classCourse = await prisma.class_courses.findFirst({
      where: {
        courses: {
          course_code: code,
        },
      },
    });

    if (!classCourse) {
      return NextResponse.json(
        {
          success: false,
          error: 'Course not found',
          message: 'Course not found',
        },
        { status: 404 }
      );
    }

    // Update the syllabus
    const updatedClassCourse = await prisma.class_courses.update({
      where: {
        id: classCourse.id,
      },
      data: {
        syllabus: syllabus,
        // Note: updated_by field doesn't exist in class_courses table,
        // but we can still accept it in the request for future use
      },
      include: {
        courses: {
          select: {
            course_code: true,
            course_name: true,
          },
        },
      },
    });

    const response: ApiResponse<{
      syllabus: string | null;
      course_code: string;
      course_name: string;
    }> = {
      success: true,
      data: {
        syllabus: updatedClassCourse.syllabus,
        course_code: updatedClassCourse.courses?.course_code || code,
        course_name: updatedClassCourse.courses?.course_name || '',
      },
      message: 'Syllabus updated successfully',
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error('Error updating syllabus:', error);

    const response: ApiResponse<null> = {
      success: false,
      error: 'Internal server error',
      message: 'Failed to update syllabus',
    };

    return NextResponse.json(response, { status: 500 });
  }
}
