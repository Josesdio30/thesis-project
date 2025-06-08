import NextAuth from 'next-auth';

declare module 'next-auth' {
  interface Session {
    user: {
      id: string;
      name?: string | null;
      email?: string | null;
      image?: string | null;
      username?: string;
      role?: string; // added role
    };
  }

  interface User {
    username?: string;
    role?: string; // added role
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    username?: string;
    role?: string; // added role
  }
}
