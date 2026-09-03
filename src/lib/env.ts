import { createEnv } from '@t3-oss/env-nextjs';
import { z } from 'zod';

export const env = createEnv({
  server: {
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    DATABASE_URL: z.string().url(),
    AUTH_SECRET: z.string().min(1),
  },

  client: {
    NEXT_PUBLIC_APP_URL: z.string().url().default('http://localhost:3000'),
    // Base para proxy.ts connect-src. Default-empty
    // (unset) means same-origin `/api`; set only for an external API origin.
    NEXT_PUBLIC_API_URL: z.string().url().optional(),
  },

  runtimeEnv: {
    NODE_ENV: process.env.NODE_ENV,
    DATABASE_URL: process.env.DATABASE_URL,
    AUTH_SECRET: process.env.AUTH_SECRET,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL,
  },
  emptyStringAsUndefined: true,
  // SKIP_ENV_VALIDATION=1 bypasses validation for envless builds (lint/CI/local).
  skipValidation: !!process.env.SKIP_ENV_VALIDATION,
});
