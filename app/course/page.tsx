'use client';

import Link from "next/link";
import Sidebar from "../_components/sidebar";
import { useEffect, useState } from "react";

const Course = () => {
  const [courses, setCourses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchCourses = async () => {
      try {
        const res = await fetch("/api/courses");
        const data = await res.json();
        setCourses(data.data || []);
      } catch (err) {
        setCourses([]);
      } finally {
        setLoading(false);
      }
    };
    fetchCourses();
  }, []);

  return (
    <div className="flex h-screen">
      <Sidebar />
      <div className="flex-1 bg-gray-100 p-8">
        <div className="flex justify-between items-center bg-gray-800 text-white p-2 rounded-md mb-6">
          <Link href="/dashboard" className="w-10 h-10 flex items-center justify-center rounded-full bg-white text-gray-800 shadow-md hover:bg-gray-200">
            ⬅
          </Link>
          <h1 className="text-xl font-bold">Course</h1>
          <div></div>
        </div>
        <div className="p-6 grid grid-cols-3 gap-6">
          {loading ? (
            <p>Loading...</p>
          ) : courses.length === 0 ? (
            <p>Tidak ada course.</p>
          ) : (
            courses.map((course, index) => (
              <Link
                key={course.id || index}
                href={{
                  pathname: `/course/${course.course_code}`,
                  query: { code: course.course_code },
                }}
                className="bg-gray-200 p-4 rounded-lg shadow-md border hover:bg-gray-300 transition-colors text-left block"
              >
                <h2 className="font-semibold">{course.course_name}</h2>
                <p className="text-sm text-gray-700">Kode: {course.course_code}</p>
                <p className="text-sm text-gray-700">{course.description}</p>
              </Link>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

export default Course;