import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/auth';
import { prisma } from '@/lib/prisma';
import bcrypt from 'bcryptjs';

export async function GET(request: NextRequest) {
  try {
    // Get session for authentication
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    // Check if user is admin
    const userDetails = await prisma.app_user.findUnique({
      where: { id: parseInt(session.user.id) },
      include: {
        app_user_role: {
          include: {
            enumeration: true,
          },
        },
      },
    });

    if (!userDetails) {
      return NextResponse.json({ success: false, error: 'User not found' }, { status: 404 });
    }

    const isAdmin = userDetails.app_user_role?.some(
      role => role.enumeration?.name?.toLowerCase() === 'admin' && role.is_active
    );

    if (!isAdmin) {
      return NextResponse.json({ success: false, error: 'Admin access required' }, { status: 403 });
    }

    // Get all users with their roles
    const users = await prisma.app_user.findMany({
      where: {
        is_deleted: false,
      },
      include: {
        app_user_role: {
          include: {
            enumeration: true,
          },
        },
        student_details: {
          include: {
            classes: true,
          },
        },
        student_details: true,
        teacher_details: true,
        admin_details: true,
      },
      orderBy: {
        created_date: 'desc',
      },
    });

    const userData = await Promise.all(users.map(async (user) => {
      // Get class information for students
      let classInfo = null;
      if (user.student_details) {
        if (user.student_details.classes) {
          classInfo = {
            class_id: user.student_details.classes.id,
            class_name: user.student_details.classes.class_name,
            grade_level: user.student_details.classes.grade_level,
          };
        } else {
          // Fallback to enrollment check (existing logic, for safety/backward compatibility)
          const studentEnrollments = await prisma.enrollments.findMany({
            where: {
              student_id: user.id,
            },
            include: {
              class_courses: {
                include: {
                  classes: {
                    include: {
                      academic_years: true,
                    },
        // Find enrollments for this student
        const studentEnrollments = await prisma.enrollments.findMany({
          where: {
            student_id: user.id,
          },
          include: {
            class_courses: {
              include: {
                classes: {
                  include: {
                    academic_years: true,
                  },
                },
              },
            },
          });

          // Get the first active enrollment with active class_course
          const activeEnrollment = studentEnrollments.find(enrollment => 
            enrollment.class_courses?.is_active && enrollment.class_courses?.classes
          );

          if (activeEnrollment?.class_courses?.classes) {
            classInfo = {
              class_id: activeEnrollment.class_courses.classes.id,
              class_name: activeEnrollment.class_courses.classes.class_name,
              grade_level: activeEnrollment.class_courses.classes.grade_level,
            };
          }
          },
        });

        // Get the first active enrollment with active class_course
        const activeEnrollment = studentEnrollments.find(enrollment => 
          enrollment.class_courses?.is_active && enrollment.class_courses?.classes
        );

        if (activeEnrollment?.class_courses?.classes) {
          classInfo = {
            class_id: activeEnrollment.class_courses.classes.id,
            class_name: activeEnrollment.class_courses.classes.class_name,
            grade_level: activeEnrollment.class_courses.classes.grade_level,
          };
        }
      }

      return {
        id: user.id,
        nama_lengkap: user.nama_lengkap,
        email: user.email,
        user_name: user.user_name,
        is_active: user.is_active,
        roles: user.app_user_role
          ?.filter(role => role.is_active)
          ?.map(role => role.enumeration?.name || '')
          ?.filter(Boolean) || [],
        created_date: user.created_date,
        tanggal_lahir: user.tanggal_lahir,
        has_student_details: !!user.student_details,
        has_teacher_details: !!user.teacher_details,
        has_admin_details: !!user.admin_details,
        // Add student details
        nis: user.student_details?.nis || '',
        nisn: user.student_details?.nisn || '',
        parent_contact: user.student_details?.parent_contact || '',
        // Add teacher details
        kode_guru: user.teacher_details?.kode_guru || '',
        niy: user.teacher_details?.niy || '',
        // Add admin details
        kode_admin: user.admin_details?.kode_admin || '',
        nip: user.admin_details?.nip || '',
        // Add class information for students
        class_info: classInfo,
      };
    }));

    return NextResponse.json({
      success: true,
      data: {
        users: userData,
      },
    });

  } catch (error) {
    console.error('Error fetching users:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Internal server error',
        message: 'Failed to fetch users',
      },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    // Get session for authentication
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    // Check if user is admin
    const userDetails = await prisma.app_user.findUnique({
      where: { id: parseInt(session.user.id) },
      include: {
        app_user_role: {
          include: {
            enumeration: true,
          },
        },
      },
    });

    if (!userDetails) {
      return NextResponse.json({ success: false, error: 'User not found' }, { status: 404 });
    }

    const isAdmin = userDetails.app_user_role?.some(
      role => role.enumeration?.name?.toLowerCase() === 'admin' && role.is_active
    );

    if (!isAdmin) {
      return NextResponse.json({ success: false, error: 'Admin access required' }, { status: 403 });
    }

    const body = await request.json();
    const {
      nama_lengkap,
      email,
      user_name,
      password,
      role,
      tanggal_lahir,
      nis,
      nisn,
      parent_contact,
      class_id, // Tambahkan class_id
      kode_guru,
      niy,
      kode_admin,
      nip,
    } = body;

    // Validate required fields
    if (!nama_lengkap || !email || !user_name || !password || !role || !tanggal_lahir) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Check if email already exists
    const existingEmail = await prisma.app_user.findUnique({
      where: { email },
    });

    if (existingEmail) {
      return NextResponse.json(
        { success: false, error: 'Email already exists' },
        { status: 400 }
      );
    }

    // Check if username already exists
    const existingUsername = await prisma.app_user.findUnique({
      where: { user_name },
    });

    if (existingUsername) {
      return NextResponse.json(
        { success: false, error: 'Username already exists' },
        { status: 400 }
      );
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create user
    const newUser = await prisma.app_user.create({
      data: {
        nama_lengkap,
        email,
        user_name,
        password: hashedPassword,
        tanggal_lahir: new Date(tanggal_lahir),
        is_active: true,
        is_deleted: false,
      },
    });

    // Create user role
    await prisma.app_user_role.create({
      data: {
        user_id: newUser.id,
        role_id: parseInt(role),
        is_active: true,
      },
    });

    // Create student details if STUDENT role is selected
    if (role === '1') {
      await prisma.student_details.create({
        data: {
          user_id: newUser.id,
          nis: nis || '',
          nisn: nisn || '',
          parent_contact: parent_contact || '',
          class_id: class_id ? parseInt(class_id) : null,
    // nis is required (non-nullable, unique) in student_details
    if (role === '1' && nis) {
      // Check for duplicate NIS before inserting
      const existingNis = await prisma.student_details.findUnique({ where: { nis } });
      if (existingNis) {
        await prisma.app_user.delete({ where: { id: newUser.id } });
        return NextResponse.json(
          { success: false, error: 'NIS already exists' },
          { status: 400 }
        );
      }

      await prisma.student_details.create({
        data: {
          user_id: newUser.id,
          nis,
          nisn: nisn || '',
          parent_contact: parent_contact || '',
        },
      });
    }

    // Create teacher details if TEACHER role is selected
    if (role === '2' && (kode_guru || niy)) {
      await prisma.teacher_details.create({
        data: {
          user_id: newUser.id,
          kode_guru: kode_guru || '',
          niy: niy || '',
        },
      });
    }

    // Create admin details if ADMIN role is selected
    if (role === '3' && (kode_admin || nip)) {
      await prisma.admin_details.create({
        data: {
          user_id: newUser.id,
          kode_admin: kode_admin || '',
          nip: nip || '',
        },
      });
    }

    // Create enrollment if STUDENT role is selected and class_id is provided
    if (role === '1' && class_id) {
      // Find ALL existing class_course records for this class
      const classCourses = await prisma.class_courses.findMany({
        where: {
          class_id: parseInt(class_id),
          is_active: true,
        },
      });

      // Enroll student ke semua class_course yang ada untuk class ini
      if (classCourses.length > 0) {
        await prisma.enrollments.createMany({
          data: classCourses.map(classCourse => ({
            student_id: newUser.id,
            class_course_id: classCourse.id,
            roll_number: 1, // Default roll number
            enrollment_date: new Date(),
          })),
          skipDuplicates: true, // Skip jika sudah ada (untuk safety)
        });
      }
      // Jika belum ada class_course, student akan otomatis ter-enroll saat admin create session
    }

    return NextResponse.json({
      success: true,
      data: {
        id: newUser.id,
        nama_lengkap: newUser.nama_lengkap,
        email: newUser.email,
        user_name: newUser.user_name,
      },
      message: 'User created successfully',
    });

  } catch (error) {
    console.error('Error creating user:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Internal server error',
        message: 'Failed to create user',
      },
      { status: 500 }
    );
  }
} 