'use client'

import router from "next/router";
import Sidebar from "../_components/sidebar";

const Course = () => {
  const courses = [
    { name: "Bahasa Inggris Lanjut (A) (Peminatan)", code: "BI0092", class: "XI - 1" },
    { name: "Matematika Wajib", code: "MT0011", class: "XI - 2" },
    { name: "Fisika Lanjut", code: "FS0045", class: "XI - 3" },
    { name: "Kimia Dasar", code: "KM0032", class: "XI - 4" },
    { name: "Sejarah Indonesia", code: "SJ0021", class: "XI - 5" },
    { name: "Ekonomi", code: "EK0050", class: "XI - 6" },
  ];

  return (
    <div className="flex h-screen">
      <Sidebar />
      
      <div className="flex-1 bg-gray-100 p-8">
        <div className="flex justify-between items-center bg-gray-800 text-white p-2 rounded-md mb-6">
          <button
            onClick={() => router.push("/dashboard")}
            className="w-10 h-10 flex items-center justify-center rounded-full bg-white text-gray-800 shadow-md hover:bg-gray-200"
          >
            ⬅
          </button>
          <h1 className="text-xl font-bold">Course </h1>
          <div></div>
        </div>

        
        <div className="p-6 grid grid-cols-3 gap-6">
          {courses.map((course, index) => (
            <div key={index} className="bg-gray-200 p-4 rounded-lg shadow-md border">
              <h2 className="font-semibold">{course.name}</h2>
              <p className="text-sm text-gray-700">Kode: {course.code}</p>
              <p className="text-sm text-gray-700">Kelas: {course.class}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default Course;
