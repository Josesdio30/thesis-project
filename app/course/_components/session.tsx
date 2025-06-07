// 'use client';

// import { useState } from 'react';

// const Session = ({
//   sessions,
//   activeSession,
//   setActiveSession,
// }: {
//   sessions: any[];
//   activeSession: number;
//   setActiveSession: (id: number) => void;
// }) => {
//   const [isFabOpen, setIsFabOpen] = useState(false);
//   const currentSession = sessions.find(s => s.id === activeSession);
//   const handleAddFile = () => {
//     setIsFabOpen(false);
//   };
//   const handleAddVideo = () => {
//     setIsFabOpen(false);
//   };

//   const handleAddLink = () => {
//     setIsFabOpen(false);
//   };

//   return (
//     <div className="flex-1">
//       <div className="flex space-x-3 mb-6 overflow-x-auto whitespace-nowrap">
//         {sessions.map(session => (
//           <button
//             key={session.id}
//             onClick={() => setActiveSession(session.id)}
//             className={`px-4 py-2 rounded-md border border-gray-300 ${
//               activeSession === session.id
//                 ? 'bg-blue-500 text-white border-blue-500'
//                 : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
//             }`}
//           >
//             Session {session.session_number}
//           </button>
//         ))}
//       </div>

//       {currentSession ? (
//         <div className="border border-gray-300 rounded-lg p-6 shadow-sm flex">
//           <div className="flex-1">
//             <h3 className="text-xl font-bold text-gray-800 mb-3">Nama Materi</h3>
//             <h4 className="text-lg font-semibold text-gray-800 mb-2">{currentSession.title}</h4>
//             <ul className="list-disc list-inside mb-6 text-gray-700">
//               {currentSession.materials?.length > 0 ? (
//                 currentSession.materials.map((material: any, index: number) => (
//                   <li key={index} className="text-base">
//                     {material.title}
//                   </li>
//                 ))
//               ) : (
//                 <li className="text-base">No materials available.</li>
//               )}
//             </ul>

//             {/* Ganti 'books' dengan informasi lain atau hapus jika tidak diperlukan */}
//             <h4 className="text-lg font-semibold text-gray-800 mb-2">Resources</h4>
//             <ul className="list-disc list-inside mb-6 text-gray-700">
//               {currentSession.resources?.length > 0 ? (
//                 currentSession.resources.map((resource: any, index: number) => (
//                   <li key={index} className="text-base">
//                     {resource.file_name}
//                   </li>
//                 ))
//               ) : (
//                 <li className="text-base">No resources available.</li>
//               )}
//             </ul>

//             <div className="mt-6">
//               <p className="text-gray-700 font-semibold">Start</p>
//               <p className="text-gray-700">{currentSession.start_time}</p>
//               <p className="text-gray-700 font-semibold mt-2">End</p>
//               <p className="text-gray-700">{currentSession.end_time}</p>
//             </div>
//           </div>
//           <div className="w-1/4 ml-6 p-4 bg-gray-100 rounded-lg shadow-md border border-gray-300 h-fit relative">
//             <h3 className="text-lg font-semibold text-gray-800 mb-3">Things to do in this Session</h3>
//             <ul className="space-y-3">
//               {currentSession.resources?.length > 0 ? (
//                 currentSession.resources.map((resource: any, index: number) => (
//                   <li key={index} className="flex items-center justify-between">
//                     <a
//                       href={resource.file_url}
//                       target="_blank"
//                       rel="noopener noreferrer"
//                       className="flex items-center text-gray-700 hover:text-blue-500"
//                     >
//                       <span className="mr-2">{resource.file_type === 'pdf' ? '📖' : '🔗'}</span>
//                       <span className="text-base">{resource.file_name}</span>
//                     </a>
//                     <span className="text-gray-500">↔</span>
//                   </li>
//                 ))
//               ) : (
//                 <li className="text-base text-gray-700">No resources to do.</li>
//               )}
//             </ul>

//             <div className="relative mt-4">
//               <button
//                 onClick={() => setIsFabOpen(!isFabOpen)}
//                 className={`w-12 h-12 bg-blue-500 text-white rounded-full flex items-center justify-center shadow-lg hover:bg-blue-600 transition-transform duration-300 ${
//                   isFabOpen ? 'rotate-45' : 'rotate-0'
//                 }`}
//               >
//                 <span className="text-2xl">+</span>
//               </button>

