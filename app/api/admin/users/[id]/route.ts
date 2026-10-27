import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/auth';
import { prisma } from '@/lib/prisma';
import bcrypt from 'bcryptjs';

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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

    const { id } = await params;
    const userId = parseInt(id);

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
      class_id,
      kode_guru,
      niy,
      kode_admin,
      nip,
    } = body;

    // Validate required fields
    if (!nama_lengkap || !email || !user_name || !role || !tanggal_lahir) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Check if user exists
    const existingUser = await prisma.app_user.findUnique({
      where: { id: userId },
    });

    if (!existingUser) {
      return NextResponse.json(
        { success: false, error: 'User not found' },
        { status: 404 }
      );
    }

    // Check if email already exists (excluding current user)
    const existingEmail = await prisma.app_user.findFirst({
      where: {
        email,
        id: { not: userId }
      },
    });

    if (existingEmail) {
      return NextResponse.json(
        { success: false, error: 'Email already exists' },
        { status: 400 }
      );
    }

    // Check if username already exists (excluding current user)
    const existingUsername = await prisma.app_user.findFirst({
      where: {
        user_name,
        id: { not: userId }
      },
    });

    if (existingUsername) {
      return NextResponse.json(
        { success: false, error: 'Username already exists' },
        { status: 400 }
      );
    }

    // Prepare update data
    const updateData: any = {
      nama_lengkap,
      email,
      user_name,
      tanggal_lahir: new Date(tanggal_lahir),
    };

    // Hash password if provided
    // Always generate password from birth date if not provided or empty
    let finalPassword = password;
    if (!password || password.trim() === '') {
      const birthDate = new Date(tanggal_lahir);
      const day = birthDate.getDate().toString().padStart(2, '0');
      const month = (birthDate.getMonth() + 1).toString().padStart(2, '0');
      const year = birthDate.getFullYear();
      finalPassword = `s!nLui2+${day}${month}${year}`;
    }

    // Hash the password
    console.log('🔐 Updating password for user:', userId);
    console.log('🔐 Password to hash:', finalPassword);
    updateData.password = await bcrypt.hash(finalPassword, 10);
    console.log('🔐 Hashed password length:', updateData.password.length);

    // Update user
    const updatedUser = await prisma.app_user.update({
      where: { id: userId },
      data: updateData,
    });
    console.log('✅ User updated, password hash saved:', updatedUser.password?.substring(0, 20) + '...');

    // Update user role
    await prisma.app_user_role.deleteMany({
      where: { user_id: userId },
    });

    await prisma.app_user_role.create({
      data: {
        user_id: userId,
        role_id: parseInt(role),
        is_active: true,
      },
    });

    // Delete existing details
    await prisma.student_details.deleteMany({
      where: { user_id: userId },
    });
    await prisma.teacher_details.deleteMany({
      where: { user_id: userId },
    });
    await prisma.admin_details.deleteMany({
      where: { user_id: userId },
    });

    // Create student details if STUDENT role is selected
    if (role === '1') {
      await prisma.student_details.create({
        data: {
          user_id: userId,
          nis: nis || '',
          nisn: nisn || '',
          parent_contact: parent_contact || '',
          class_id: class_id ? parseInt(class_id) : null,
        },
      });
    }

    // Create teacher details if TEACHER role is selected
    if (role === '2' && (kode_guru || niy)) {
      await prisma.teacher_details.create({
        data: {
          user_id: userId,
          kode_guru: kode_guru || '',
          niy: niy || '',
        },
      });
    }

    // Create admin details if ADMIN role is selected
    if (role === '3' && (kode_admin || nip)) {
      await prisma.admin_details.create({
        data: {
          user_id: userId,
          kode_admin: kode_admin || '',
          nip: nip || '',
        },
      });
    }

    // Handle enrollment for students
    if (role === '1' && class_id) {
      // Delete existing enrollments
      await prisma.enrollments.deleteMany({
        where: { student_id: userId },
      });

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
            student_id: userId,
            class_course_id: classCourse.id,
            roll_number: 1, // Default roll number
            enrollment_date: new Date(),
          })),
          skipDuplicates: true, // Skip jika sudah ada (untuk safety)
        });
      }
      // Jika belum ada class_course, student akan otomatis ter-enroll saat admin create session
    } else if (role !== '1') {
      // If not student, delete any existing enrollments
      await prisma.enrollments.deleteMany({
        where: { student_id: userId },
      });
    }

    return NextResponse.json({
      success: true,
      data: {
        id: userId,
        nama_lengkap,
        email,
        user_name,
      },
      message: 'User updated successfully',
    });

  } catch (error) {
    console.error('Error updating user:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Internal server error',
        message: 'Failed to update user',
      },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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

    const { id } = await params;
    const userId = parseInt(id);

    // Check if user exists
    const existingUser = await prisma.app_user.findUnique({
      where: { id: userId },
    });

    if (!existingUser) {
      return NextResponse.json(
        { success: false, error: 'User not found' },
        { status: 404 }
      );
    }

    // Soft delete user
    await prisma.app_user.update({
      where: { id: userId },
      data: { is_deleted: true },
    });

    return NextResponse.json({
      success: true,
      message: 'User deleted successfully',
    });

  } catch (error) {
    console.error('Error deleting user:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Internal server error',
        message: 'Failed to delete user',
      },
      { status: 500 }
    );
  }
} 