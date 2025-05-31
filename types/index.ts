// User related types
export interface User {
  id: string;
  name: string;
  email: string;
  role: 'student' | 'teacher' | 'admin';
  avatar?: string;
  studentId?: string;
  teacherId?: string;
}

// Course related types
export interface Course {
  id: string;
  name: string;
  code: string;
  class: string;
  teacher: string;
  teacherId: string;
  description?: string;
  semester: string;
  year: number;
}

// Assignment related types
export interface Assignment {
  id: string;
  title: string;
  description: string;
  courseId: string;
  dueDate: Date;
  maxScore: number;
  attachments?: string[];
  createdAt: Date;
  updatedAt: Date;
}

// Exam related types
export interface Exam {
  id: string;
  title: string;
  description: string;
  courseId: string;
  examDate: Date;
  duration: number; // in minutes
  maxScore: number;
  type: 'quiz' | 'midterm' | 'final';
  createdAt: Date;
  updatedAt: Date;
}

// Schedule related types
export interface Schedule {
  id: string;
  courseId: string;
  date: Date;
  startTime: string;
  endTime: string;
  room?: string;
  type: 'regular' | 'exam' | 'assignment';
}

// Forum related types
export interface ForumPost {
  id: string;
  title: string;
  content: string;
  authorId: string;
  courseId: string;
  createdAt: Date;
  updatedAt: Date;
  replies: ForumReply[];
}

export interface ForumReply {
  id: string;
  content: string;
  authorId: string;
  postId: string;
  createdAt: Date;
  updatedAt: Date;
}

// Session/Material related types
export interface Session {
  id: string;
  title: string;
  courseId: string;
  materials: string[];
  books: string[];
  todos: SessionTodo[];
  date: Date;
  order: number;
}

export interface SessionTodo {
  id: string;
  name: string;
  type: 'file' | 'link';
  url: string;
  completed?: boolean;
}

// API Response types
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

// Common component props
export interface PageProps {
  params: { [key: string]: string };
  searchParams: { [key: string]: string | string[] | undefined };
}
