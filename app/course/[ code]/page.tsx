import { notFound } from "next/navigation";
import Sidebar from "../../_components/sidebar";
import Materi from "../_components/materi";
import { courses } from "../_data/courses";

const CourseDetail = ({ params }: { params: { code: string } }) => {
  console.log("Kode yang diterima dari URL:", params?.code);
  if (!params?.code) {
    console.error("No code provided in params");
    return notFound();
  }

  const course = courses.find((c) => c.code.toLowerCase() === params.code.toLowerCase());

  console.log("Course ditemukan:", course);

  if (!course) return notFound();

  return (
    <div className="flex h-screen">
      <Sidebar />
      <div className="flex-1 bg-gray-100 p-8">
        <div className="flex items-center bg-gray-800 text-white p-3 rounded-md mb-6">
          <h1 className="text-xl font-bold">{course.name}</h1>
        </div>
        <div className="bg-white p-6 rounded-md shadow-md">
          <h2 className="text-lg font-semibold">{course.name}</h2>
          <p className="text-sm text-gray-600">Kode: {course.code}</p>
          <p className="text-sm text-gray-600">Kelas: {course.class}</p>
          <p className="text-sm text-gray-600">Pengajar: {course.teacher}</p>
          <Materi />
        </div>
      </div>
    </div>
  );
};

export default CourseDetail;