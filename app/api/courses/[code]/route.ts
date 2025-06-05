import { NextRequest, NextResponse } from 'next/server';
import { courseService } from '@/lib/prisma-services';
import { ApiResponse } from '@/types';

export async function GET(request: NextRequest, { params }: { params: { code: string } }) {
  try {
    const { code } = params;

    const course = await courseService.findByCode(code);

    if (!course) {
      const response: ApiResponse<null> = {
        success: false,
        error: 'Not found',
        message: 'Course not found'
      };
      return NextResponse.json(response, { status: 404 });
    }

    // Transform the data for frontend consumption
    const transformedCourse = {
      id: course.id,
      course_code: course.course_code,
      course_name: course.course_name,
      description: course.description,
      created_at: course.created_at,
      updated_at: course.updated_at,
      class_courses:
        course.class_courses?.map((cc) => ({
          id: cc.id,
          class_id: cc.class_id,
          class_name: cc.classes?.class_name,
          grade_level: cc.classes?.grade_level,
          academic_year: cc.classes?.academic_years?.year_name,
          wali_kelas: cc.classes?.app_user?.nama_lengkap,
          teacher: {
            id: cc.app_user?.id,
            nama_lengkap: cc.app_user?.nama_lengkap,
            email: cc.app_user?.email,
            kode_guru: cc.app_user?.teacher_details?.kode_guru,
            profile_picture_url: cc.app_user?.profile_picture_url
          },
          students:
            cc.enrollments?.map((enrollment) => ({
              id: enrollment.app_user?.id,
              nama_lengkap: enrollment.app_user?.nama_lengkap,
              email: enrollment.app_user?.email,
              nis: enrollment.app_user?.student_details?.nis,
              roll_number: enrollment.roll_number,
              enrollment_date: enrollment.enrollment_date,
              profile_picture_url: enrollment.app_user?.profile_picture_url
            })) || [],
          sessions:
            cc.sessions?.map((session) => ({
              id: session.id,
              title: session.title,
              description: session.description,
              session_number: session.session_number,
              start_time: session.start_time,
              end_time: session.end_time,
              is_completed: session.is_completed,
              completed_at: session.completed_at,
              materials:
                session.materials?.map((material) => ({
                  id: material.id,
                  title: material.title,
                  content: material.content,
                  material_order: material.material_order,
                  created_at: material.created_at
                })) || [],
              resources:
                session.resources?.map((resource) => ({
                  id: resource.id,
                  file_name: resource.file_name,
                  file_url: resource.file_url,
                  file_size: resource.file_size,
                  file_type: resource.file_type,
                  content_type: resource.content_type,
                  is_public: resource.is_public,
                  download_count: resource.download_count,
                  uploader: resource.app_user?.nama_lengkap
                })) || [],
              forum: session.forums
                ? {
                    id: session.forums.id,
                    title: session.forums.title,
                    description: session.forums.description,
                    created_at: session.forums.created_at,
                    creator: session.forums.app_user?.nama_lengkap,
                    posts:
                      session.forums.forum_posts?.map((post) => ({
                        id: post.id,
                        title: post.title,
                        content: post.content,
                        content_type: post.content_type,
                        created_at: post.created_at,
                        updated_at: post.updated_at,
                        author: post.app_user?.nama_lengkap,
                        reply_count: post.forum_replies?.length || 0,
                        is_deleted: post.is_deleted
                      })) || []
                  }
                : null,
              attendance_summary: {
                total_students: cc.enrollments?.length || 0,
                present: session.attendance?.filter((a) => a.status === 'present').length || 0,
                absent: session.attendance?.filter((a) => a.status === 'absent').length || 0,
                late: session.attendance?.filter((a) => a.status === 'late').length || 0,
                excused: session.attendance?.filter((a) => a.status === 'excused').length || 0
              }
            })) || [],
          start_date: cc.start_date,
          end_date: cc.end_date,
          is_active: cc.is_active,
          syllabus: cc.syllabus
        })) || []
    };

    const response: ApiResponse<typeof transformedCourse> = {
      success: true,
      data: transformedCourse
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error('Error fetching course by code:', error);

    const response: ApiResponse<null> = {
      success: false,
      error: 'Internal server error',
      message: 'Failed to fetch course details'
    };

    return NextResponse.json(response, { status: 500 });
  }
}

export async function PUT(request: NextRequest, { params }: { params: { code: string } }) {
  try {
    const { code } = params;
    const body = await request.json();

    // Find course first
    const existingCourse = await courseService.findByCode(code);
    if (!existingCourse) {
      const response: ApiResponse<null> = {
        success: false,
        error: 'Not found',
        message: 'Course not found'
      };
      return NextResponse.json(response, { status: 404 });
    }

    // Update course
    const updatedCourse = await courseService.update(existingCourse.id, {
      course_name: body.course_name,
      description: body.description,
      updated_by: body.updated_by
    });

    const response: ApiResponse<typeof updatedCourse> = {
      success: true,
      data: updatedCourse,
      message: 'Course updated successfully'
    };

    return NextResponse.json(response);
  } catch (error: any) {
    console.error('Error updating course:', error);

    const response: ApiResponse<null> = {
      success: false,
      error: 'Internal server error',
      message: 'Failed to update course'
    };

    return NextResponse.json(response, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: { code: string } }) {
  try {
    const { code } = params;

    // Find course first
    const existingCourse = await courseService.findByCode(code);
    if (!existingCourse) {
      const response: ApiResponse<null> = {
        success: false,
        error: 'Not found',
        message: 'Course not found'
      };
      return NextResponse.json(response, { status: 404 });
    }

    // Delete course
    await courseService.delete(existingCourse.id);

    const response: ApiResponse<null> = {
      success: true,
      message: 'Course deleted successfully'
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
      message: errorMessage
    };

    return NextResponse.json(response, { status: 400 });
  }
}
