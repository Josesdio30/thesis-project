'use client';

import React, { useState, useEffect } from 'react';
import {
  FaClock,
  FaUser,
  FaGraduationCap,
  FaSpinner,
  FaUserFriends,
  FaClipboard,
  FaPlus,
  FaEdit,
  FaTrash,
} from 'react-icons/fa';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { format } from 'date-fns';
import Sidebar from '../_components/sidebar';
import { useRouter } from 'next/navigation';
import Topbar from '../_components/topbar';
import { Calendar } from '@/components/ui/calendar';
import { useSchedule } from '@/hooks';
import type { ScheduleItem } from '@/hooks/useSchedule';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';

const formatDate = (date: Date | undefined): string => {
  if (!date) return '';

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
};

const AddSessionModal = ({
  isOpen,
  onClose,
  onSave,
}: {
  isOpen: boolean;
  onClose: () => void;
  onSave: (sessionData: any) => void;
}) => {
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    startTime: '',
    endTime: '',
    date: '',
    courseCode: '',
    teacherId: '',
    classId: '',
    sessionNumber: '',
  });

  const [teachers, setTeachers] = useState<any[]>([]);
  const [classes, setClasses] = useState<any[]>([]);
  const [courses, setCourses] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
<<<<<<< HEAD
  const [teacherSearch, setTeacherSearch] = useState('');
