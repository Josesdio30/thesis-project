'use client';

import Sidebar from "../../_components/sidebar";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { useState } from "react";
import Forum from "../_components/forum";

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

  const currentSession = sessions.find((s) => s.id === activeSession);

  const handleAddFile = () => {
    console.log("Add File clicked");
    setIsFabOpen(false);
  };

  const handleAddVideo = () => {
    console.log("Add Video clicked");
    setIsFabOpen(false);
  };

  const handleAddLink = () => {
    console.log("Add Link clicked");
    setIsFabOpen(false);
  };

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
          <div className="flex-1">
            <div className="flex space-x-3 mb-6 overflow-x-auto">
              {sessions.map((session) => (
                <button
                  key={session.id}
                  onClick={() => setActiveSession(session.id)}
                  className={`px-4 py-2 rounded-md border border-gray-300 ${
                    activeSession === session.id
                      ? "bg-blue-500 text-white border-blue-500"
                      : "bg-gray-200 text-gray-700 hover:bg-gray-300"
                  }`}
                >
                  Session {session.id}
                </button>
              ))}
              <button className="px-4 py-2 bg-gray-200 text-gray-700 rounded-md border border-gray-300 hover:bg-gray-300">
                13 More
              </button>
            </div>

            {currentSession && (
              <div className="border border-gray-300 rounded-lg p-6 shadow-sm flex">
                <div className="flex-1">
                  <h3 className="text-xl font-bold text-gray-800 mb-3">Nama Materi</h3>
                  <h4 className="text-lg font-semibold text-gray-800 mb-2">{currentSession.title}</h4>
                  <ul className="list-disc list-inside mb-6 text-gray-700">
                    {currentSession.materials.map((material, index) => (
                      <li key={index} className="text-base">{material}</li>
                    ))}
                  </ul>

                  <h4 className="text-lg font-semibold text-gray-800 mb-2">Pembahasan di buku</h4>
                  <ul className="list-disc list-inside mb-6 text-gray-700">
                    {currentSession.books.map((book, index) => (
                      <li key={index} className="text-base">{book}</li>
                    ))}
                  </ul>

                  <div className="mt-6">
                    <p className="text-gray-700 font-semibold">Start</p>
                    <p className="text-gray-700">{currentSession.start}</p>
                    <p className="text-gray-700 font-semibold mt-2">End</p>
                    <p className="text-gray-700">{currentSession.end}</p>
                  </div>
                </div>
                <div className="w-1/4 ml-6 p-4 bg-gray-100 rounded-lg shadow-md border border-gray-300 h-fit relative">
                  <h3 className="text-lg font-semibold text-gray-800 mb-3">Things to do in this Session</h3>
                  <ul className="space-y-3">
                    {currentSession?.todos.map((todo, index) => (
                      <li key={index} className="flex items-center justify-between">
                        <a
                          href={todo.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center text-gray-700 hover:text-blue-500"
                        >
                          <span className="mr-2">{todo.type === "file" ? "📖" : "🔗"}</span>
                          <span className="text-base">{todo.name}</span>
                        </a>
                        <span className="text-gray-500">↔</span>
                      </li>
                    ))}
                  </ul>

                  <div className="relative mt-4">
                    <button
                      onClick={() => setIsFabOpen(!isFabOpen)}
                      className={`w-12 h-12 bg-blue-500 text-white rounded-full flex items-center justify-center shadow-lg hover:bg-blue-600 transition-transform duration-300 ${
                        isFabOpen ? "rotate-45" : "rotate-0"
                      }`}
                    >
                      <span className="text-2xl">+</span>
                    </button>

                    <div className="absolute top-12 transform -translate-x-1/2 flex items-center justify-center">
                      <button
                        onClick={handleAddFile}
                        className={`absolute flex items-center space-x-2 px-4 py-2 bg-white text-gray-800 rounded-full shadow-md hover:bg-gray-100 transform transition-all duration-300 ease-in-out ${
                          isFabOpen
                            ? "translate-y-10 -translate-x-16 opacity-100"
                            : "translate-y-0 translate-x-0 opacity-0"
                        }`}
                      >
                        <span>📄</span>
                        <span>File</span>
                      </button>
                      <button
                        onClick={handleAddVideo}
                        className={`absolute flex items-center space-x-2 px-4 py-2 bg-white text-gray-800 rounded-full shadow-md hover:bg-gray-100 transform transition-all duration-300 ease-in-out ${
                          isFabOpen ? "translate-y-16 opacity-100" : "translate-y-0 opacity-0"
                        }`}
                        style={{ transitionDelay: "50ms" }}
                      >
                        <span>🎥</span>
                        <span>Video</span>
                      </button>
                      <button
                        onClick={handleAddLink}
                        className={`absolute flex items-center space-x-2 px-4 py-2 bg-white text-gray-800 rounded-full shadow-md hover:bg-gray-100 transform transition-all duration-300 ease-in-out ${
                          isFabOpen
                            ? "translate-y-10 translate-x-16 opacity-100"
                            : "translate-y-0 translate-x-0 opacity-0"
                        }`}
                        style={{ transitionDelay: "100ms" }}
                      >
                        <span>🔗</span>
                        <span>Link</span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === "Forum" && (
          <div>
            <Forum />
          </div>
        )}
        
        {activeTab !== "Session" && activeTab !== "Forum" && (
          <div>
            <p className="text-gray-700">Konten untuk tab {activeTab} akan ditambahkan di sini.</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default CourseDetail;