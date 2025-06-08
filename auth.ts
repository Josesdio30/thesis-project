import NextAuth from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import { verifyPassword } from './lib/hash';
import sql from './lib/db';
import type { NextAuthOptions } from 'next-auth';

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: 'credentials',
      credentials: {
        username: { label: 'Username', type: 'text' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.username || !credentials?.password) {
          return null;
        }

        try {
          const users = await sql`
                SELECT ap.id, ap.user_name, ap.password, ap.nama_lengkap, ap.email, ap.is_active, ap.is_deleted, e."name" AS role
                FROM app_user ap
                JOIN app_user_role aur ON aur.user_id = ap.id
                JOIN enumeration e ON e.id = aur.role_id
                WHERE ap.user_name = ${credentials.username} 
                AND ap.is_active = TRUE 
                AND ap.is_deleted = FALSE
            `;

          if (users.length === 0) {
            return null;
          }

          const user = users[0];

          const isValidPassword = await verifyPassword(credentials.password as string, user.password);

          if (isValidPassword) {
            await sql`
                UPDATE app_user 
                SET last_login = CURRENT_TIMESTAMP, updated_date = CURRENT_TIMESTAMP 
                WHERE id = ${user.id}
            `;

            return {
              id: user.id.toString(),
              name: user.nama_lengkap,
              email: user.email,
              username: user.user_name,
              role: user.role,
            };
          }

          return null;
        } catch (error) {
          console.error('Authentication error:', error);
          return null;
        }
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user?.username) {
        token.username = user.username;
        token.role = user.role;
      }
      return token;
    },
    async session({ session, token }) {
      if (token?.username) {
        session.user.id = token.sub || '';
        session.user.username = token.username;
        session.user.role = token.role;
      }
      return session;
    },
  },
  events: {
    async signOut({ token }) {
      console.log('User signed out:', token?.sub);
    },
  },
  pages: {
    signIn: '/login',
  },
  session: {
    strategy: 'jwt' as const,
    maxAge: 24 * 60 * 60, // 24 hours
    updateAge: 60 * 60, // 1 hour
  },
  secret: process.env.NEXTAUTH_SECRET,
};

export default NextAuth(authOptions);