=======
>>>>>>> test-plagiarism-correction-feature

  useEffect(() => {
    if (isOpen) {
      fetchCoursesData();
    }
  }, [isOpen]);

  const fetchCoursesData = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/admin/courses');
      if (response.ok) {
        const data = await response.json();
        setTeachers(data.data.teachers);
        setClasses(data.data.classes);
        setCourses(data.data.courses);
      }
    } catch (error) {
      console.error('Error fetching courses data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    // Validate required fields
    if (
      !formData.title ||
      !formData.startTime ||
      !formData.endTime ||
      !formData.date ||
      !formData.courseCode ||
      !formData.teacherId ||
      !formData.classId ||
      !formData.sessionNumber
    ) {
      alert('Mohon lengkapi semua field yang diperlukan');
      return;
    }

    onSave(formData);
    setFormData({
      title: '',
      description: '',
      startTime: '',
      endTime: '',
      date: '',
      courseCode: '',
      teacherId: '',
      classId: '',
      sessionNumber: '',
    });
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Tambah Session Baru</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          {loading ? (
            <>
              <div className="flex items-center justify-center py-8">
                <FaSpinner className="animate-spin text-blue-500 mr-2" />
                <span className="text-gray-600">Loading data...</span>
              </div>
              <div className="flex gap-2 pt-4">
                <Button type="button" variant="outline" onClick={onClose} className="flex-1">
                  Tutup
                </Button>
              </div>
            </>
          ) : (
            <>
              <div>
                <Label htmlFor="title">Judul Session</Label>
                <Input
                  id="title"
                  value={formData.title}
                  onChange={e => setFormData({ ...formData, title: e.target.value })}
                  placeholder="Masukkan judul session"
                  required
                />
              </div>

              <div>
                <Label htmlFor="description">Deskripsi</Label>
                <Textarea
                  id="description"
                  value={formData.description}
                  onChange={e => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Masukkan deskripsi session"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="date">Tanggal</Label>
                  <Input
                    id="date"
                    type="date"
                    value={formData.date}
                    onChange={e => setFormData({ ...formData, date: e.target.value })}
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="sessionNumber">Nomor Session</Label>
                  <Input
                    id="sessionNumber"
                    type="number"
                    value={formData.sessionNumber}
                    onChange={e => setFormData({ ...formData, sessionNumber: e.target.value })}
                    placeholder="1"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="startTime">Waktu Mulai</Label>
                  <Input
                    id="startTime"
                    type="time"
                    value={formData.startTime}
                    onChange={e => setFormData({ ...formData, startTime: e.target.value })}
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="endTime">Waktu Selesai</Label>
                  <Input
                    id="endTime"
                    type="time"
                    value={formData.endTime}
                    onChange={e => setFormData({ ...formData, endTime: e.target.value })}
                    required
                  />
                </div>
              </div>

              <div>
                <Label htmlFor="courseCode">Mata Pelajaran</Label>
                <Select
                  value={formData.courseCode}
                  onValueChange={value => setFormData({ ...formData, courseCode: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Pilih mata pelajaran" />
                  </SelectTrigger>
                  <SelectContent>
                    {courses.map(course => (
                      <SelectItem key={course.id} value={course.course_code}>
                        {course.course_code} - {course.course_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="teacherId">Guru</Label>
                <Select
                  value={formData.teacherId}
                  onValueChange={value => setFormData({ ...formData, teacherId: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Pilih guru" />
                  </SelectTrigger>
                  <SelectContent>
<<<<<<< HEAD
                    <div className="p-2">
                      <Input
                        placeholder="Cari guru..."
                        value={teacherSearch}
                        onChange={(e) => setTeacherSearch(e.target.value)}
                        className="h-8"
                        onClick={(e) => e.stopPropagation()}
                        onKeyDown={(e) => e.stopPropagation()}
                      />
                    </div>
                    {teachers
                      .filter(teacher =>
                        teacher.name.toLowerCase().includes(teacherSearch.toLowerCase()) ||
                        teacher.kode_guru.toLowerCase().includes(teacherSearch.toLowerCase())
                      )
                      .map(teacher => (
                        <SelectItem key={teacher.id} value={teacher.id.toString()}>
                          {teacher.name} ({teacher.kode_guru})
                        </SelectItem>
                      ))}
=======
                    {teachers.map(teacher => (
                      <SelectItem key={teacher.id} value={teacher.id.toString()}>
                        {teacher.name} ({teacher.kode_guru})
                      </SelectItem>
                    ))}
>>>>>>> test-plagiarism-correction-feature
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="classId">Kelas</Label>
                <Select value={formData.classId} onValueChange={value => setFormData({ ...formData, classId: value })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Pilih kelas" />
                  </SelectTrigger>
                  <SelectContent>
                    {classes.map(classData => (
                      <SelectItem key={classData.id} value={classData.id.toString()}>
                        {classData.name} - {classData.grade_level} ({classData.year_name})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex gap-2 pt-4">
                <Button type="submit" className="flex-1">
                  Simpan Session
                </Button>
                <Button type="button" variant="outline" onClick={onClose} className="flex-1">
                  Batal
                </Button>
              </div>
            </>
          )}
        </form>
      </DialogContent>
    </Dialog>
  );
};

<<<<<<< HEAD
// Edit Session Modal Component
const EditSessionModal = ({
  isOpen,
  onClose,
  onSave,
  session,
}: {
  isOpen: boolean;
  onClose: () => void;
  onSave: (sessionData: any) => void;
  session: ScheduleItem | null;
}) => {
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    startTime: '',
    endTime: '',
    date: '',
    sessionNumber: '',
    isCompleted: false,
    courseCode: '',
    teacherId: '',
    classId: '',
  });
  const [saving, setSaving] = useState(false);
  const [teachers, setTeachers] = useState<any[]>([]);
  const [classes, setClasses] = useState<any[]>([]);
  const [courses, setCourses] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [teacherSearch, setTeacherSearch] = useState('');

  useEffect(() => {
    if (isOpen) {
      fetchCoursesData();
    }
  }, [isOpen]);

  useEffect(() => {
    if (session && isOpen) {
      const startDate = new Date(session.start_time);
      const endDate = new Date(session.end_time);

      setFormData({
        title: session.session_title || '',
        description: session.description || '',
        startTime: startDate.toTimeString().slice(0, 5),
        endTime: endDate.toTimeString().slice(0, 5),
        date: startDate.toISOString().split('T')[0],
        sessionNumber: session.session_number?.toString() || '',
        isCompleted: session.is_completed || false,
        courseCode: session.course_code || '',
        teacherId: session.teacher_id?.toString() || '',
        classId: session.class_id?.toString() || '',
      });
    }
  }, [session, isOpen]);

  const fetchCoursesData = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/admin/courses');
      if (response.ok) {
        const data = await response.json();
        setTeachers(data.data.teachers);
        setClasses(data.data.classes);
        setCourses(data.data.courses);
      }
    } catch (error) {
      console.error('Error fetching courses data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.title || !formData.startTime || !formData.endTime || !formData.date) {
      alert('Mohon lengkapi semua field yang diperlukan');
      return;
    }
    setSaving(true);
    try {
      await onSave({ sessionId: session?.id, ...formData });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Session</DialogTitle>
        </DialogHeader>
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <FaSpinner className="animate-spin text-blue-500 mr-2" />
            <span className="text-gray-600">Loading data...</span>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label htmlFor="edit-title">Judul Session</Label>
              <Input id="edit-title" value={formData.title} onChange={e => setFormData({ ...formData, title: e.target.value })} placeholder="Masukkan judul session" required />
            </div>
            <div>
              <Label htmlFor="edit-description">Deskripsi</Label>
              <Textarea id="edit-description" value={formData.description} onChange={e => setFormData({ ...formData, description: e.target.value })} placeholder="Masukkan deskripsi session" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="edit-date">Tanggal</Label>
                <Input id="edit-date" type="date" value={formData.date} onChange={e => setFormData({ ...formData, date: e.target.value })} required />
              </div>
              <div>
                <Label htmlFor="edit-sessionNumber">Nomor Session</Label>
                <Input id="edit-sessionNumber" type="number" value={formData.sessionNumber} onChange={e => setFormData({ ...formData, sessionNumber: e.target.value })} placeholder="1" required />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="edit-startTime">Waktu Mulai</Label>
                <Input id="edit-startTime" type="time" value={formData.startTime} onChange={e => setFormData({ ...formData, startTime: e.target.value })} required />
              </div>
              <div>
                <Label htmlFor="edit-endTime">Waktu Selesai</Label>
                <Input id="edit-endTime" type="time" value={formData.endTime} onChange={e => setFormData({ ...formData, endTime: e.target.value })} required />
              </div>
            </div>

            <div>
              <Label htmlFor="edit-courseCode">Mata Pelajaran</Label>
              <Select value={formData.courseCode} onValueChange={value => setFormData({ ...formData, courseCode: value })}>
                <SelectTrigger>
                  <SelectValue placeholder="Pilih mata pelajaran (opsional untuk mengubah)" />
                </SelectTrigger>
                <SelectContent>
                  {courses.map(course => (
                    <SelectItem key={course.id} value={course.course_code}>
                      {course.course_code} - {course.course_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="edit-teacherId">Guru</Label>
              <Select value={formData.teacherId} onValueChange={value => setFormData({ ...formData, teacherId: value })}>
                <SelectTrigger>
                  <SelectValue placeholder="Pilih guru (opsional untuk mengubah)" />
                </SelectTrigger>
                <SelectContent>
                  <div className="p-2">
                    <Input
                      placeholder="Cari guru..."
                      value={teacherSearch}
                      onChange={(e) => setTeacherSearch(e.target.value)}
                      className="h-8"
                      onClick={(e) => e.stopPropagation()}
                      onKeyDown={(e) => e.stopPropagation()}
                    />
                  </div>
                  {teachers
                    .filter(teacher =>
                      teacher.name.toLowerCase().includes(teacherSearch.toLowerCase()) ||
                      teacher.kode_guru.toLowerCase().includes(teacherSearch.toLowerCase())
                    )
                    .map(teacher => (
                      <SelectItem key={teacher.id} value={teacher.id.toString()}>
                        {teacher.name} ({teacher.kode_guru})
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="edit-classId">Kelas</Label>
              <Select value={formData.classId} onValueChange={value => setFormData({ ...formData, classId: value })}>
                <SelectTrigger>
                  <SelectValue placeholder="Pilih kelas (opsional untuk mengubah)" />
                </SelectTrigger>
                <SelectContent>
                  {classes.map(classData => (
                    <SelectItem key={classData.id} value={classData.id.toString()}>
                      {classData.name} - {classData.grade_level} ({classData.year_name})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center gap-2">
              <input type="checkbox" id="edit-isCompleted" checked={formData.isCompleted} onChange={e => setFormData({ ...formData, isCompleted: e.target.checked })} className="h-4 w-4 rounded border-gray-300" />
              <Label htmlFor="edit-isCompleted" className="cursor-pointer">Session Selesai</Label>
            </div>
            <div className="flex gap-2 pt-4">
              <Button type="submit" className="flex-1" disabled={saving}>
                {saving ? <><FaSpinner className="animate-spin mr-2" />Menyimpan...</> : 'Simpan Perubahan'}
              </Button>
              <Button type="button" variant="outline" onClick={onClose} className="flex-1" disabled={saving}>Batal</Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
};


=======
>>>>>>> test-plagiarism-correction-feature
const Schedule = () => {
  const router = useRouter();
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(new Date());
  const [currentMonth, setCurrentMonth] = useState<Date>(new Date());
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [userRole, setUserRole] = useState<string>('');
<<<<<<< HEAD
  const [deletingSessionId, setDeletingSessionId] = useState<number | null>(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingSession, setEditingSession] = useState<ScheduleItem | null>(null);
=======
>>>>>>> test-plagiarism-correction-feature

  const { scheduleData, loading, error, fetchDateSchedule, fetchMonthSchedule, refetch } = useSchedule(
    selectedDate,
    currentMonth
  );

  const [dailySchedule, setDailySchedule] = useState<ScheduleItem[]>([]);

  useEffect(() => {
    if (scheduleData?.user_role) {
      setUserRole(scheduleData.user_role);
    }
  }, [scheduleData]);

  useEffect(() => {
    if (selectedDate && scheduleData) {
      const formattedDate = formatDate(selectedDate);

      if (typeof scheduleData.schedule === 'object' && !Array.isArray(scheduleData.schedule)) {
        const schedule = scheduleData.schedule[formattedDate] || [];
        setDailySchedule(schedule);
      } else if (Array.isArray(scheduleData.schedule)) {
        setDailySchedule(scheduleData.schedule);
      }
    }
  }, [selectedDate, scheduleData]);

  const formattedHeaderDate = selectedDate ? format(selectedDate, 'MMM d, yyyy') : '';

  const handleDateSelect = (date: Date | undefined) => {
    if (date) {
      setSelectedDate(date);

      const selectedMonth = new Date(date.getFullYear(), date.getMonth(), 1);
      const currentMonthCheck = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1);

      if (selectedMonth.getTime() !== currentMonthCheck.getTime()) {
        setCurrentMonth(selectedMonth);
        fetchMonthSchedule(selectedMonth);
      } else {
        fetchDateSchedule(date);
      }
    }
  };

  const handleMonthChange = (month: Date) => {
    setCurrentMonth(month);
    fetchMonthSchedule(month);
  };

  const handleMenuClick = () => {
    setIsMobileOpen(true);
  };

  const handleAddSession = async (sessionData: any) => {
    try {
      const response = await fetch('/api/admin/session', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(sessionData),
      });

      if (response.ok) {
        // Refresh schedule data using the hook's refetch function
        refetch();
      } else {
        const errorData = await response.json();
        console.error('Failed to add session:', errorData);
        alert(`Gagal menambah session: ${errorData.error || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('Error adding session:', error);
      alert('Terjadi kesalahan saat menambah session');
    }
  };

<<<<<<< HEAD
  const handleDeleteSession = async (sessionId: number, sessionTitle: string) => {
    const confirmed = window.confirm(`Apakah Anda yakin ingin menghapus session "${sessionTitle}"?\n\nSemua materi dan tugas yang terkait juga akan dihapus.`);

    if (!confirmed) return;

    try {
      setDeletingSessionId(sessionId);
      const response = await fetch('/api/admin/session/delete', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ sessionId }),
      });

      if (response.ok) {
        // Refresh schedule data
        refetch();
        alert('Session berhasil dihapus');
      } else {
        const errorData = await response.json();
        console.error('Failed to delete session:', errorData);
        alert(`Gagal menghapus session: ${errorData.error || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('Error deleting session:', error);
      alert('Terjadi kesalahan saat menghapus session');
    } finally {
      setDeletingSessionId(null);
    }
  };

  const handleEditSession = async (sessionData: any) => {
    try {
      const response = await fetch('/api/admin/session/edit', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(sessionData),
      });

      if (response.ok) {
        refetch();
        setIsEditModalOpen(false);
        setEditingSession(null);
        alert('Session berhasil diupdate');
      } else {
        const errorData = await response.json();
        console.error('Failed to update session:', errorData);
        alert(`Gagal update session: ${errorData.error || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('Error updating session:', error);
      alert('Terjadi kesalahan saat update session');
    }
  };

  const openEditModal = (session: ScheduleItem) => {
    setEditingSession(session);
    setIsEditModalOpen(true);
  };

=======
>>>>>>> test-plagiarism-correction-feature
  const datesWithSchedule = scheduleData?.dates_with_schedule?.map(dateStr => new Date(dateStr)) || [];

  return (
    <div className="flex max-h-screen">
      <Sidebar isMobileOpen={isMobileOpen} setIsMobileOpen={setIsMobileOpen} />

      {/* <div className="p-3 sm:p-4 md:p-6 bg-gray-100 flex-1 min-w-0 overflow-y-auto"> */}
      <div className="flex flex-col flex-1 bg-gray-50">
        <Topbar onMenuClick={handleMenuClick} />

        <div className="flex-1 overflow-y-auto p-6">
          <div className="grid grid-cols-1 gap-6 pt-8">
            <Card>
              <CardHeader>
                <div className="flex justify-between items-center">
                  <CardTitle className="text-gray-900 flex items-center gap-2">
                    <FaGraduationCap className="text-blue-600" />
                    {userRole === 'ADMIN' ? 'Session Management' : 'My Schedule'} ({formattedHeaderDate})
                    {scheduleData?.user_role && (
                      <span className="text-sm bg-blue-100 text-blue-800 px-2 py-1 rounded-full capitalize">
                        {scheduleData.user_role}
                      </span>
                    )}
                  </CardTitle>
                  {userRole === 'ADMIN' && (
                    <Button onClick={() => setIsAddModalOpen(true)} className="flex items-center gap-2">
                      <FaPlus className="text-sm" />
                      Tambah Session
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex flex-col lg:flex-row gap-6">
                  <div className="flex-1">
                    {loading ? (
                      <div className="flex items-center justify-center py-12">
                        <FaSpinner className="animate-spin text-blue-500 mr-2" />
                        <span className="text-gray-600">Loading schedule...</span>
                      </div>
                    ) : error ? (
                      <div className="text-center py-12">
                        <div className="text-red-600 font-semibold mb-2">Error loading schedule</div>
                        <div className="text-gray-600 mb-4">{error}</div>
                        <Button onClick={() => fetchDateSchedule(selectedDate || new Date())}>Try Again</Button>
                      </div>
                    ) : dailySchedule.length > 0 ? (
                      dailySchedule.map((item, index) => (
                        <Card
                          key={index}
<<<<<<< HEAD
                          className={`mb-2 border border-gray-300 shadow-sm transition-all duration-200 ${item.course_code
                            ? 'hover:shadow-lg hover:border-blue-300 cursor-pointer hover:bg-blue-50'
                            : 'hover:shadow-md'
                            }`}
=======
                          className={`mb-2 border border-gray-300 shadow-sm transition-all duration-200 ${
                            item.course_code
                              ? 'hover:shadow-lg hover:border-blue-300 cursor-pointer hover:bg-blue-50'
                              : 'hover:shadow-md'
                          }`}
>>>>>>> test-plagiarism-correction-feature
                          onClick={() => {
                            if (item.course_code && item.id) {
                              router.push(`/course/${item.course_code}?sessionId=${item.id}`);
                            }
                          }}
                        >
                          <CardContent className="p-4">
                            <p className="text-sm font-bold text-gray-700 flex items-center gap-2 mb-2">
                              <FaUser className="text-blue-500" /> {item.teacher}
                            </p>

                            <p className="text-sm  text-gray-600 flex items-center gap-2 mb-2">
                              <FaClipboard className="text-green-500" /> {item.course_code}
                            </p>

                            <p className="text-sm text-gray-600 flex items-center gap-2 mb-2">
                              <FaUserFriends className="text-green-500" /> {item.class_name}
                            </p>

                            <p className="text-sm text-gray-600 flex items-center gap-2 mb-2">
                              <FaClock className="text-green-500" /> {item.time}
                            </p>

                            {item.session_title && (
                              <p className="text-sm text-gray-800 font-medium mb-1">
                                Session {item.session_number}: {item.session_title}
                              </p>
                            )}

                            {userRole === 'ADMIN' && (
                              <div className="flex gap-2 mt-3">
<<<<<<< HEAD
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="flex items-center gap-1"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    openEditModal(item);
                                  }}
                                >
=======
                                <Button size="sm" variant="outline" className="flex items-center gap-1">
>>>>>>> test-plagiarism-correction-feature
                                  <FaEdit className="text-xs" />
                                  Edit
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="flex items-center gap-1 text-red-600 hover:text-red-700"
<<<<<<< HEAD
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleDeleteSession(item.id, item.session_title || item.subject);
                                  }}
                                  disabled={deletingSessionId === item.id}
                                >
                                  {deletingSessionId === item.id ? (
                                    <FaSpinner className="text-xs animate-spin" />
                                  ) : (
                                    <FaTrash className="text-xs" />
                                  )}
                                  {deletingSessionId === item.id ? 'Menghapus...' : 'Hapus'}
=======
                                >
                                  <FaTrash className="text-xs" />
                                  Hapus
>>>>>>> test-plagiarism-correction-feature
                                </Button>
                              </div>
                            )}
                          </CardContent>
                        </Card>
                      ))
                    ) : (
                      <div className="text-gray-800 text-center lg:text-left py-12">
                        <div className="font-semibold mb-2">
                          {userRole === 'ADMIN' ? 'Belum ada session' : 'No scheduled activities'}
                        </div>
                        <div className="text-gray-600">
                          {userRole === 'ADMIN'
                            ? 'Belum ada session yang dijadwalkan untuk tanggal ini'
<<<<<<< HEAD
                            : `You don't have any scheduled activities for ${selectedDate ? format(selectedDate, 'MMM dd, yyyy') : 'this date'
                            }`}
=======
                            : `You don't have any scheduled activities for ${
                                selectedDate ? format(selectedDate, 'MMM dd, yyyy') : 'this date'
                              }`}
>>>>>>> test-plagiarism-correction-feature
                        </div>
                      </div>
                    )}
                  </div>
                  <div className="flex justify-center lg:justify-end items-start">
                    <Calendar
                      mode="single"
                      selected={selectedDate}
                      month={currentMonth}
                      onSelect={date => {
                        console.log('Calendar date selected:', {
                          selected: date?.toDateString(),
                          formatted: formatDate(date),
                        });
                        handleDateSelect(date);
                      }}
                      onMonthChange={handleMonthChange}
                      className="rounded-md border shadow-sm bg-white"
                      captionLayout="dropdown"
<<<<<<< HEAD
                      startMonth={new Date(1900, 0)}
                      endMonth={new Date(2100, 11)}
=======
>>>>>>> test-plagiarism-correction-feature
                      modifiers={{
                        hasSchedule: datesWithSchedule,
                      }}
                      modifiersClassNames={{
                        hasSchedule: 'has-schedule',
                      }}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      <AddSessionModal isOpen={isAddModalOpen} onClose={() => setIsAddModalOpen(false)} onSave={handleAddSession} />
<<<<<<< HEAD
      <EditSessionModal
        isOpen={isEditModalOpen}
        onClose={() => {
          setIsEditModalOpen(false);
          setEditingSession(null);
        }}
        onSave={handleEditSession}
        session={editingSession}
      />
=======
>>>>>>> test-plagiarism-correction-feature
    </div>
  );
};

export default Schedule;
