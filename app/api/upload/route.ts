import { NextRequest, NextResponse } from 'next/server';
import { writeFile, mkdir } from 'fs/promises';
import path from 'path';

// Content type mapping for common file extensions
const CONTENT_TYPE_MAP: Record<string, string> = {
  // Documents
  pdf: 'application/pdf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  txt: 'text/plain',
  rtf: 'application/rtf',

  // Images
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  bmp: 'image/bmp',
  webp: 'image/webp',
  svg: 'image/svg+xml',

  // Videos
  mp4: 'video/mp4',
  avi: 'video/x-msvideo',
  mov: 'video/quicktime',
  wmv: 'video/x-ms-wmv',
  flv: 'video/x-flv',
  webm: 'video/webm',
  mkv: 'video/x-matroska',

  // Audio
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  ogg: 'audio/ogg',
  aac: 'audio/aac',

  // Archives
  zip: 'application/zip',
  rar: 'application/vnd.rar',
  '7z': 'application/x-7z-compressed',
  tar: 'application/x-tar',
  gz: 'application/gzip',

  // Code files
  js: 'text/javascript',
  css: 'text/css',
  html: 'text/html',
  json: 'application/json',
  xml: 'application/xml',

  // Default fallback
  default: 'application/octet-stream',
};

function getFileExtension(filename: string): string {
  const lastDot = filename.lastIndexOf('.');
  if (lastDot === -1) return '';
  return filename.substring(lastDot + 1).toLowerCase();
}

function getContentType(filename: string): string {
  const extension = getFileExtension(filename);
  return CONTENT_TYPE_MAP[extension] || CONTENT_TYPE_MAP['default'];
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;
    const courseCode = formData.get('courseCode') as string;
    const sessionId = formData.get('sessionId') as string;
    const context = formData.get('context') as string;

    console.log('=== FILE UPLOAD REQUEST ===');
    console.log('Course Code:', courseCode);
    console.log('Session ID:', sessionId);
    console.log('Context:', context);
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
        { status: 413 }
      );
    }
    const uploadDir = context
      ? path.join(process.cwd(), 'public', 'uploads', 'courses', courseCode, 'sessions', sessionId, context)
      : path.join(process.cwd(), 'public', 'uploads', 'courses', courseCode, 'sessions', sessionId);

    try {
      await mkdir(uploadDir, { recursive: true });
      console.log('Upload directory created:', uploadDir);
    } catch (mkdirError) {
      console.error('Error creating directory:', mkdirError);
      return NextResponse.json({ error: 'Failed to create upload directory' }, { status: 500 });
    }
    const timestamp = Date.now();
    const sanitizedName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
    const filename = `${timestamp}_${sanitizedName}`;
    const filepath = path.join(uploadDir, filename);

    // Get file extension and content type
    const fileExtension = getFileExtension(file.name);
    const detectedContentType = getContentType(file.name);

    console.log('File extension:', fileExtension);
    console.log('Detected content type:', detectedContentType);
    console.log('Browser reported type:', file.type);

    // Save file
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    await writeFile(filepath, buffer);

    console.log('File saved to:', filepath); // Return file URL (public path) with context support
    const fileUrl = context
      ? `/uploads/courses/${courseCode}/sessions/${sessionId}/${context}/${filename}`
      : `/uploads/courses/${courseCode}/sessions/${sessionId}/${filename}`;

    return NextResponse.json({
      success: true,
      data: {
        filename: sanitizedName,
        url: fileUrl,
        size: file.size,
        type: file.type,
        file_extension: fileExtension,
        content_type: detectedContentType,
        original_name: file.name,
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
