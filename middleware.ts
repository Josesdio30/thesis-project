import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getToken } from 'next-auth/jwt';

export async function middleware(request: NextRequest) {
<<<<<<< HEAD
=======
  const { pathname } = request.nextUrl;

>>>>>>> test-plagiarism-correction-feature
  const token = await getToken({
    req: request,
    secret: process.env.NEXTAUTH_SECRET,
  });

<<<<<<< HEAD
  const { pathname } = request.nextUrl;

  // Skip middleware untuk routes yang tidak memerlukan auth
  if (
    pathname.startsWith('/api/auth') || // NextAuth API routes
    pathname.startsWith('/_next/') || // Next.js static files
    pathname.startsWith('/favicon.ico') ||
    pathname.startsWith('/images/') ||
    pathname.startsWith('/icons/') ||
    pathname.includes('.') // File extensions (css, js, png, etc.)
=======
  if (
    pathname.startsWith('/api/auth') || 
    pathname.startsWith('/_next') || 
    pathname.startsWith('/favicon.ico') ||
    pathname.startsWith('/images') ||
    pathname.startsWith('/icons') ||
    // Dotted paths are static assets, except API routes and uploaded course
    // files, which always need a session (Q-09).
    (pathname.includes('.') && !pathname.startsWith('/api/') && !pathname.startsWith('/uploads/'))
>>>>>>> test-plagiarism-correction-feature
  ) {
    return NextResponse.next();
  }

<<<<<<< HEAD
  // Define public routes yang bisa diakses tanpa authentication
  const publicRoutes = ['/login', '/(auth)/login'];
  const isPublicRoute = publicRoutes.includes(pathname);

  console.log('Middleware:', { pathname, hasToken: !!token, isPublicRoute });

  // Check if token exists and is valid
  if (token) {
    const now = Date.now() / 1000;

    // Check if token is expired
    if (typeof token.exp === 'number' && token.exp < now) {
      console.log('Token expired, clearing cookies and redirecting to login');

      // Create response with redirect to login
      const response = NextResponse.redirect(new URL('/login', request.url));

      // Clear all NextAuth cookies
=======
  const publicRoutes = ['/login', '/auth'];
  const isPublicRoute = publicRoutes.some(route => pathname.startsWith(route));

  if (token) {
    const now = Date.now() / 1000;

    if (token.exp && (token.exp as number) < now) {
      console.warn('[Middleware] Token expired. Clearing session.');
      
      const response = NextResponse.redirect(new URL('/login', request.url));
      
      const cookieOptions = { path: '/', secure: process.env.NODE_ENV === 'production' };
      
>>>>>>> test-plagiarism-correction-feature
      response.cookies.delete('next-auth.session-token');
      response.cookies.delete('__Secure-next-auth.session-token');
      response.cookies.delete('next-auth.csrf-token');
      response.cookies.delete('__Secure-next-auth.csrf-token');
<<<<<<< HEAD
      response.cookies.delete('next-auth.callback-url');
      response.cookies.delete('__Secure-next-auth.callback-url');

      return response;
    }

    // Token valid, check route access
    if (isPublicRoute) {
      // Authenticated user trying to access login page, redirect to dashboard
      console.log('Authenticated user on login page, redirecting to dashboard');
      return NextResponse.redirect(new URL('/dashboard', request.url));
    }

    // Valid token and not on public route, allow access
    return NextResponse.next();
  }

  // No token (unauthenticated)
  if (!isPublicRoute) {
    // Unauthenticated user trying to access protected route
    console.log('Unauthenticated user accessing protected route, redirecting to login');
    return NextResponse.redirect(new URL('/login', request.url));
  }

  // Unauthenticated user on public route, allow access
=======
      
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

>>>>>>> test-plagiarism-correction-feature
  return NextResponse.next();
}

export const config = {
  matcher: [
<<<<<<< HEAD
    /*
     * Match all request paths except for the ones starting with:
     * - api/auth (NextAuth API routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public files (images, icons, etc.)
     */
    '/((?!api/auth|_next/static|_next/image|favicon.ico|images|icons).*)',
  ],
};
=======
    '/((?!api/auth|_next/static|_next/image|favicon.ico|images|icons).*)',
  ],
};
>>>>>>> test-plagiarism-correction-feature
