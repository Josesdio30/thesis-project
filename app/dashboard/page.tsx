import Sidebar from "../_components/sidebar";

export default function Home() {
  const latestForumPosts = [
    {
      id: 1,
      author: "Benedictus Dhaniar Ardra",
      date: "18 Feb 2025, 08:00 GMT+7",
      title: "Pembahasan Future Past",
      subject: "IX - 1 Bahasa Inggris Lanjut (A) (Peminatan) XI MIPA",
    },
    {
      id: 2,
      author: "Samuel Prakoso",
      date: "18 Feb 2025, 08:00 GMT+7",
      title: "Pembahasan Future Past",
      subject: "IX - 1 Bahasa Inggris Lanjut (A) (Peminatan) XI MIPA",
    },
  ];

  const upcomingClass = {
    className: "IX - 1",
    subject: "Bahasa Inggris Lanjut (A) (Peminatan) XI MIPA",
    time: "08:00 - 09:30",
  };

  return (
    <div className="flex min-h-screen bg-gray-100">
      <Sidebar />
      <div className="flex-1 p-6">
        <div className="bg-gray-800 text-white p-2 rounded-md mb-6">
          <h1 className="text-2xl font-bold">Dashboard</h1>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="md:col-span-2 bg-white p-4 rounded-md shadow">
            <h2 className="text-xl font-semibold mb-4 text-gray-600">Latest Forum Post</h2>
            <div className="space-y-4">
              {latestForumPosts.map((post) => (
                <div key={post.id} className="p-4 border rounded-md shadow-sm">
                  <p className="font-medium text-gray-600">{post.author}</p>
                  <p className="text-xs text-gray-600">{post.date}</p>
                  <p className="font-semibold mt-2 text-gray-600">{post.title}</p>
                  <p className="text-sm text-gray-600">{post.subject}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white p-4 rounded-md shadow">
            <h2 className="text-xl font-semibold mb-4 text-gray-600">Upcoming Class</h2>
            <div className="p-4 border rounded-md shadow-sm">
              <p className="font-medium text-gray-600">{upcomingClass.className}</p>
              <p className="text-sm text-gray-600">{upcomingClass.subject}</p>
              <p className="text-xs text-gray-600 mt-2">🕒 {upcomingClass.time}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
