<<<<<<< HEAD
// import { NextRequest, NextResponse } from 'next/server';
// import { readFile } from 'fs/promises';
// import path from 'path';

// export async function GET(request: NextRequest, { params }: { params: { path: string[] } }) {
//   try {
//     const filePath = params.path.join('/');
//     const fullPath = path.join(process.cwd(), 'public', 'uploads', filePath);

//     console.log('=== FILE READ REQUEST ===');
//     console.log('Requested path:', filePath);
//     console.log('Full path:', fullPath);
//     console.log('========================');

//     const fileBuffer = await readFile(fullPath);

//     const ext = path.extname(fullPath).toLowerCase();
//     const contentTypes: { [key: string]: string } = {
//       '.pdf': 'application/pdf',
//       '.jpg': 'image/jpeg',
//       '.jpeg': 'image/jpeg',
//       '.png': 'image/png',
//       '.gif': 'image/gif',
//       '.webp': 'image/webp',
//       '.svg': 'image/svg+xml',
//       '.mp4': 'video/mp4',
//       '.webm': 'video/webm',
//       '.ogg': 'video/ogg',
//       '.mp3': 'audio/mpeg',
//       '.wav': 'audio/wav',
//       '.txt': 'text/plain',
//       '.json': 'application/json',
//       '.csv': 'text/csv',
//       '.doc': 'application/msword',
//       '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
//       '.xls': 'application/vnd.ms-excel',
//       '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
//     };

//     const contentType = contentTypes[ext] || 'application/octet-stream';
//     const fileName = path.basename(fullPath);

//     return new NextResponse(fileBuffer, {
//       headers: {
//         'Content-Type': contentType,
//         'Content-Disposition': `inline; filename="${fileName}"`,
//         'Cache-Control': 'public, max-age=31536000',
//       },
//     });
//   } catch (error) {
//     console.error('=== FILE READ ERROR ===');
//     console.error('Error:', error);
//     console.error('=====================');

//     return NextResponse.json({ error: 'File not found' }, { status: 404 });
//   }
// }

import { NextRequest, NextResponse } from 'next/server';
import { readFile } from 'fs/promises';
import path from 'path';
=======
import { NextRequest, NextResponse } from 'next/server';
import { readFile } from 'fs/promises';
import path from 'path';
import { getSessionUser, requireSessionMember, unauthorizedResponse } from '@/lib/auth/course-access';

const UPLOADS_ROOT = path.join(process.cwd(), 'public', 'uploads');
>>>>>>> test-plagiarism-correction-feature

export async function GET(request: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  try {
    const { path: pathArray } = await params;
    const filePath = pathArray.join('/');
<<<<<<< HEAD
    const fullPath = path.join(process.cwd(), 'public', 'uploads', filePath);

    console.log('=== FILE READ REQUEST ===');
    console.log('Requested path:', filePath);
    console.log('Full path:', fullPath);
    console.log('========================');
=======
    const fullPath = path.join(UPLOADS_ROOT, filePath);

    // Q-09: only course files, only inside the uploads folder, only for
    // members of the course session they belong to.
    const [root, courseCode, sessionsSegment, sessionId] = pathArray;
    const sessionDir = path.join(UPLOADS_ROOT, 'courses', courseCode ?? '', 'sessions', sessionId ?? '');
    const isCourseFile =
      root === 'courses' &&
      sessionsSegment === 'sessions' &&
      /^\d+$/.test(sessionId ?? '') &&
      !pathArray.some(segment => segment === '..' || segment === '.' || segment === '') &&
      fullPath.startsWith(sessionDir + path.sep);
    if (!isCourseFile) {
      if (!(await getSessionUser())) return unauthorizedResponse();
      return NextResponse.json({ error: 'File not found' }, { status: 404 });
    }
    const access = await requireSessionMember(sessionId, { courseCode });
    if (!access.ok) return access.response;
>>>>>>> test-plagiarism-correction-feature

    const fileBuffer = await readFile(fullPath);

    // Convert Buffer to ArrayBuffer properly
    const arrayBuffer = new ArrayBuffer(fileBuffer.length);
    const uint8Array = new Uint8Array(arrayBuffer);
    uint8Array.set(fileBuffer);

    const ext = path.extname(fullPath).toLowerCase();
    const contentTypes: { [key: string]: string } = {
      '.pdf': 'application/pdf',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.gif': 'image/gif',
      '.webp': 'image/webp',
      '.svg': 'image/svg+xml',
      '.mp4': 'video/mp4',
      '.webm': 'video/webm',
      '.ogg': 'video/ogg',
      '.mp3': 'audio/mpeg',
      '.wav': 'audio/wav',
      '.txt': 'text/plain',
      '.json': 'application/json',
      '.csv': 'text/csv',
      '.doc': 'application/msword',
      '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      '.xls': 'application/vnd.ms-excel',
      '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    };

    const contentType = contentTypes[ext] || 'application/octet-stream';
    const fileName = path.basename(fullPath);

    return new NextResponse(arrayBuffer, {
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': `inline; filename="${fileName}"`,
<<<<<<< HEAD
        'Cache-Control': 'public, max-age=31536000',
=======
        'Cache-Control': 'private, max-age=0, must-revalidate',
>>>>>>> test-plagiarism-correction-feature
      },
    });
  } catch (error) {
    console.error('=== FILE READ ERROR ===');
    console.error('Error:', error);
    console.error('=====================');
    return NextResponse.json({ error: 'File not found' }, { status: 404 });
  }
}
