import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/auth';

// GET /api/courses/[code]/people?type=teacher|students&classId=123
export async function GET(request: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json(
        {
          success: false,
          error: 'Unauthorized',
          message: 'Authentication required',
        },
        { status: 401 }
      );
    }

    const { code } = await params;
    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type') || 'all';
    const classId = searchParams.get('classId');

    const course = await prisma.courses.findUnique({
      where: {
        course_code: code,
      },
      select: {
        id: true,
        course_code: true,
        course_name: true,
      },
    });

    if (!course) {
      return NextResponse.json(
        {
          success: false,
          error: 'Course not found',
          message: 'Course not found',
        },
        { status: 404 }
      );
    }

    // Determine which class_course to get people from
    let classCourseQuery: any = {
      courses: {
        course_code: code,
      },
    };

    // If classId is provided, use it specifically
    if (classId) {
      classCourseQuery.class_id = parseInt(classId);
    } else {
      // Otherwise, find the class_course where the current user is involved
      const userId = parseInt(session.user.id);
      const userRole = session.user.role;

      if (userRole === 'teacher') {
        // For teachers, find class_course where they are the teacher
        classCourseQuery.teacher_id = userId;
      } else if (userRole === 'student') {
        // For students, find class_course where they are enrolled
        classCourseQuery.enrollments = {
          some: {
            student_id: userId,
          },
        };
      }
    }

    // Get the class course to find teacher and students
    const classCourse = await prisma.class_courses.findFirst({
      where: classCourseQuery,
      include: {
        // Class information
        classes: {
          include: {
            academic_years: true,
          },
        },
        // Teacher information
        app_user: {
          include: {
            user_profile: true,
            teacher_details: true,
          },
        },
        // Students information enrollments
        enrollments: {
          include: {
            app_user: {
              include: {
                user_profile: true,
                student_details: true,
              },
            },
          },
          orderBy: [
            {
              roll_number: 'asc',
            },
            {
              app_user: {
                nama_lengkap: 'asc',
              },
            },
          ],
        },
      },
    });

    if (!classCourse) {
      return NextResponse.json(
        {
          success: false,
          error: 'Class course not found',
          message: 'No class course found for this course and user context',
        },
        { status: 404 }
      );
    }

    let result: any = {};

    if (type === 'teacher' || type === 'all') {
      // Format teacher data
      const teacher = classCourse.app_user
        ? {
            id: classCourse.app_user.id,
            nama_lengkap: classCourse.app_user.nama_lengkap,
            email: classCourse.app_user.email,
            kode_guru: classCourse.app_user.teacher_details?.kode_guru,
            niy: classCourse.app_user.teacher_details?.niy,
            profile_picture_url: classCourse.app_user.profile_picture_url,
            tmp_lahir: classCourse.app_user.user_profile?.tmp_lahir,
            tgl_lahir: classCourse.app_user.user_profile?.tgl_lahir,
            gender: classCourse.app_user.user_profile?.gender,
            telepon: classCourse.app_user.user_profile?.telepon,
            alamat: classCourse.app_user.user_profile?.alamat,
            agama: classCourse.app_user.user_profile?.agama,
          }
        : null;

      result.teacher = teacher;
    }

    if (type === 'students' || type === 'all') {
      // Format students data
      const students =
        classCourse.enrollments?.map(enrollment => ({
          id: enrollment.app_user?.id,
          nama_lengkap: enrollment.app_user?.nama_lengkap,
          email: enrollment.app_user?.email,
          nis: enrollment.app_user?.student_details?.nis,
          nisn: enrollment.app_user?.student_details?.nisn,
          parent_contact: enrollment.app_user?.student_details?.parent_contact,
          roll_number: enrollment.roll_number,
          enrollment_date: enrollment.enrollment_date,
          profile_picture_url: enrollment.app_user?.profile_picture_url,
          tmp_lahir: enrollment.app_user?.user_profile?.tmp_lahir,
          tgl_lahir: enrollment.app_user?.user_profile?.tgl_lahir,
          gender: enrollment.app_user?.user_profile?.gender,
          telepon: enrollment.app_user?.user_profile?.telepon,
          alamat: enrollment.app_user?.user_profile?.alamat,
          agama: enrollment.app_user?.user_profile?.agama,
        })) || [];

      result.students = students;
    }

    result.course = {
      course_code: course.course_code,
      course_name: course.course_name,
    };

    result.class_info = {
      id: classCourse.id,
      class_id: classCourse.class_id,
      class_name: classCourse.classes?.class_name,
      grade_level: classCourse.classes?.grade_level,
      academic_year: classCourse.classes?.academic_years?.year_name,
    };

    return NextResponse.json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error('Error fetching people data:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Database error',
        message: 'Failed to fetch people data',
      },
      { status: 500 }
    );
  }
}
