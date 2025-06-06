import { NextRequest, NextResponse } from "next/server";
import { Pool } from "pg";

// koneksi PostgreSQL
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

export async function POST(req: NextRequest) {
  const { user_name, password } = await req.json();

  try {
    const result = await pool.query(
      `SELECT * FROM app_user WHERE user_name = $1 AND is_deleted = false AND is_active = true`,
      [user_name]
    );

    if (result.rows.length === 0) {
      return NextResponse.json({ message: "User not found" }, { status: 401 });
    }

    const user = result.rows[0];

    // TANPA HASH: Bandingkan langsung dengan password di database
    if (user.password !== password) {
      return NextResponse.json({ message: "Invalid password" }, { status: 401 });
    }

    // Login berhasil
    return NextResponse.json({
      message: "Login successful",
      user: {
        id: user.id,
        name: user.nama_lengkap,
        email: user.email,
      },
    });
  } catch (error) {
    return NextResponse.json({ message: "Internal Server Error" }, { status: 500 });
  }
}
