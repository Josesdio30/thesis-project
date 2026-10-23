import { NextRequest, NextResponse } from 'next/server';
import { writeFile, mkdir } from 'fs/promises';
import path from 'path';
import { getSessionUser, requireSessionMember, unauthorizedResponse } from '@/lib/auth/course-access';


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
// Q-08 (2026-10-17): PDF, Word and images only.
const ALLOWED_EXTENSIONS = new Set(['pdf', 'doc', 'docx', 'jpg', 'jpeg', 'png', 'gif']);

// The extension and the browser-reported type are both client-controlled, so the
// file's leading bytes must match the extension too (A6). DOCX is a ZIP container.
const OLE2 = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];
const JPEG = [0xff, 0xd8, 0xff];
const SIGNATURES: Record<string, number[][]> = {
  pdf: [[0x25, 0x50, 0x44, 0x46, 0x2d]], // %PDF-
  doc: [OLE2],
  docx: [[0x50, 0x4b, 0x03, 0x04]],
  jpg: [JPEG],
  jpeg: [JPEG],
  png: [[0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]],
  gif: [
    [0x47, 0x49, 0x46, 0x38, 0x37, 0x61], // GIF87a
    [0x47, 0x49, 0x46, 0x38, 0x39, 0x61], // GIF89a
  ],
};

function contentMatchesExtension(buffer: Buffer, extension: string): boolean {
  return SIGNATURES[extension].some(
    signature => buffer.length >= signature.length && signature.every((byte, i) => buffer[i] === byte)
  );
}

// A declared type other than these generic ones must be the extension's own type.
const GENERIC_TYPES = new Set(['', 'application/octet-stream']);

function declaredTypeMatchesExtension(declared: string, extension: string): boolean {
  return GENERIC_TYPES.has(declared) || declared === CONTENT_TYPE_MAP[extension];
}

function unsupportedTypeResponse(): NextResponse {
  return NextResponse.json(
    { error: 'Unsupported file type', message: 'Only PDF, Word (DOC/DOCX) and image (JPG/PNG/GIF) files are allowed.' },
    { status: 415 }
  );
}
// Path parts become folder names, so they may not contain separators or dots.
const SAFE_SEGMENT = /^[A-Za-z0-9_-]+$/;

export async function POST(request: NextRequest) {
  try {
    const user = await getSessionUser();
    if (!user) return unauthorizedResponse();

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

    if (
      !SAFE_SEGMENT.test(courseCode ?? '') ||
      !/^\d+$/.test(sessionId ?? '') ||
      (context && !SAFE_SEGMENT.test(context))
    ) {
      return NextResponse.json(
        { error: 'Invalid upload location', message: 'courseCode, sessionId and context must be plain names' },
        { status: 400 }
      );
    }

    const fileExtension = getFileExtension(file.name);
    if (!ALLOWED_EXTENSIONS.has(fileExtension) || !declaredTypeMatchesExtension(file.type, fileExtension)) {
      return unsupportedTypeResponse();
    }

    // Q-09: only members of the course session may upload to it.
    const access = await requireSessionMember(sessionId, { courseCode });
    if (!access.ok) return access.response;

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

    const buffer = Buffer.from(await file.arrayBuffer());
    if (!contentMatchesExtension(buffer, fileExtension)) {
      return unsupportedTypeResponse();
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
    // Only allowed extensions reach this point, and each has a known type.
    const detectedContentType = CONTENT_TYPE_MAP[fileExtension];

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
