import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: false,
    include: ['tests/unit/**/*.{test,spec}.{ts,tsx}'],
    exclude: ['node_modules/**', '.next/**'],
  },
  resolve: {
    alias: {
      '@': new URL('./src', import.meta.url).pathname,
      // `server-only` throws outside the react-server condition; unit tests
      // exercise business logic, so resolve it to the empty marker stub.
      'server-only': new URL('./node_modules/server-only/empty.js', import.meta.url).pathname,
    },
  },
});
