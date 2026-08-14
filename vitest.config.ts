import { defineConfig } from 'vitest/config';
import path from 'node:path';
import { existsSync } from 'node:fs';
import { loadEnvFile } from 'node:process';

const envPath = path.resolve(__dirname, '.env');
if (existsSync(envPath)) {
  loadEnvFile(envPath);
}

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  test: {
    environment: 'node',
    globals: true,
    include: ['src/**/__tests__/**/*.test.{ts,tsx}'],
    exclude: ['node_modules', '.next', 'tests/e2e'],
    restoreMocks: true,
  },
});
