'use client';

import { useState } from "react";

const Session = ({ sessions, activeSession, setActiveSession }: { sessions: any[], activeSession: number, setActiveSession: (id: number) => void }) => {
  const [isFabOpen, setIsFabOpen] = useState(false);

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
              {currentSession.materials.map((material: string, index: number) => (
                <li key={index} className="text-base">{material}</li>
              ))}
            </ul>

            <h4 className="text-lg font-semibold text-gray-800 mb-2">Pembahasan di buku</h4>
            <ul className="list-disc list-inside mb-6 text-gray-700">
              {currentSession.books.map((book: string, index: number) => (
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
              {currentSession?.todos.map((todo: any, index: number) => (
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

              <div className="absolute top-12 left-1/2 transform -translate-x-1/2 flex items-center justify-center">
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
  );
};

export default Session;