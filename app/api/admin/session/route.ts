import { NextRequest, NextResponse } from 'next/server';

let sessions: any[] = [];

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    if (!body.kodeGuru || !body.kodeSiswa || !body.kodeMapel || !body.jam || !body.tanggal) {
      return NextResponse.json({ success: false, message: 'Semua field wajib diisi' }, { status: 400 });
    }
    const session = { ...body };
    sessions.push(session);
    return NextResponse.json({ success: true, session });
  } catch (err) {
    return NextResponse.json({ success: false, message: 'Gagal menyimpan session' }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({ success: true, sessions });
} 