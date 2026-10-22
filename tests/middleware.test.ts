import { NextRequest } from 'next/server';
import { getToken } from 'next-auth/jwt';
import { middleware, config } from '@/middleware';

jest.mock('next-auth/jwt', () => ({
  getToken: jest.fn(),
}));

const mockGetToken = getToken as jest.MockedFunction<typeof getToken>;

const NOW_S = 1_800_000_000; // fixed clock, seconds

function request(path: string) {
  return new NextRequest(new URL(path, 'http://localhost:3000'));
}

function isPassThrough(res: Response) {
  return res.headers.get('x-middleware-next') === '1';
}

function redirectTarget(res: Response) {
  const location = res.headers.get('location');
  return location ? new URL(location) : null;
}

function token(exp?: number) {
  return { sub: '101', username: 'student', role: 'STUDENT', ...(exp === undefined ? {} : { exp }) };
}

beforeEach(() => {
  jest.spyOn(Date, 'now').mockReturnValue(NOW_S * 1000);
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});

describe('FR-AUTH-4: unauthenticated page access', () => {
  beforeEach(() => mockGetToken.mockResolvedValue(null));

  test('FR-AUTH-4: a protected page redirects to /login with the original path as callbackUrl', async () => {
    const res = await middleware(request('/course/MAT001'));

    expect(res.status).toBe(307);
    const target = redirectTarget(res)!;
    expect(target.pathname).toBe('/login');
    expect(target.searchParams.get('callbackUrl')).toBe('/course/MAT001');
  });

  test.each(['/login', '/auth', '/auth/error'])(
    'FR-AUTH-4: public route %s is served without a session',
    async path => {
      const res = await middleware(request(path));
      expect(isPassThrough(res)).toBe(true);
    }
  );
});

describe('FR-AUTH-4: authenticated access', () => {
  test('FR-AUTH-4: a signed-in user on /login is sent to /dashboard', async () => {
    mockGetToken.mockResolvedValue(token(NOW_S + 3600));

    const res = await middleware(request('/login'));

    expect(res.status).toBe(307);
    expect(redirectTarget(res)!.pathname).toBe('/dashboard');
  });

  test('FR-AUTH-4: a signed-in user reaches a protected page', async () => {
    mockGetToken.mockResolvedValue(token(NOW_S + 3600));
    expect(isPassThrough(await middleware(request('/course')))).toBe(true);
  });

  test('FR-AUTH-4: a token without an exp claim is accepted', async () => {
    mockGetToken.mockResolvedValue(token());
    expect(isPassThrough(await middleware(request('/course')))).toBe(true);
  });

  test('getToken receives the request and NEXTAUTH_SECRET', async () => {
    const previous = process.env.NEXTAUTH_SECRET;
    process.env.NEXTAUTH_SECRET = 'test-secret';
    try {
      mockGetToken.mockResolvedValue(null);
      const req = request('/login');

      await middleware(req);

      expect(mockGetToken).toHaveBeenCalledWith({ req, secret: 'test-secret' });
    } finally {
      if (previous === undefined) delete process.env.NEXTAUTH_SECRET;
      else process.env.NEXTAUTH_SECRET = previous;
    }
  });
});

describe('FR-AUTH-3: expired session', () => {
  test('FR-AUTH-3: an expired token redirects to /login and deletes every session cookie', async () => {
    mockGetToken.mockResolvedValue(token(NOW_S - 1));

    const res = await middleware(request('/course'));

    expect(res.status).toBe(307);
    expect(redirectTarget(res)!.pathname).toBe('/login');
    const setCookie = res.headers.get('set-cookie') ?? '';
    for (const name of [
      'next-auth.session-token',
      '__Secure-next-auth.session-token',
      'next-auth.csrf-token',
      '__Secure-next-auth.csrf-token',
    ]) {
      expect(setCookie).toContain(`${name}=;`);
    }
  });

  test('FR-AUTH-3: a token expiring exactly now is still valid (strict < comparison)', async () => {
    mockGetToken.mockResolvedValue(token(NOW_S));
    expect(isPassThrough(await middleware(request('/course')))).toBe(true);
  });

  test('FR-AUTH-3: an expired token on a public route still clears the session', async () => {
    mockGetToken.mockResolvedValue(token(NOW_S - 1));
    const res = await middleware(request('/login'));
    expect(redirectTarget(res)!.pathname).toBe('/login');
    expect(res.headers.get('set-cookie')).toContain('next-auth.session-token=;');
  });
});

describe('framework and asset paths skip the session check', () => {
  beforeEach(() => mockGetToken.mockResolvedValue(null));

  test.each(['/api/auth/session', '/_next/static/chunk.js', '/favicon.ico', '/images/logo', '/icons/menu'])(
    '%s is passed through without a session',
    async path => {
      expect(isPassThrough(await middleware(request(path)))).toBe(true);
    }
  );

  test('the matcher excludes NextAuth, static assets, images and icons', () => {
    expect(config.matcher).toEqual(['/((?!api/auth|_next/static|_next/image|favicon.ico|images|icons).*)']);
  });
});

describe('FR-FILE-4 / Q-09: uploaded files are never served without a session', () => {
  test.each(['/api/files/courses/MAT001/sessions/1/report.pdf', '/uploads/courses/MAT001/a.png', '/api/courses/v1.0'])(
    'FR-FILE-4 [DC-01]: dotted path %s without a session redirects to /login',
    async path => {
      mockGetToken.mockResolvedValue(null);
      const res = await middleware(request(path));
      expect(res.status).toBe(307);
      expect(redirectTarget(res)!.pathname).toBe('/login');
    }
  );

  test.each(['/logo.svg', '/fonts/geist.woff2'])('other dotted public assets (%s) are still served directly', async path => {
    mockGetToken.mockResolvedValue(null);
    expect(isPassThrough(await middleware(request(path)))).toBe(true);
  });

  test('FR-FILE-4: a signed-in request for /uploads/... is rewritten to the access-checked files API', async () => {
    mockGetToken.mockResolvedValue(token(NOW_S + 3600));

    const res = await middleware(request('/uploads/courses/MAT001/sessions/700/notes.pdf'));

    const rewrite = res.headers.get('x-middleware-rewrite');
    expect(rewrite).not.toBeNull();
    expect(new URL(rewrite!).pathname).toBe('/api/files/courses/MAT001/sessions/700/notes.pdf');
  });

  test('a signed-in request for /api/files/... passes through to the route (which checks membership)', async () => {
    mockGetToken.mockResolvedValue(token(NOW_S + 3600));
    expect(isPassThrough(await middleware(request('/api/files/courses/MAT001/sessions/700/notes.pdf')))).toBe(true);
  });
});

describe('characterization: current middleware behaviour pending a product decision', () => {
  beforeEach(() => mockGetToken.mockResolvedValue(null));

  // RISK O-44 / DC-02 (Q-03 open): unauthenticated API calls are redirected
  // to the login page instead of receiving a 401 JSON response.
  test('DC-02: an unauthenticated API call is redirected to /login (not 401)', async () => {
    const res = await middleware(request('/api/courses'));

    expect(res.status).toBe(307);
    const target = redirectTarget(res)!;
    expect(target.pathname).toBe('/login');
    expect(target.searchParams.get('callbackUrl')).toBe('/api/courses');
  });
});