//               <div className="absolute top-12 left-1/2 transform -translate-x-1/2 flex items-center justify-center">
//                 <button
//                   onClick={handleAddFile}
//                   className={`absolute flex items-center space-x-2 px-4 py-2 bg-white text-gray-800 rounded-full shadow-md hover:bg-gray-100 transform transition-all duration-300 ease-in-out ${
//                     isFabOpen ? 'translate-y-10 -translate-x-16 opacity-100' : 'translate-y-0 translate-x-0 opacity-0'
//                   }`}
//                 >
//                   <span>📄</span>
//                   <span>File</span>
//                 </button>
//                 <button
//                   onClick={handleAddVideo}
//                   className={`absolute flex items-center space-x-2 px-4 py-2 bg-white text-gray-800 rounded-full shadow-md hover:bg-gray-100 transform transition-all duration-300 ease-in-out ${
//                     isFabOpen ? 'translate-y-16 opacity-100' : 'translate-y-0 opacity-0'
//                   }`}
//                   style={{ transitionDelay: '50ms' }}
//                 >
//                   <span>🎥</span>
//                   <span>Video</span>
//                 </button>
//                 <button
//                   onClick={handleAddLink}
//                   className={`absolute flex items-center space-x-2 px-4 py-2 bg-white text-gray-800 rounded-full shadow-md hover:bg-gray-100 transform transition-all duration-300 ease-in-out ${
//                     isFabOpen ? 'translate-y-10 translate-x-16 opacity-100' : 'translate-y-0 translate-x-0 opacity-0'
//                   }`}
//                   style={{ transitionDelay: '100ms' }}
//                 >
//                   <span>🔗</span>
//                   <span>Link</span>
//                 </button>
//               </div>
//             </div>
//           </div>
//         </div>
//       ) : (
//         <p className="text-gray-700">Session not found.</p>
//       )}
//     </div>
//   );
// };

// export default Session;

'use client';

import { useState } from 'react';
import { FaFile, FaVideo, FaLink, FaPlus, FaClock, FaBookOpen, FaDownload, FaExternalLinkAlt } from 'react-icons/fa';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';

interface Material {
  title: string;
  description?: string;
}

interface Resource {
  file_name: string;
  file_url: string;
  file_type: 'pdf' | 'video' | 'link' | string;
}

interface SessionData {
  id: number;
  session_number: number;
  title: string;
  description?: string;
  start_time: string;
  end_time: string;
  materials?: Material[];
  resources?: Resource[];
}

interface SessionProps {
  sessions: SessionData[];
  activeSession: number;
  setActiveSession: (id: number) => void;
}

const getResourceIcon = (fileType: string) => {
  switch (fileType) {
    case 'pdf':
      return '📖';
    case 'video':
      return '🎥';
    case 'link':
      return '🔗';
    default:
      return '📄';
  }
};

const SessionSelector = ({
  sessions,
  activeSession,
  setActiveSession,
}: {
  sessions: SessionData[];
  activeSession: number;
  setActiveSession: (id: number) => void;
}) => (
  <div className="flex space-x-3 mb-6 overflow-x-auto pb-2">
    {sessions.map(session => (
      <button
        key={session.id}
        onClick={() => setActiveSession(session.id)}
        className={cn(
          'px-4 py-2 rounded-lg border transition-all duration-200 whitespace-nowrap flex-shrink-0',
          activeSession === session.id
            ? 'bg-blue-500 text-white border-blue-500 shadow-md'
            : 'bg-white text-gray-700 border-gray-300 hover:bg-blue-50 hover:border-blue-300'
        )}
      >
        Session {session.session_number}
      </button>
    ))}
  </div>
);

const formatTime = (timeString: string) => {
  if (!timeString) return 'Not set';

  try {
    // Handle different time formats
    let date: Date;

    // If it's already a time format like "10:00" or "10:00:00"
    if (timeString.match(/^\d{1,2}:\d{2}(:\d{2})?$/)) {
      const today = new Date();
      const [hours, minutes, seconds = '00'] = timeString.split(':');
      date = new Date(
        today.getFullYear(),
        today.getMonth(),
        today.getDate(),
        parseInt(hours),
        parseInt(minutes),
        parseInt(seconds)
      );
    }
    // If it's a full datetime string
    else {
      date = new Date(timeString);
    }

    // Format to readable time
    return date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });
  } catch (error) {
    // If parsing fails, return the original string
    return timeString;
  }
};

