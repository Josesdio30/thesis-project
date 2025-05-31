import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET() {
  try {
    console.log('Testing Prisma ORM connection...\n');

    // Test 1: Check Prisma connection
    await prisma.$connect();
    console.log('1. Prisma connection: successful');

    // Test 2: Count records in each table
    const [
      userCount,
      adminCount,
      teacherCount,
      studentCount,
      roleCount,
      enumerationCount,
      profileCount
    ] = await Promise.all([
      prisma.app_user.count(),
      prisma.admin_details.count(),
      prisma.teacher_details.count(),
      prisma.student_details.count(),
      prisma.app_user_role.count(),
      prisma.enumeration.count(),
      prisma.user_profile.count()
    ]);

    console.log('2. Record counts:');
    console.log(`   - Users: ${userCount}`);
    console.log(`   - Admins: ${adminCount}`);
    console.log(`   - Teachers: ${teacherCount}`);
    console.log(`   - Students: ${studentCount}`);
    console.log(`   - User Roles: ${roleCount}`);
    console.log(`   - Enumerations: ${enumerationCount}`);
    console.log(`   - User Profiles: ${profileCount}`);

    // Test 3: Sample query - get first 3 users with roles
    const usersWithRoles = await prisma.app_user.findMany({
      take: 3,
      include: {
        app_user_role: {
          include: {
            enumeration: true
          }
        },
        user_profile: true,
        admin_details: true,
        teacher_details: true,
        student_details: true
      }
    });

    console.log(`3. Sample query: Found ${usersWithRoles.length} users with relations`);

    // Test 4: Get available roles
    const roles = await prisma.enumeration.findMany({
      where: {
        category: 'USER_ROLE'
      }
    });

    console.log(`4. Available roles: ${roles.length} roles found`);
    roles.forEach((role, index) => {
      console.log(`   ${index + 1}. ${role.name} (${role.alt_name || 'N/A'})`);
    });

    console.log('\n🎉 Prisma ORM test completed successfully!');

    await prisma.$disconnect();

    return NextResponse.json({
      status: 'success',
      message: 'Prisma ORM test completed successfully',
      data: {
        counts: {
          users: userCount,
          admins: adminCount,
          teachers: teacherCount,
          students: studentCount,
          user_roles: roleCount,
          enumerations: enumerationCount,
          user_profiles: profileCount
        },
        sample_users: usersWithRoles.length,
        available_roles: roles.map(role => ({
          id: role.id,
          name: role.name,
          alt_name: role.alt_name
        }))
      }
    });

  } catch (error) {
    console.error('Prisma test failed:', error);
    await prisma.$disconnect();
    
    return NextResponse.json({
      status: 'error',
      message: 'Prisma ORM test failed',
      error: error instanceof Error ? error.message : 'Unknown error'    }, { status: 500 });
  }
}
