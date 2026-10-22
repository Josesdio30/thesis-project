'use client';

import { useEffect, useMemo, useState } from 'react';
import { Search } from 'lucide-react';

type Feature = 'ai_grading' | 'plagiarism';

interface AccessRecord {
  scope_type: string;
  scope_id: string;
  feature: Feature;
  enabled: boolean;
}

interface Offering {
  class_name: string | null;
  grade_level: string | null;
  teacher_name: string | null;
  is_active: boolean;
}

interface Course {
  id: string;
  code: string;
  name: string;
  description: string | null;
  offerings: Offering[];
}

export default function AccessControlTab() {
  const [courses, setCourses] = useState<Course[]>([]);
  const [access, setAccess] = useState<AccessRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  useEffect(() => {
    fetch('/api/admin/access-control')
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          setCourses(data.data.courses);
          setAccess(data.data.access);
        } else {
          setError(data.error || 'Failed to load');
        }
      })
      .catch(() => setError('Failed to load'))
      .finally(() => setLoading(false));
  }, []);

  const isEnabled = (courseId: string, feature: Feature) =>
    access.find(a => a.scope_id === courseId && a.feature === feature)?.enabled ?? false;

  const toggle = async (courseId: string, feature: Feature) => {
    const next = !isEnabled(courseId, feature);
    setAccess(prev => [
      ...prev.filter(a => !(a.scope_id === courseId && a.feature === feature)),
      { scope_type: 'course', scope_id: courseId, feature, enabled: next },
    ]);
    try {
      const res = await fetch('/api/admin/access-control', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ course_id: courseId, feature, enabled: next }),
      });
      const data = await res.json();
      if (!data.success) throw new Error();
    } catch {
      setAccess(prev => [
        ...prev.filter(a => !(a.scope_id === courseId && a.feature === feature)),
        { scope_type: 'course', scope_id: courseId, feature, enabled: !next },
      ]);
      setError('Failed to update access');
    }
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return courses;
    return courses.filter(
      c =>
        c.name.toLowerCase().includes(q) ||
        c.code.toLowerCase().includes(q) ||
        c.offerings.some(o => o.class_name?.toLowerCase().includes(q))
    );
  }, [courses, search]);

  const FeatureToggle = ({
    courseId,
    feature,
    label,
  }: {
    courseId: string;
    feature: Feature;
    label: string;
  }) => {
    const on = isEnabled(courseId, feature);
    return (
      <button
        onClick={() => toggle(courseId, feature)}
        className={`flex items-center justify-between gap-3 w-44 px-3 py-2 rounded-md border text-sm transition-colors ${
          on
            ? 'border-blue-600 bg-blue-50 text-blue-700'
            : 'border-gray-300 bg-white text-gray-500 hover:bg-gray-50'
        }`}
        aria-pressed={on}
      >
        <span className="font-medium">{label}</span>
        <span
          className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
            on ? 'bg-blue-600' : 'bg-gray-300'
          }`}
        >
          <span
            className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
              on ? 'translate-x-5' : 'translate-x-1'
            }`}
          />
        </span>
      </button>
    );
  };

  if (loading) return <p className="text-gray-500">Loading…</p>;

  return (
    <div>
      <p className="text-gray-500 text-sm mb-4">
        Enable AI grading and plagiarism detection per course. Teachers can only use a feature once
        its course is enabled here.
      </p>

      {error && (
        <div className="mb-4 px-4 py-2 rounded-md text-sm bg-red-100 text-red-800">{error}</div>
      )}

      <div className="relative mb-4 max-w-sm">
        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search course or class…"
          className="w-full border border-gray-300 rounded-md pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      <div className="space-y-3">
        {filtered.length === 0 ? (
          <p className="text-gray-400 text-sm">No courses found.</p>
        ) : (
          filtered.map(course => (
            <div
              key={course.id}
              className="bg-white rounded-lg shadow p-4 flex flex-col lg:flex-row lg:items-center gap-4"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold text-gray-800">{course.name}</h3>
                  <span className="text-xs text-gray-400">{course.code}</span>
                </div>
                {course.description && (
                  <p className="text-xs text-gray-500 mt-0.5 line-clamp-1">
                    {course.description}
                  </p>
                )}
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {course.offerings.length === 0 ? (
                    <span className="text-xs text-gray-400">No classes assigned</span>
                  ) : (
                    course.offerings.map((o, i) => (
                      <span
                        key={i}
                        className="text-xs bg-gray-100 text-gray-600 rounded px-2 py-0.5"
                        title={o.teacher_name ? `Teacher: ${o.teacher_name}` : undefined}
                      >
                        {o.class_name ?? 'Class'}
                        {o.grade_level ? ` · ${o.grade_level}` : ''}
                        {o.teacher_name ? ` · ${o.teacher_name}` : ''}
                      </span>
                    ))
                  )}
                </div>
              </div>

              <div className="flex flex-col sm:flex-row gap-2 flex-shrink-0">
                <FeatureToggle courseId={course.id} feature="ai_grading" label="AI Grading" />
                <FeatureToggle courseId={course.id} feature="plagiarism" label="Plagiarism" />
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
