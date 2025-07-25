import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  // Dummy response jadwal
  return NextResponse.json({
    success: true,
    schedules: [
      { id: 1, mapel: 'Matematika', guru: 'Budi', jam: '08:00', tanggal: '2024-06-01' },
      { id: 2, mapel: 'Fisika', guru: 'Siti', jam: '10:00', tanggal: '2024-06-01' },
    ],
  });
}
