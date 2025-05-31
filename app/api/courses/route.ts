import { NextRequest, NextResponse } from 'next/server';

// Mock data untuk courses
const mockCourses = [
  { 
    id: '1',
    name: "Bahasa Inggris Lanjut (A) (Peminatan)", 
    code: "BI0092", 
    class: "XI - 1", 
    teacher: "Benedictus Dhaniar Adra",
    teacherId: "T001",
    semester: "Ganjil",
    year: 2025
  },
  { 
    id: '2',
    name: "Matematika Wajib", 
    code: "MT0011", 
    class: "XI - 2", 
    teacher: "Caecilia Tjahjanti",
    teacherId: "T002",
    semester: "Ganjil",
    year: 2025
  },
  { 
    id: '3',
    name: "Fisika Lanjut", 
    code: "FS0045", 
    class: "XI - 3", 
    teacher: "Jane Smith",
    teacherId: "T003",
    semester: "Ganjil",
    year: 2025
  },
  { 
    id: '4',
    name: "Kimia Dasar", 
    code: "KM0032", 
    class: "XI - 4", 
    teacher: "Alice Johnson",
    teacherId: "T004",
    semester: "Ganjil",
    year: 2025
  },
  { 
    id: '5',
    name: "Sejarah Indonesia", 
    code: "SJ0021", 
    class: "XI - 5", 
    teacher: "Ika Kristianingsih",
    teacherId: "T005",
    semester: "Ganjil",
    year: 2025
  },
  { 
    id: '6',
    name: "Ekonomi", 
    code: "EK0050", 
    class: "XI - 6", 
    teacher: "Carol White",
    teacherId: "T006",
    semester: "Ganjil",
    year: 2025
  },
];

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const code = searchParams.get('code');

    if (code) {
      // Get specific course by code
      const course = mockCourses.find(c => c.code === code);
      if (!course) {
        return NextResponse.json(
          {
            success: false,
            error: 'Course not found'
          },
          { status: 404 }
        );
      }
      return NextResponse.json({
        success: true,
        data: course
      });
    }

    // Get all courses
    return NextResponse.json({
      success: true,
      data: mockCourses
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: 'Internal server error'
      },
      { status: 500 }
    );
  }
}
