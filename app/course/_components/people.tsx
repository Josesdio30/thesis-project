'use client';

import { useState } from "react";

const People = ({ teacher, students }: { teacher: { name: string; image: string }, students: { name: string; image: string }[] }) => {
  const [activePeopleTab, setActivePeopleTab] = useState("Teacher");

  return (
    <div className="flex-1">
      <div className="border border-gray-300 rounded-lg p-6 shadow-sm">
        <div className="flex border-b border-gray-300 mb-6">
          {["Students", "Teacher"].map((tab) => (
            <button
              key={tab}
              onClick={() => setActivePeopleTab(tab)}
              className={`px-4 py-2 text-gray-700 font-semibold text-base ${
                activePeopleTab === tab ? "border-b-2 border-blue-500 text-blue-500" : "hover:text-blue-500"
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        {activePeopleTab === "Teacher" && (
          <div className="grid grid-cols-3 gap-4">
            <div className="border border-gray-200 rounded-lg p-4 shadow-sm flex flex-col items-center">
              <div className="w-12 h-12 rounded-full bg-gray-300 mb-3 flex items-center justify-center">
                <span className="text-gray-600 text-xl">👤</span>
              </div>
              <span className="text-gray-700 text-base text-center">{teacher.name}</span>
            </div>
          </div>
        )}

        {activePeopleTab === "Students" && (
          <div className="grid grid-cols-3 gap-4">
            {students.map((student, index) => (
              <div key={index} className="border border-gray-200 rounded-lg p-4 shadow-sm flex flex-col items-center">
                <div className="w-12 h-12 rounded-full bg-gray-300 mb-3 flex items-center justify-center">
                  <span className="text-gray-600 text-xl">👤</span>
                </div>
                <span className="text-gray-700 text-base text-center">{student.name}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default People;