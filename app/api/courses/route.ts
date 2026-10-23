import { NextRequest, NextResponse } from 'next/server';
import { courseService } from '@/lib/prisma-services';
import { ApiResponse } from '@/types';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const teacherId = searchParams.get('teacherId');
    const studentId = searchParams.get('studentId');
import { getSessionUser, isAdminRole, isTeacherRole, unauthorizedResponse } from '@/lib/auth/course-access';

export async function GET(request: NextRequest) {
  try {
    const user = await getSessionUser();
    if (!user) return unauthorizedResponse();

    const { searchParams } = new URL(request.url);
    let teacherId = searchParams.get('teacherId');
    let studentId = searchParams.get('studentId');

    // Q-06: only admins may list another user's courses (or all courses).
    // Everyone else gets their own, whatever IDs the query string carries.
    if (!isAdminRole(user.role)) {
      teacherId = isTeacherRole(user.role) ? String(user.id) : null;
      studentId = isTeacherRole(user.role) ? null : String(user.id);
    }

    let courses;

    if (teacherId) {
      // Get courses by teacher - only show active class_courses
      const teacherCourses = await courseService.findByTeacher(parseInt(teacherId));
      courses = teacherCourses
        .filter(tc => tc.is_active) // Only show active class_courses
        .map(tc => ({
          id: tc.id,
          course_id: tc.courses?.id,
          course_code: tc.courses?.course_code,
          course_name: tc.courses?.course_name,
          description: tc.courses?.description,
          class_id: tc.class_id,
          class_name: tc.classes?.class_name,
          grade_level: tc.classes?.grade_level,
          academic_year: tc.classes?.academic_years?.year_name,
          teacher_name: tc.app_user?.nama_lengkap,
          student_count: tc.enrollments?.length || 0,
          session_count: tc.sessions?.length || 0,
          start_date: tc.start_date,
          end_date: tc.end_date,
          is_active: tc.is_active,
          syllabus: tc.syllabus,
          created_at: tc.courses?.created_at,
          updated_at: tc.courses?.updated_at,
        }));
    } else if (studentId) {
      // Get courses by student - only show active class_courses
      const studentEnrollments = await courseService.findByStudent(parseInt(studentId));
      courses = studentEnrollments
        .filter(enrollment => enrollment.class_courses?.is_active) // Only show active class_courses
        .map(enrollment => ({
          id: enrollment.class_courses?.id,
          course_id: enrollment.class_courses?.courses?.id,
          course_code: enrollment.class_courses?.courses?.course_code,
          course_name: enrollment.class_courses?.courses?.course_name,
          description: enrollment.class_courses?.courses?.description,
          class_id: enrollment.class_courses?.class_id,
          class_name: enrollment.class_courses?.classes?.class_name,
          grade_level: enrollment.class_courses?.classes?.grade_level,
          academic_year: enrollment.class_courses?.classes?.academic_years?.year_name,
          teacher_name: enrollment.class_courses?.app_user?.nama_lengkap,
          enrollment_date: enrollment.enrollment_date,
          roll_number: enrollment.roll_number,
          start_date: enrollment.class_courses?.start_date,
          end_date: enrollment.class_courses?.end_date,
          is_active: enrollment.class_courses?.is_active,
        }));
    } else {
      // Get all courses - for admin, show all courses with their class_courses
      // Filter to only show active class_courses
      const allCourses = await courseService.findAll();
      courses = allCourses.map(course => ({
        id: course.id,
        course_code: course.course_code,
        course_name: course.course_name,
        description: course.description,
        created_at: course.created_at,
        updated_at: course.updated_at,
        class_courses: course.class_courses
          ?.filter(cc => cc.is_active) // Only show active class_courses
          ?.map(cc => ({
            id: cc.id,
            class_name: cc.classes?.class_name,
            grade_level: cc.classes?.grade_level,
            academic_year: cc.classes?.academic_years?.year_name,
            teacher_name: cc.app_user?.nama_lengkap,
            student_count: cc.enrollments?.length || 0,
            session_count: cc.sessions?.length || 0,
            is_active: cc.is_active,
            start_date: cc.start_date,
            end_date: cc.end_date,
          })) || [],
      })).filter(course => course.class_courses.length > 0); // Only show courses that have at least one active class_course
    }

    const response: ApiResponse<typeof courses> = {
      success: true,
      data: courses,
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error('Error fetching courses:', error);

    const response: ApiResponse<null> = {
      success: false,
      error: 'Internal server error',
      message: 'Failed to fetch courses',
    };

    return NextResponse.json(response, { status: 500 });
  }
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
