import { prisma } from './prisma';
import type { Prisma } from './generated/prisma';

// User operations
export const userService = {
  // Get user by email
  findByEmail: async (email: string) => {
    return await prisma.app_user.findUnique({
      where: { email },
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
  },

  // Get user by username
  findByUsername: async (user_name: string) => {
    return await prisma.app_user.findUnique({
      where: { user_name },
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
  },

  // Get user by ID
  findById: async (id: number) => {
    return await prisma.app_user.findUnique({
      where: { id },
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
  },

  // Create new user
  create: async (userData: Prisma.app_userCreateInput) => {
    return await prisma.app_user.create({
      data: userData,
      include: {
        app_user_role: {
          include: {
            enumeration: true
          }
        },
        user_profile: true
      }
    });
  },

  // Update user
  update: async (id: number, userData: Prisma.app_userUpdateInput) => {
    return await prisma.app_user.update({
      where: { id },
      data: userData,
      include: {
        app_user_role: {
          include: {
            enumeration: true
          }
        },
        user_profile: true
      }
    });
  },

  // Get all active users
  findAllActive: async () => {
    return await prisma.app_user.findMany({
      where: {
        is_active: true,
        is_deleted: false
      },
      include: {
        app_user_role: {
          include: {
            enumeration: true
          }
        },
        user_profile: true
      }
    });
  }
};

// Role operations
export const roleService = {
  // Get all roles
  findAll: async () => {
    return await prisma.enumeration.findMany({
      where: {
        category: 'ROLE',
        is_active: true
      }
    });
  },

  // Assign role to user
  assignRole: async (user_id: number, role_id: number, created_by?: number) => {
    return await prisma.app_user_role.create({
      data: {
        user_id,
        role_id,
        created_by
      },
      include: {
        enumeration: true,
        app_user: true
      }
    });
  },

  // Remove role from user
  removeRole: async (user_id: number, role_id: number) => {
    return await prisma.app_user_role.deleteMany({
      where: {
        user_id,
        role_id
      }
    });
  },

  // Get user roles
  getUserRoles: async (user_id: number) => {
    return await prisma.app_user_role.findMany({
      where: {
        user_id,
        is_active: true
      },
      include: {
        enumeration: true
      }
    });
  }
};

// Student operations
export const studentService = {
  // Create student
  create: async (studentData: Prisma.student_detailsCreateInput) => {
    return await prisma.student_details.create({
      data: studentData,
      include: {
        app_user: {
          include: {
            user_profile: true,
            app_user_role: {
              include: {
                enumeration: true
              }
            }
          }
        }
      }
    });
  },

  // Find by NIS
  findByNIS: async (nis: string) => {
    return await prisma.student_details.findUnique({
      where: { nis },
      include: {
        app_user: {
          include: {
            user_profile: true,
            app_user_role: {
              include: {
                enumeration: true
              }
            }
          }
        }
      }
    });
  },

  // Get all students
  findAll: async () => {
    return await prisma.student_details.findMany({
      include: {
        app_user: {
          include: {
            user_profile: true,
            app_user_role: {
              include: {
                enumeration: true
              }
            }
          }
        }
      }
    });
  }
};

// Teacher operations
export const teacherService = {
  // Create teacher
  create: async (teacherData: Prisma.teacher_detailsCreateInput) => {
    return await prisma.teacher_details.create({
      data: teacherData,
      include: {
        app_user: {
          include: {
            user_profile: true,
            app_user_role: {
              include: {
                enumeration: true
              }
            }
          }
        }
      }
    });
  },

  // Find by kode guru
  findByKodeGuru: async (kode_guru: string) => {
    return await prisma.teacher_details.findUnique({
      where: { kode_guru },
      include: {
        app_user: {
          include: {
            user_profile: true,
            app_user_role: {
              include: {
                enumeration: true
              }
            }
          }
        }
      }
    });
  },

  // Get all teachers
  findAll: async () => {
    return await prisma.teacher_details.findMany({
      include: {
        app_user: {
          include: {
            user_profile: true,
            app_user_role: {
              include: {
                enumeration: true
              }
            }
          }
        }
      }
    });
  }
};

// Profile operations
export const profileService = {
  // Create or update profile
  upsert: async (user_id: number, profileData: Omit<Prisma.user_profileCreateInput, 'app_user'>) => {
    return await prisma.user_profile.upsert({
      where: { user_id },
      update: profileData,
      create: {
        ...profileData,
        app_user: {
          connect: { id: user_id }
        }
      }
    });
  },

  // Get profile by user ID
  findByUserId: async (user_id: number) => {
    return await prisma.user_profile.findUnique({
      where: { user_id },
      include: {
        app_user: true
      }
    });
  }
};
