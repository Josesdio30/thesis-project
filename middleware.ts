import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getToken } from 'next-auth/jwt';

export async function middleware(request: NextRequest) {
  const token = await getToken({
    req: request,
    secret: process.env.NEXTAUTH_SECRET,
  });

  const { pathname } = request.nextUrl;

  // Skip middleware untuk routes yang tidak memerlukan auth
  if (
    pathname.startsWith('/api/auth') || // NextAuth API routes
    pathname.startsWith('/_next/') || // Next.js static files
    pathname.startsWith('/favicon.ico') ||
    pathname.startsWith('/images/') ||
    pathname.startsWith('/icons/') ||
    pathname.includes('.') // File extensions (css, js, png, etc.)
  ) {
    return NextResponse.next();
  }

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
      response.cookies.delete('next-auth.session-token');
      response.cookies.delete('__Secure-next-auth.session-token');
      response.cookies.delete('next-auth.csrf-token');
      response.cookies.delete('__Secure-next-auth.csrf-token');
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
  return NextResponse.next();
}

export const config = {
  matcher: [
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
