import { NextRequest, NextResponse } from 'next/server';

// Data dummy user
const users = [
  { username: 'admin', password: 'admin123', role: 'ADMIN' },
  { username: 'guru', password: 'guru123', role: 'GURU' },
  { username: 'student', password: 'student123', role: 'STUDENT' },
];

export async function POST(req: NextRequest) {
  const { username, password } = await req.json();
  const user = users.find(
    (u) => u.username === username && u.password === password
  );
  if (user) {
    // Return user data (tanpa password)
    return NextResponse.json({
      success: true,
      user: { username: user.username, role: user.role },
    });
  }
  return NextResponse.json(
    { success: false, message: 'Username/password salah' },
    { status: 401 }
  );
}
