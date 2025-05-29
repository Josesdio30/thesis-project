'use client';

import Sidebar from "../../_components/sidebar";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { useState } from "react";
import Forum from "../_components/forum";
import Session from "../_components/session";
import People from "../_components/people";

const CourseDetail = () => {
  const params = useParams();
  const searchParams = useSearchParams();
  const codeFromParams = params && typeof params === "object" && "code" in params ? params['code'] : null;
  const codeFromQuery = searchParams.get("code");
  const code = codeFromParams || codeFromQuery;
  console.log("final code:", code);

  const courses = [
    { name: "Bahasa Inggris Lanjut (A) (Peminatan)", code: "BI0092", class: "XI - 1", teacher: "Benedictus Dhaniar Adra, D243 - Primary Teacher" },
    { name: "Matematika Wajib", code: "MT0011", class: "XI - 2", teacher: "Caecilia Tjahjanti, D123 - Primary Teacher" },
    { name: "Fisika Lanjut", code: "FS0045", class: "XI - 3", teacher: "Jane Smith, D456 - Primary Teacher" },
    { name: "Kimia Dasar", code: "KM0032", class: "XI - 4", teacher: "Alice Johnson, D789 - Primary Teacher" },
    { name: "Sejarah Indonesia", code: "SJ0021", class: "XI - 5", teacher: "Ika Kristianingsih, D012 - Primary Teacher" },
    { name: "Ekonomi", code: "EK0050", class: "XI - 6", teacher: "Carol White, D345 - Primary Teacher" },
  ];

  console.log("Available course codes:", courses.map((c) => c.code));

  const course = courses.find((c) => c.code === code);
  const [activeTab, setActiveTab] = useState("Session");
  const [activeSession, setActiveSession] = useState(1);
  const [isFabOpen, setIsFabOpen] = useState(false);

  const sessions = [
    {
      id: 1,
      title: "Pembahasan",
      materials: ["Pengulangan beda variabel", "Lorem ipsum kaffe muspi"],
      books: [
        "Buku tematik halaman 243",
        "Lorem ipsum kaffe muspi",
        "Lorem ipsum kaffe muspi",
        "Lorem ipsum kaffe muspi",
        "Lorem ipsum kaffe muspi",
      ],
      todos: [
        { name: "Pembahasan Algebra", type: "file", url: "/files/pembahasan-algebra.pdf" },
        { name: "Materi Tambahan", type: "link", url: "https://example.com/materi-tambahan" },
        { name: "Latihan Soal 1", type: "file", url: "https://example.com/latihan-soal-1.pdf" },
        { name: "Video Pembelajaran", type: "link", url: "https://youtube.com/watch?v=example" },
        { name: "Dokumen Referensi", type: "file", url: "/files/referensi.pdf" },
        { name: "Artikel Pendukung", type: "link", url: "https://example.com/artikel" },
        { name: "Lembar Kerja", type: "file", url: "/files/lembar-kerja.pdf" },
      ],
      start: "15 Maret 2025 07:20 GMT+7",
      end: "15 Maret 2025 09:00 GMT+7",
    },
    { id: 2, title: "Pengenalan", materials: [], books: [], todos: [], start: "22 Maret 2025 07:20 GMT+7", end: "22 Maret 2025 09:00 GMT+7" },
  ];

  const syllabus = [
    "Penerapan dasar-dasar pemrograman berorientasi objek: memahami konsep pemrograman berorientasi objek, seperti enkapsulasi, pewarisan, dan polimorfisme, serta menerapkannya dalam pemrograman.",
    "Mengenal fungsi-fungsi utama, metode fungsi dalam kelompok.",
    "Mengenal dan memahami dasar-dasar algoritma.",
    "Mengenal dan memahami dasar-dasar struktur data.",
    "Mengenal dan memahami dasar-dasar database.",
    "Loren ipsum kaffe muspi.",
    "Loren ipsum kaffe muspi.",
    "Loren ipsum kaffe muspi.",
  ];

  const teacher = {
    name: "Benedictus Dhaniar Adra",
    image: "",
  };

  const students = [
    { name: "Barsty Michael Jordan", image: "" },
    { name: "Jordana Jovanika Simbolon", image: "" },
    { name: "Asep Mulyadi", image: "" },
    { name: "Michelle Adelle Antonio", image: "" },
    { name: "Joe Doe", image: "" },
    { name: "Grain Quack", image: "" },
  ];

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
                <h1 className="text-2xl font-bold text-gray-800">{course?.name || "Course Not Found"}</h1>
              </div>
              <div className="flex items-center mt-1">
                <span className="text-gray-600 mr-2">🔢 {course?.code}</span>
                <span className="text-gray-600 mr-2">•</span>
                <span className="text-gray-600 mr-2">📚 {course?.class}</span>
              </div>
              <div className="flex items-center mt-1">
                <span className="text-gray-600 mr-2">👤</span>
                <span className="text-gray-600">{course?.teacher}</span>
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
              <ul className="list-disc list-inside text-gray-700">
                {syllabus.map((item, index) => (
                  <li key={index} className="text-base mb-2">{item}</li>
                ))}
              </ul>
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
        
        
        {activeTab !== "Session" && activeTab !== "Syllabus" && activeTab !== "Forum"  && activeTab !== "People" && (
          <div>
            <p className="text-gray-700">Konten untuk tab {activeTab} akan ditambahkan di sini.</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default CourseDetail;