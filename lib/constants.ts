// App constants
export const APP_NAME = 'SMA St. Louis Surabaya LMS';
export const APP_DESCRIPTION = 'Learning Management System untuk SMA St. Louis Surabaya';

// Navigation items untuk sidebar
export const NAVIGATION_ITEMS = [
  { icon: 'FaTachometerAlt', text: 'Dashboard', path: '/dashboard' },
  { icon: 'FaUniversity', text: 'Course', path: '/course' },
  { icon: 'FaCalendarAlt', text: 'Schedule', path: '/schedule' },
  { icon: 'FaComments', text: 'Forum', path: '/forum' },
  { icon: 'FaBook', text: 'Assignment', path: '/assignment' },
  // { icon: 'FaClipboardCheck', text: 'Exam', path: '/exam' },
  { icon: 'FaChartBar', text: 'Score', path: '/score' },
  // { icon: 'FaBullhorn', text: 'Announcement', path: '/announcement' },
] as const;

// Navigation items untuk admin - hanya session
export const ADMIN_NAVIGATION_ITEMS = [
  { icon: 'FaCalendarAlt', text: 'Session Management', path: '/schedule' },
  { icon: 'FaBook', text: 'Course Management', path: '/admin/courses' },
  { icon: 'FaUniversity', text: 'Class Management', path: '/admin/classes' },
  { icon: 'FaUsers', text: 'User Management', path: '/user' },
] as const;

// User roles
export const USER_ROLES = {
  STUDENT: 'student',
  TEACHER: 'teacher',
  ADMIN: 'admin',
} as const;

// Assignment/Exam types
export const EXAM_TYPES = {
  QUIZ: 'quiz',
  MIDTERM: 'midterm',
  FINAL: 'final',
} as const;

// Session todo types
export const TODO_TYPES = {
  FILE: 'file',
  LINK: 'link',
} as const;

// Default pagination
export const DEFAULT_PAGE_SIZE = 10;

// Date formats
export const DATE_FORMATS = {
  SHORT: 'dd/MM/yyyy',
  LONG: 'dd MMMM yyyy',
  WITH_TIME: 'dd/MM/yyyy HH:mm',
} as const;

// File upload limits
export const FILE_UPLOAD = {
  MAX_SIZE: 10 * 1024 * 1024, // 10MB
  ALLOWED_TYPES: [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'image/jpeg',
    'image/png',
    'image/gif',
  ],
} as const;
