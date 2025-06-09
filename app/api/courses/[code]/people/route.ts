import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// GET /api/courses/[code]/people?type=teacher|students
export async function GET(request: NextRequest, { params }: { params: { code: string } }) {
  try {
    const { code } = await params;
    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type') || 'all'; // 'teacher', 'students', or 'all'

    // First, verify the course exists
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

    // Get the class course to find teacher and students
    const classCourse = await prisma.class_courses.findFirst({
      where: {
        courses: {
          course_code: code,
        },
      },
      include: {
        // Teacher information
        app_user: {
          include: {
            user_profile: true,
            teacher_details: true,
          },
        },
        // Students information through enrollments
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
          message: 'No class course found for this course',
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

    // Add course context
    result.course = {
      course_code: course.course_code,
      course_name: course.course_name,
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
