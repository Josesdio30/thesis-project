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
      role => role.enumeration?.name === 'ADMIN' && role.is_active
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
        // Find enrollments for this student
        const studentEnrollments = await prisma.enrollments.findMany({
          where: {
            student_id: user.id,
          },
          include: {
            class_courses: {
              include: {
                classes: true,
              },
            },
          },
        });

        // Get the first active enrollment
        const activeEnrollment = studentEnrollments.find(enrollment => 
          enrollment.class_courses?.is_active
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
        has_student_details: !!user.student_details,
        has_teacher_details: !!user.teacher_details,
        has_admin_details: !!user.admin_details,
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
      role => role.enumeration?.name === 'ADMIN' && role.is_active
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
    if (role === '1' && (nis || nisn || parent_contact)) {
      await prisma.student_details.create({
        data: {
          user_id: newUser.id,
          nis: nis || '',
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
      // Find existing class_course record for this class
      let classCourse = await prisma.class_courses.findFirst({
        where: {
          class_id: parseInt(class_id),
          is_active: true,
        },
      });

      if (!classCourse) {
        // Get the first available course to create a class_course record
        const firstCourse = await prisma.courses.findFirst();
        
        if (!firstCourse) {
          return NextResponse.json(
            { success: false, error: 'Tidak ada course yang tersedia untuk enrollment' },
            { status: 400 }
          );
        }

        // Create a class_course record with the first available course
        classCourse = await prisma.class_courses.create({
          data: {
            class_id: parseInt(class_id),
            course_id: firstCourse.id,
            start_date: new Date(),
            end_date: new Date(new Date().setFullYear(new Date().getFullYear() + 1)),
            is_active: true,
          },
        });
      }

      // Create enrollment
      await prisma.enrollments.create({
        data: {
          student_id: newUser.id,
          class_course_id: classCourse.id,
          roll_number: 1, // Default roll number
          enrollment_date: new Date(),
        },
      });
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