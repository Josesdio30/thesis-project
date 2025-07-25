import { NextRequest, NextResponse } from 'next/server';

const dummyCourses = [
  {
    course_code: 'BIO6713004',
    course_name: 'BIOLOGI',
    class_courses: [
      {
        class_name: 'X-MIPA',
        teacher: { nama_lengkap: 'Bu Siti' },
        students: [{ nama_lengkap: 'Budi' }, { nama_lengkap: 'Ani' }],
        sessions: [{ id: 1, title: 'Sesi 1' }],
      },
    ],
  },
  {
    course_code: 'FIS6713005',
    course_name: 'FISIKA',
    class_courses: [
      {
        class_name: 'X-MIPA',
        teacher: { nama_lengkap: 'Pak Joko' },
        students: [{ nama_lengkap: 'Budi' }, { nama_lengkap: 'Ani' }],
        sessions: [{ id: 1, title: 'Sesi 1' }],
      },
    ],
  },
  {
    course_code: 'MTK6713006',
    course_name: 'MATEMATIKA',
    class_courses: [
      {
        class_name: 'X-MIPA',
        teacher: { nama_lengkap: 'Bu Rina' },
        students: [{ nama_lengkap: 'Budi' }, { nama_lengkap: 'Ani' }],
        sessions: [{ id: 1, title: 'Sesi 1' }],
      },
    ],
  },
];

export async function GET(req: NextRequest, context: { params: { code: string } }) {
  const { code } = context.params;
  const course = dummyCourses.find(c => c.course_code === code);
  if (course) {
    return NextResponse.json({ success: true, data: course });
  }
  return NextResponse.json({ success: false, message: 'Course not found' }, { status: 404 });
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  try {
    const { code } = await params;
    const body = await request.json();

    // Find course first
    const existingCourse = dummyCourses.find(c => c.course_code === code);
    if (!existingCourse) {
      const response: ApiResponse<null> = {
        success: false,
        error: 'Not found',
        message: 'Course not found',
      };
      return NextResponse.json(response, { status: 404 });
    }

    // Update course
    const updatedCourse = await courseService.update(existingCourse.id, {
      course_name: body.course_name,
      description: body.description,
      updated_by: body.updated_by,
    });

    const response: ApiResponse<typeof updatedCourse> = {
      success: true,
      data: updatedCourse,
      message: 'Course updated successfully',
    };

    return NextResponse.json(response);
  } catch (error: any) {
    console.error('Error updating course:', error);

    const response: ApiResponse<null> = {
      success: false,
      error: 'Internal server error',
      message: 'Failed to update course',
    };

    return NextResponse.json(response, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  try {
    const { code } = await params;

    // Find course first
    const existingCourse = dummyCourses.find(c => c.course_code === code);
    if (!existingCourse) {
      const response: ApiResponse<null> = {
        success: false,
        error: 'Not found',
        message: 'Course not found',
      };
      return NextResponse.json(response, { status: 404 });
    }

    // Delete course
    await courseService.delete(existingCourse.id);

    const response: ApiResponse<null> = {
      success: true,
      message: 'Course deleted successfully',
    };

    return NextResponse.json(response);
  } catch (error: any) {
    console.error('Error deleting course:', error);

    let errorMessage = 'Failed to delete course';
    if (error.code === 'P2003') {
      errorMessage = 'Cannot delete course. It has associated data.';
    }

    const response: ApiResponse<null> = {
      success: false,
      error: 'Database error',
      message: errorMessage,
    };

    return NextResponse.json(response, { status: 400 });
  }
}
