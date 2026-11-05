import { defineConfig } from 'vitest/config';

// Security rules tests. They need the Firestore and Storage emulators (Java 21+), so run them
// with `npm run test:rules`, which starts the emulators around this suite.
export default defineConfig({
  test: {
    root: import.meta.dirname,
    include: ['*.test.ts'],
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
