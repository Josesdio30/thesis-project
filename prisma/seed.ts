// import { PrismaClient } from '@/lib/generated/prisma';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function getRoleId(roleName: string) {
  // Role names: 'STUDENT', 'TEACHER', 'ADMIN', category: 'ROLE'
  const role = await prisma.enumeration.findFirst({
    where: { name: roleName, category: 'ROLE' },
  });
  console.log(role)
  if (!role) throw new Error(`Role ${roleName} not found in enumeration table.`);
  return role.id;
}

async function main() {
  // Student
  const studentPassword = await bcrypt.hash('password123', 10);
  const student = await prisma.app_user.create({
    data: {
      nama_lengkap: 'Student Three',
      email: 'student3@example.com',
      user_name: 'student3',
      password: studentPassword,
      tanggal_lahir: new Date('2005-05-01'),
    },
  });
  const studentRoleId = await getRoleId('STUDENT');
  await prisma.app_user_role.create({
    data: {
      user_id: student.id,
      role_id: studentRoleId,
    },
  });
  await prisma.student_details.create({
    data: {
      user_id: student.id,
      nis: '100001',
      nisn: '200001',
      parent_contact: '081234567890',
    },
  });

  // Teacher
  const teacherPassword = await bcrypt.hash('password123', 10);
  const teacher = await prisma.app_user.create({
    data: {
      nama_lengkap: 'Teacher One',
      email: 'teacher1@example.com',
      user_name: 'teacher1',
      password: teacherPassword,
      tanggal_lahir: new Date('1980-03-15'),
    },
  });
  const teacherRoleId = await getRoleId('TEACHER');
  await prisma.app_user_role.create({
    data: {
      user_id: teacher.id,
      role_id: teacherRoleId,
    },
  });
  await prisma.teacher_details.create({
    data: {
      user_id: teacher.id,
      kode_guru: 'TCH001',
      niy: '300001',
    },
  });

  // Admin
  const adminPassword = await bcrypt.hash('password123', 10);
  const admin = await prisma.app_user.create({
    data: {
      nama_lengkap: 'Admin One',
      email: 'admin1@example.com',
      user_name: 'admin1',
      password: adminPassword,
      tanggal_lahir: new Date('1990-07-20'),
    },
  });
  const adminRoleId = await getRoleId('ADMIN');
  await prisma.app_user_role.create({
    data: {
      user_id: admin.id,
      role_id: adminRoleId,
    },
  });
  await prisma.admin_details.create({
    data: {
      user_id: admin.id,
      kode_admin: 'ADM001',
      nip: '400001',
    },
  });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
