import { NextRequest, NextResponse } from 'next/server';
import { writeFile, mkdir } from 'fs/promises';
import path from 'path';

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;
    const courseCode = formData.get('courseCode') as string;
    const sessionId = formData.get('sessionId') as string;

    console.log('=== FILE UPLOAD REQUEST ===');
    console.log('Course Code:', courseCode);
    console.log('Session ID:', sessionId);
    console.log('File Name:', file?.name);
    console.log('==========================');
    if (!file) {
      return NextResponse.json({ error: 'No file received' }, { status: 400 });
    }

    // Check file size (10MB limit)
    const maxSize = 10 * 1024 * 1024; // 10MB in bytes
    if (file.size > maxSize) {
      return NextResponse.json(
        {
          error: 'File too large',
          message: `File size exceeds 10MB limit. Your file is ${(file.size / 1024 / 1024).toFixed(2)}MB.`,
        },
        { status: 413 } // 413 Payload Too Large
      );
    }

    // Create upload directory
    const uploadDir = path.join(process.cwd(), 'public', 'uploads', 'courses', courseCode, 'sessions', sessionId);

    try {
      await mkdir(uploadDir, { recursive: true });
      console.log('Upload directory created:', uploadDir);
    } catch (mkdirError) {
      console.error('Error creating directory:', mkdirError);
      return NextResponse.json({ error: 'Failed to create upload directory' }, { status: 500 });
    }

    // Generate unique filename
    const timestamp = Date.now();
    const sanitizedName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
    const filename = `${timestamp}_${sanitizedName}`;
    const filepath = path.join(uploadDir, filename);

    // Save file
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    await writeFile(filepath, buffer);

    console.log('File saved to:', filepath);

    // Return file URL (public path)
    const fileUrl = `/uploads/courses/${courseCode}/sessions/${sessionId}/${filename}`;

    return NextResponse.json({
      success: true,
      data: {
        filename: sanitizedName,
        url: fileUrl,
        size: file.size,
        type: file.type,
      },
    });
  } catch (error) {
    console.error('Upload error:', error);
    return NextResponse.json(
      {
        error: 'Upload failed',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