const formatDate = (dateString: string) => {
  if (!dateString) return 'Not set';

  try {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  } catch (error) {
    return dateString;
  }
};

const SessionContent = ({ session }: { session: SessionData }) => (
  <Card className="mb-6">
    <CardHeader>
      <CardTitle className="flex items-center gap-2 text-xl">
        <FaBookOpen className="text-blue-600" />
        {session.title}
      </CardTitle>
      {session.description && <p className="text-gray-600 mt-2">{session.description}</p>}
    </CardHeader>
    <CardContent>
      {/* Materials Section */}
      <div className="mb-6">
        <h4 className="text-lg font-semibold text-gray-800 mb-3 flex items-center gap-2">
          <FaBookOpen className="text-sm text-blue-600" />
          Course Materials
        </h4>
        <div className="bg-gray-50 rounded-lg p-4">
          {session.materials?.length ? (
            <ul className="space-y-2">
              {session.materials.map((material, index) => (
                <li key={index} className="flex items-start gap-2">
                  <span className="text-blue-600 mt-1">•</span>
                  <div>
                    <span className="text-gray-800 font-medium">{material.title}</span>
                    {material.description && <p className="text-gray-600 text-sm mt-1">{material.description}</p>}
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-gray-500 italic">No materials available for this session.</p>
          )}
        </div>
      </div>

      {/* Session Time - UPDATED */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <div className="bg-green-50 rounded-lg p-4">
          <div className="flex items-center gap-2 text-green-700 font-semibold mb-2">
            <FaClock className="text-sm" />
            Start Time
          </div>
          <p className="text-green-800 text-lg font-bold">{formatTime(session.start_time)}</p>
          <p className="text-green-600 text-sm mt-1">{formatDate(session.start_time)}</p>
        </div>
        <div className="bg-red-50 rounded-lg p-4">
          <div className="flex items-center gap-2 text-red-700 font-semibold mb-2">
            <FaClock className="text-sm" />
            End Time
          </div>
          <p className="text-red-800 text-lg font-bold">{formatTime(session.end_time)}</p>
          <p className="text-red-600 text-sm mt-1">{formatDate(session.end_time)}</p>
        </div>
      </div>

      {/* Session Duration - NEW ADDITION */}
      {session.start_time && session.end_time && (
        <div className="bg-blue-50 rounded-lg p-4 mb-6">
          <div className="flex items-center gap-2 text-blue-700 font-semibold mb-2">
            <FaClock className="text-sm" />
            Session Duration
          </div>
          <p className="text-blue-800 text-lg font-bold">
            {(() => {
              try {
                const start = new Date(session.start_time);
                const end = new Date(session.end_time);
                const diffMs = end.getTime() - start.getTime();
                const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
                const diffMinutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));

                if (diffHours > 0) {
                  return `${diffHours}h ${diffMinutes}m`;
                } else {
                  return `${diffMinutes}m`;
                }
              } catch {
                return 'Duration not available';
              }
            })()}
          </p>
        </div>
      )}

      {/* Resources Section */}
      <div>
        <h4 className="text-lg font-semibold text-gray-800 mb-3 flex items-center gap-2">
          <FaDownload className="text-sm text-blue-600" />
          Available Resources
        </h4>
        <div className="bg-gray-50 rounded-lg p-4">
          {session.resources?.length ? (
            <div className="grid gap-3">
              {session.resources.map((resource, index) => (
                <a
                  key={index}
                  href={resource.file_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-between p-3 bg-white rounded-lg border border-gray-200 hover:border-blue-300 hover:bg-blue-50 transition-all duration-200 group"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-xl">{getResourceIcon(resource.file_type)}</span>
                    <div>
                      <span className="text-gray-800 font-medium group-hover:text-blue-700">{resource.file_name}</span>
                      <p className="text-xs text-gray-500 capitalize">{resource.file_type} file</p>
                    </div>
                  </div>
                  <FaExternalLinkAlt className="text-gray-400 group-hover:text-blue-600 text-sm" />
                </a>
              ))}
            </div>
          ) : (
            <p className="text-gray-500 italic">No resources available for this session.</p>
          )}
        </div>
      </div>
    </CardContent>
  </Card>
);

const ActionsSidebar = ({
  session,
  isFabOpen,
  setIsFabOpen,
}: {
  session: SessionData;
  isFabOpen: boolean;
  setIsFabOpen: (open: boolean) => void;
}) => {
  const handleAddFile = () => {
    setIsFabOpen(false);
    // TODO: Implement file upload
    console.log('Add file');
  };

  const handleAddVideo = () => {
    setIsFabOpen(false);
    // TODO: Implement video upload
    console.log('Add video');
  };

  const handleAddLink = () => {
    setIsFabOpen(false);
    // TODO: Implement link addition
    console.log('Add link');
  };

  return (
    <Card className="lg:w-80 h-fit">
      <CardHeader>
        <CardTitle className="text-lg">Session Actions</CardTitle>
      </CardHeader>
      <CardContent>
        {/* Quick Actions */}
        <div className="mb-6">
          <h4 className="font-semibold text-gray-800 mb-3">Quick Access</h4>
          <div className="space-y-2">
            {session.resources?.length ? (
              session.resources.slice(0, 3).map((resource, index) => (
                <a
                  key={index}
                  href={resource.file_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-100 transition-colors"
                >
                  <span className="text-lg">{getResourceIcon(resource.file_type)}</span>
                  <span className="text-sm text-gray-700 truncate flex-1">{resource.file_name}</span>
                  <FaExternalLinkAlt className="text-xs text-gray-400" />
                </a>
              ))
            ) : (
              <p className="text-sm text-gray-500 italic">No quick actions available</p>
            )}
          </div>
        </div>

        {/* Floating Action Button */}
        <div className="relative">
          <h4 className="font-semibold text-gray-800 mb-3">Add Content</h4>

          <div className="relative flex justify-center">
            <button
              onClick={() => setIsFabOpen(!isFabOpen)}
              className={cn(
                'w-12 h-12 bg-blue-500 text-white rounded-full flex items-center justify-center shadow-lg hover:bg-blue-600 transition-all duration-300',
                isFabOpen && 'rotate-45'
              )}
            >
              <FaPlus className="text-lg" />
            </button>

            {/* Action Buttons */}
            <div className="absolute top-16 flex flex-col items-center space-y-3">
              <button
                onClick={handleAddFile}
                className={cn(
                  'flex items-center gap-2 px-4 py-2 bg-white text-gray-800 rounded-full shadow-md hover:bg-gray-100 transition-all duration-300',
                  isFabOpen ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-4 pointer-events-none'
                )}
                style={{ transitionDelay: '0ms' }}
              >
                <FaFile className="text-blue-600" />
                <span className="text-sm">File</span>
              </button>

              <button
                onClick={handleAddVideo}
                className={cn(
                  'flex items-center gap-2 px-4 py-2 bg-white text-gray-800 rounded-full shadow-md hover:bg-gray-100 transition-all duration-300',
                  isFabOpen ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-4 pointer-events-none'
                )}
                style={{ transitionDelay: '50ms' }}
              >
                <FaVideo className="text-red-600" />
                <span className="text-sm">Video</span>
              </button>

              <button
                onClick={handleAddLink}
                className={cn(
                  'flex items-center gap-2 px-4 py-2 bg-white text-gray-800 rounded-full shadow-md hover:bg-gray-100 transition-all duration-300',
                  isFabOpen ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-4 pointer-events-none'
                )}
                style={{ transitionDelay: '100ms' }}
              >
                <FaLink className="text-green-600" />
                <span className="text-sm">Link</span>
              </button>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

const Session = ({ sessions, activeSession, setActiveSession }: SessionProps) => {
  const [isFabOpen, setIsFabOpen] = useState(false);
  const currentSession = sessions.find(s => s.id === activeSession);

  if (!currentSession) {
    return (
      <Card>
        <CardContent className="text-center py-12">
          <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <FaBookOpen className="text-gray-400 text-xl" />
          </div>
          <h3 className="text-lg font-medium text-gray-900 mb-2">Session Not Found</h3>
          <p className="text-gray-600">The selected session could not be found.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <SessionSelector sessions={sessions} activeSession={activeSession} setActiveSession={setActiveSession} />

      <div className="flex flex-col lg:flex-row gap-6">
        <div className="flex-1">
          <SessionContent session={currentSession} />
        </div>

        <div className="lg:w-80">
          <ActionsSidebar session={currentSession} isFabOpen={isFabOpen} setIsFabOpen={setIsFabOpen} />
        </div>
      </div>
    </div>
  );
};

export default Session;
