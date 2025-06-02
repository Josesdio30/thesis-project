import { NextResponse } from 'next/server';
import { Pool } from 'pg';
import bcrypt from 'bcryptjs';

// Konfigurasi koneksi database
const pool = new Pool({
    host: '31.97.50.49',
    port: 9999,
    database: 'sinlui_ujicoba',
    user: 'postgres',
    password: 'P@ostgres!',
});

export async function POST(request: Request) {
    try {
        const { username, password } = await request.json();

        // Query untuk mencari user berdasarkan email
        const result = await pool.query(
            'SELECT * FROM app_user WHERE email = $1',
            [username]
        );

        if (result.rows.length === 0) {
            return NextResponse.json({ 
                success: false, 
                message: 'Email atau password salah' 
            }, { status: 401 });
        }

        const user = result.rows[0];
        
        // Verifikasi password menggunakan bcrypt
        const isValidPassword = await bcrypt.compare(password, user.password);

        if (!isValidPassword) {
            return NextResponse.json({ 
                success: false, 
                message: 'Email atau password salah' 
            }, { status: 401 });
        }

        // Login berhasil
        return NextResponse.json({ 
            success: true, 
            message: 'Login berhasil',
            user: {
                id: user.id,
                email: user.email,
                role: user.role
            }
        });

    } catch (error) {
        console.error('Database error:', error);
        return NextResponse.json({ 
            success: false, 
            message: 'Terjadi kesalahan pada server' 
        }, { status: 500 });
    }
} 