import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  return NextResponse.json({
    success: true,
    data: [
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
    ],
  });
}

// export async function POST(request: NextRequest) {
//   try {
//     const body = await request.json();
//     const { course_code, course_name, description, created_by } = body;

//     // Validate required fields
//     if (!course_code || !course_name) {
//       const response: ApiResponse<null> = {
//         success: false,
//         error: 'Validation error',
//         message: 'Course code and name are required',
//       };
//       return NextResponse.json(response, { status: 400 });
//     }

//     const course = await courseService.create({
//       course_code,
//       course_name,
//       description,
//       created_by,
//     });

//     const response: ApiResponse<typeof course> = {
//       success: true,
//       data: course,
//       message: 'Course created successfully',
//     };

//     return NextResponse.json(response, { status: 201 });
//   } catch (error: any) {
//     console.error('Error creating course:', error);

//     let errorMessage = 'Failed to create course';
//     if (error.code === 'P2002') {
//       errorMessage = 'Course code already exists';
//     }

//     const response: ApiResponse<null> = {
//       success: false,
//       error: 'Database error',
//       message: errorMessage,
//     };

//     return NextResponse.json(response, { status: 400 });
//   }
// }
