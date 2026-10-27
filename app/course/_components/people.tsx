'use client';

import { useState, useEffect, useCallback } from 'react';
import { RefreshCw, User, Users } from 'lucide-react';
import { buildPeopleQuery } from '@/lib/course-class-selection';

interface Teacher {
  id: number;
  nama_lengkap: string;
  email: string;
  kode_guru?: string;
  niy?: string;
  profile_picture_url?: string;
  tmp_lahir?: string;
  tgl_lahir?: Date;
  gender?: string;
  telepon?: string;
  alamat?: string;
  agama?: string;
}

interface Student {
  id: number;
  nama_lengkap: string;
  email: string;
  nis?: string;
  nisn?: string;
  parent_contact?: string;
  roll_number?: number;
  enrollment_date?: Date;
  profile_picture_url?: string;
  tmp_lahir?: string;
  tgl_lahir?: Date;
  gender?: string;
  telepon?: string;
  alamat?: string;
  agama?: string;
}

interface PeopleProps {
  courseCode?: string;
  classId?: number | null;
}

const People = ({ courseCode, classId }: PeopleProps) => {
  const [activePeopleTab, setActivePeopleTab] = useState('Teacher');
  const [teacher, setTeacher] = useState<Teacher | null>(null);
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch teacher data
  const fetchTeacher = useCallback(async () => {
    if (!courseCode) return;

    try {
      setLoading(true);
      setError(null);

      const response = await fetch(`/api/courses/${courseCode}/people?${buildPeopleQuery('teacher', classId)}`);
      const result = await response.json();

      if (result.success) {
        setTeacher(result.data.teacher);
      } else {
        setError(result.message || 'Failed to load teacher data');
        setTeacher(null);
      }
    } catch (err) {
      console.error('Error fetching teacher:', err);
      setError('Network error while loading teacher data');
      setTeacher(null);
    } finally {
      setLoading(false);
    }
  }, [courseCode, classId]);

  // Fetch students data
  const fetchStudents = useCallback(async () => {
    if (!courseCode) return;

    try {
      setLoading(true);
      setError(null);

      const response = await fetch(`/api/courses/${courseCode}/people?${buildPeopleQuery('students', classId)}`);
      const result = await response.json();

      if (result.success) {
        setStudents(result.data.students || []);
      } else {
        setError(result.message || 'Failed to load students data');
        setStudents([]);
      }
    } catch (err) {
      console.error('Error fetching students:', err);
      setError('Network error while loading students data');
      setStudents([]);
    } finally {
      setLoading(false);
    }
  }, [courseCode, classId]);

  // Fetch all people data
  const fetchAllPeople = useCallback(async () => {
    if (!courseCode) return;

    try {
      setLoading(true);
      setError(null);

      const response = await fetch(`/api/courses/${courseCode}/people?${buildPeopleQuery('all', classId)}`);
      const result = await response.json();

      if (result.success) {
        setTeacher(result.data.teacher);
        setStudents(result.data.students || []);
      } else {
        setError(result.message || 'Failed to load people data');
        setTeacher(null);
        setStudents([]);
      }
    } catch (err) {
      console.error('Error fetching people:', err);
      setError('Network error while loading people data');
      setTeacher(null);
      setStudents([]);
    } finally {
      setLoading(false);
    }
  }, [courseCode, classId]);

  // Load data when component mounts or courseCode changes
  useEffect(() => {
    if (courseCode) {
      fetchAllPeople();
    }
  }, [courseCode, fetchAllPeople]);

  // Load specific data when tab changes
  useEffect(() => {
    if (courseCode && activePeopleTab === 'Teacher' && !teacher) {
      fetchTeacher();
    } else if (courseCode && activePeopleTab === 'Students' && students.length === 0) {
      fetchStudents();
    }
  }, [activePeopleTab, courseCode, teacher, students.length, fetchTeacher, fetchStudents]);
  return (
    <div className="flex-1">
      <div className="border border-gray-300 rounded-lg p-6 shadow-sm">
        {/* Header with refresh button */}
        {/* <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-800">Course People</h2>
          <button
            onClick={fetchAllPeople}
            disabled={loading}
            className="flex items-center gap-2 px-3 py-1 rounded text-gray-600 hover:bg-gray-200 transition-colors disabled:opacity-50"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div> */}
        {/* Tab Navigation */}
        <div className="flex border-b border-gray-300 mb-6">
          {['Teacher', 'Students'].map(tab => (
            <button
              key={tab}
              onClick={() => setActivePeopleTab(tab)}
              className={`px-4 py-2 text-gray-700 font-semibold text-base ${
                activePeopleTab === tab ? 'border-b-2 border-blue-500 text-blue-500' : 'hover:text-blue-500'
              }`}
            >
              {tab}{' '}
              {tab === 'Teacher' ? (
                <User size={16} className="inline ml-1" />
              ) : (
                <Users size={16} className="inline ml-1" />
              )}
            </button>
          ))}
        </div>
        {/* Error message */}
        {error && (
          <div className="bg-red-50 border-l-4 border-red-400 p-3 mb-4 rounded">
            <div className="flex items-center">
              <div className="text-sm text-red-700">
                <strong>Error:</strong> {error}
              </div>
            </div>
          </div>
        )}
        {/* Loading state */}
        {loading && (
          <div className="flex items-center justify-center py-8">
            <div className="text-center">
              <RefreshCw size={24} className="animate-spin mx-auto mb-2 text-blue-500" />
              <p className="text-gray-600">Loading {activePeopleTab.toLowerCase()}...</p>
            </div>
          </div>
        )}{' '}
        {/* Teacher Tab */}
        {activePeopleTab === 'Teacher' && !loading && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {teacher ? (
              <div className="border border-gray-200 rounded-lg p-4 shadow-sm">
                <div className="flex flex-col items-center">
                  <div className="w-16 h-16 rounded-full bg-blue-100 mb-3 flex items-center justify-center">
                    <User className="text-blue-600" size={32} />
                  </div>
                  <h3 className="text-lg font-semibold text-gray-800 text-center mb-2">{teacher.nama_lengkap}</h3>
                  {teacher.niy && <p className="text-sm text-gray-600">NIY: {teacher.niy}</p>}
                </div>
              </div>
            ) : (
              <div className="border border-gray-200 rounded-lg p-4 shadow-sm flex flex-col items-center justify-center">
                <User className="text-gray-400 mb-2" size={32} />
                <span className="text-gray-500">No teacher assigned</span>
              </div>
            )}
          </div>
        )}{' '}
        {/* Students Tab */}
        {activePeopleTab === 'Students' && !loading && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {students.length > 0 ? (
              students.map((student, index) => (
                <div key={student.id || index} className="border border-gray-200 rounded-lg p-4 shadow-sm">
                  <div className="flex flex-col items-center">
                    <div className="w-12 h-12 rounded-full bg-green-100 mb-3 flex items-center justify-center">
                      <User className="text-green-600" size={24} />
                    </div>
                    <h3 className="text-base font-semibold text-gray-800 text-center mb-2">{student.nama_lengkap}</h3>
                    {student.nis && <p className="text-sm text-gray-600">NIS: {student.nis}</p>}
                  </div>
                </div>
              ))
            ) : (
              <div className="col-span-full border border-gray-200 rounded-lg p-8 shadow-sm flex flex-col items-center justify-center">
                <Users className="text-gray-400 mb-2" size={48} />
                <span className="text-gray-500 text-lg">No students enrolled</span>
                <span className="text-gray-400 text-sm">Students will appear here when they enroll in this course</span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default People;
