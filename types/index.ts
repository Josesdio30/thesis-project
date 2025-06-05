export interface User {
  id: number;
  email: string;
  password: string;
  user_name: string;
  nama_lengkap: string;
  last_login?: Date;
  profile_picture_url?: string;
  is_active: boolean;
  is_deleted: boolean;
  deleted_at?: Date;
  deleted_by?: number;
  created_date: Date;
  created_by?: number;
  updated_date?: Date;
  updated_by?: number;
}

export interface UserProfile {
  id: number;
  user_id: number;
  tmp_lahir?: string;
  tgl_lahir?: Date;
  gender?: 'L' | 'P';
  telepon?: string;
  alamat?: string;
  agama?: string;
  created_date: Date;
  created_by?: number;
  updated_date?: Date;
  updated_by?: number;
}

export interface Enumeration {
  id: number;
  name: string;
  alt_name?: string;
  is_active: boolean;
  is_default: boolean;
  category: string;
  created_by?: number;
}

export interface UserRole {
  id: number;
  role_id: number;
  user_id: number;
  is_active: boolean;
  created_date: Date;
  created_by?: number;
  updated_date?: Date;
  updated_by?: number;
}

export interface StudentDetails {
  id: number;
  user_id: number;
  nis: string;
  nisn?: string;
  parent_contact?: string;
  created_date: Date;
  created_by?: number;
  updated_date?: Date;
  updated_by?: number;
}

export interface TeacherDetails {
  id: number;
  user_id: number;
  kode_guru: string;
  niy?: string;
  created_date: Date;
  created_by?: number;
  updated_date?: Date;
  updated_by?: number;
}

export interface AdminDetails {
  id: number;
  user_id: number;
  kode_admin: string;
  nip?: string;
  created_date: Date;
  created_by?: number;
  updated_date?: Date;
  updated_by?: number;
}

export interface AcademicYear {
  id: number;
  year_name: string;
  start_date: Date;
  end_date: Date;
  is_active: boolean;
  created_by?: number;
  updated_by?: number;
  created_at: Date;
  updated_at: Date;
}

export interface Class {
  id: number;
  class_name: string;
  grade_level: 'X' | 'XI' | 'XII';
  year_id: number;
  wali_kelas?: number;
  created_by?: number;
  updated_by?: number;
  created_at: Date;
  updated_at: Date;
}

export interface Course {
  id: number;
  course_code: string;
  course_name: string;
  description?: string;
  created_by?: number;
  updated_by?: number;
  created_at: Date;
  updated_at: Date;
}

export interface ClassCourse {
  id: number;
  class_id: number;
  course_id: number;
  teacher_id?: number;
  start_date: Date;
  end_date: Date;
  is_active: boolean;
}

export interface Enrollment {
  id: number;
  class_course_id: number;
  student_id: number;
  roll_number?: number;
  enrollment_date: Date;
}

export interface Session {
  id: number;
  class_course_id: number;
  title: string;
  description?: string;
  session_number: number;
  start_time: Date;
  end_time: Date;
  is_completed: boolean;
  completed_at?: Date;
}

export interface Material {
  id: number;
  session_id: number;
  title: string;
  content?: string;
  material_order: number;
  created_at: Date;
}

export interface Resource {
  id: number;
  session_id: number;
  uploader_id?: number;
  file_url: string;
  file_name: string;
  file_size: number;
  file_type: string;
  content_type?: string;
  version: number;
  is_public: boolean;
  download_count: number;
  last_downloaded?: Date;
  checksum?: string;
}

export interface Forum {
  id: number;
  session_id: number;
  creator_id: number;
  title: string;
  description?: string;
  created_at: Date;
}

export interface ForumPost {
  id: number;
  forum_id: number;
  user_id?: number;
  title: string;
  content: string;
  content_type: 'plaintext' | 'markdown';
  is_deleted: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface ForumReply {
  id: number;
  post_id: number;
  user_id?: number;
  parent_reply_id?: number;
  content: string;
  content_type: 'plaintext' | 'markdown';
  is_deleted: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface ForumAttachment {
  id: number;
  post_id?: number;
  reply_id?: number;
  uploader_id?: number;
  file_url: string;
  file_name: string;
  file_size: number;
  file_type: string;
  uploaded_at: Date;
}

export interface Attendance {
  id: number;
  session_id: number;
  student_id: number;
  status: 'present' | 'absent' | 'late' | 'excused';
  recorded_by?: number;
  notes?: string;
  recorded_at: Date;
}

export interface Announcement {
  id: number;
  author_id?: number;
  title: string;
  content: string;
  target_type: 'global' | 'class' | 'course' | 'user';
  target_id?: number;
  start_date: Date;
  end_date?: Date;
  created_at: Date;
}

export interface Notification {
  id: number;
  user_id: number;
  title: string;
  message: string;
  is_read: boolean;
  notification_type: string;
  related_entity_type?: string;
  related_entity_id?: number;
  created_at: Date;
  read_at?: Date;
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface PageProps {
  params: { [key: string]: string };
  searchParams: { [key: string]: string | string[] | undefined };
}

export interface UserWithProfile extends User {
  profile?: UserProfile;
  student_details?: StudentDetails;
  teacher_details?: TeacherDetails;
  admin_details?: AdminDetails;
  roles?: Enumeration[];
}

export interface ClassWithDetails extends Class {
  academic_year?: AcademicYear;
  wali_kelas_info?: UserWithProfile;
  student_count?: number;
}

export interface SessionWithDetails extends Session {
  class_course?: ClassCourse;
  materials?: Material[];
  resources?: Resource[];
  forum?: Forum;
  attendance_count?: {
    present: number;
    absent: number;
    late: number;
    excused: number;
  };
}

export interface ForumPostWithDetails extends ForumPost {
  author?: UserWithProfile;
  replies?: ForumReplyWithDetails[];
  attachments?: ForumAttachment[];
  reply_count?: number;
}

export interface ForumReplyWithDetails extends ForumReply {
  author?: UserWithProfile;
  attachments?: ForumAttachment[];
  child_replies?: ForumReplyWithDetails[];
}
