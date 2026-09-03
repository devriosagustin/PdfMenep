import type { DefaultSession } from 'next-auth';

declare module 'next-auth' {
  interface User {
    plan: 'FREE' | 'PRO';
  }

  interface Session {
    user: {
      id: string;
      plan: 'FREE' | 'PRO';
    } & DefaultSession['user'];
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    id: string;
    plan: 'FREE' | 'PRO';
  }
}
