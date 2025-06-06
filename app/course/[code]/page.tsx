'use client';

import Sidebar from "../../_components/sidebar";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import Forum from "../_components/forum";
import Session from "../_components/session";
import People from "../_components/people";

const CourseDetail = () => {
  const params = useParams();
  const code = typeof params === "object" && "code" in params ? params["code"] : null;

  const [course, setCourse] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("Session");
  const [activeSession, setActiveSession] = useState(1);

  useEffect(() => {
    if (!code) return;
    const fetchCourse = async () => {
      try {
        const res = await fetch(`/api/courses/${code}`);
        const data = await res.json();
        setCourse(data.data || null);
      } catch (err) {
        setCourse(null);
      } finally {
        setLoading(false);
      }
    };
    fetchCourse();
  }, [code]);

  if (loading) {
    return (
      <div className="flex h-screen">
        <Sidebar />
        <div className="flex-1 flex items-center justify-center">Loading...</div>
      </div>
    );
  }

  if (!course) {
    return (
      <div className="flex h-screen">
        <Sidebar />
        <div className="flex-1 flex items-center justify-center">Course Not Found</div>
      </div>
    );
  }
  const classCourse = course.class_courses?.[0];
  const teacher = classCourse?.teacher || {};
  const students = classCourse?.students || [];
  const sessions = classCourse?.sessions || [];
  const syllabus = classCourse?.syllabus || [];

  return (
    <div className="flex h-screen">
      <Sidebar />
      <div className="flex-1 bg-white p-8 overflow-y-auto">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center">
            <Link
              href="/course"
              className="w-10 h-10 flex items-center justify-center rounded-full bg-gray-200 text-gray-800 shadow-md hover:bg-gray-300 mr-4"
            >
              ⬅
            </Link>
            <div>
              <div className="flex items-center">
                <h1 className="text-2xl font-bold text-gray-800">{course.course_name}</h1>
              </div>
              <div className="flex items-center mt-1">
                <span className="text-gray-600 mr-2">🔢 {course.course_code}</span>
                <span className="text-gray-600 mr-2">•</span>
                <span className="text-gray-600 mr-2">📚 {classCourse?.class_name}</span>
              </div>
              <div className="flex items-center mt-1">
                <span className="text-gray-600 mr-2">👤</span>
                <span className="text-gray-600">{teacher?.nama_lengkap}</span>
              </div>
            </div>
          </div>
        </div>
        <div className="flex border-b border-gray-300 mb-6">
          {["Session", "Syllabus", "Assignment", "Forum", "Scoring", "People"].map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-6 py-3 text-gray-700 font-semibold text-base ${
                activeTab === tab ? "border-b-4 border-blue-500 text-blue-500" : "hover:text-blue-500"
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        {activeTab === "Session" && (
          <Session
            sessions={sessions}
            activeSession={activeSession}
            setActiveSession={setActiveSession}
          />
        )}

        {activeTab === "Syllabus" && (
          <div className="flex-1">
            <div className="border border-gray-300 rounded-lg p-6 shadow-sm">
              <h3 className="text-xl font-bold text-gray-800 mb-3">Materi pokok dan Learning Outcomes</h3>
              {syllabus ? (
                <div
                  className="prose max-w-none"
                  dangerouslySetInnerHTML={{ __html: syllabus }}
                />
              ) : (
                <p className="text-base mb-2">Belum ada data.</p>
              )}
            </div>
          </div>
        )}

        {activeTab === "Forum" && (
          <div>
            <Forum />
          </div>
        )}

        {activeTab === "People" && (
          <People teacher={teacher} students={students} />
        )}

        {activeTab !== "Session" && activeTab !== "Syllabus" && activeTab !== "Forum" && activeTab !== "People" && (
          <div>
            <p className="text-gray-700">Konten untuk tab {activeTab} akan ditambahkan di sini.</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default CourseDetail;