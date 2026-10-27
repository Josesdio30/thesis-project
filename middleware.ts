import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getToken } from 'next-auth/jwt';

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const token = await getToken({
    req: request,
    secret: process.env.NEXTAUTH_SECRET,
  });

  if (
    pathname.startsWith('/api/auth') || 
    pathname.startsWith('/_next') || 
    pathname.startsWith('/favicon.ico') ||
    pathname.startsWith('/images') ||
    pathname.startsWith('/icons') ||
    // Dotted paths are static assets, except API routes and uploaded course
    // files, which always need a session (Q-09).
    (pathname.includes('.') && !pathname.startsWith('/api/') && !pathname.startsWith('/uploads/'))
  ) {
    return NextResponse.next();
  }

  const publicRoutes = ['/login', '/auth'];
  const isPublicRoute = publicRoutes.some(route => pathname.startsWith(route));

  if (token) {
    const now = Date.now() / 1000;

    if (token.exp && (token.exp as number) < now) {
      console.warn('[Middleware] Token expired. Clearing session.');
      
      const response = NextResponse.redirect(new URL('/login', request.url));
      
      const cookieOptions = { path: '/', secure: process.env.NODE_ENV === 'production' };
      
      response.cookies.delete('next-auth.session-token');
      response.cookies.delete('__Secure-next-auth.session-token');
      response.cookies.delete('next-auth.csrf-token');
      response.cookies.delete('__Secure-next-auth.csrf-token');
      
      return response;
    }

    if (isPublicRoute) {
      return NextResponse.redirect(new URL('/dashboard', request.url));
    }

    // Uploaded files live under public/, which Next would serve to anyone
    // signed in. Route them through the files API, which checks course
    // membership, so existing /uploads/... links keep working (Q-09).
    if (pathname.startsWith('/uploads/')) {
      return NextResponse.rewrite(new URL(`/api/files${pathname.slice('/uploads'.length)}`, request.url));
    }

    return NextResponse.next();
  }

  if (!isPublicRoute) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('callbackUrl', request.nextUrl.pathname);
    
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/((?!api/auth|_next/static|_next/image|favicon.ico|images|icons).*)',
  ],
};
