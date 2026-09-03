import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import { z } from 'zod';

import { prisma } from '@/lib/db';
import { verifyPassword } from '@/lib/password';

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

export type AuthUser = {
  id: string;
  email: string;
  name: string | null;
  plan: 'FREE' | 'PRO';
};

export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: 'jwt' },
  pages: { signIn: '/login' },
  providers: [
    Credentials({
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Contraseña', type: 'password' },
      },
      authorize: async (credentials) => {
        const parsed = credentialsSchema.safeParse(credentials);
        if (!parsed.success) return null;
        const { email, password } = parsed.data;
        const user = await prisma.user.findUnique({ where: { email } });
        if (!user) return null;
        const valid = await verifyPassword(password, user.passwordHash);
        if (!valid) return null;
        return { id: user.id, email: user.email, name: user.name, plan: user.plan };
      },
    }),
  ],
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.plan = user.plan;
      }
      return token;
    },
    session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.plan = (token.plan as 'FREE' | 'PRO') ?? 'FREE';
      }
      return session;
    },
  },
});
