import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    // TODO: Implement authentication logic
    // mock data
    const mockUser = {
      id: '1',
      name: 'siswa',
      email: 'siswa@stlouis.sch.id',
      role: 'student',
      studentId: 'STD001'
    };

    return NextResponse.json({
      success: true,
      data: mockUser
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

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, password } = body;

    // TODO: Implement actual authentication
    // check if email and password are provided
    if (!email || !password) {
      return NextResponse.json(
        {
          success: false,
          error: 'Email and password are required'
        },
        { status: 400 }
      );
    }

    // Mock successful login
    const mockUser = {
      id: '1',
      name: 'siswa',
      email: email,
      role: 'student',
      studentId: 'STD001'
    };

    return NextResponse.json({
      success: true,
      data: mockUser,
      message: 'Login successful'
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
