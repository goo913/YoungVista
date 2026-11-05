import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const require = createRequire(import.meta.url);
const { isReactIconsLib, reactIconsAdapter } = require('./react-icons-native.js') as {
  isReactIconsLib: (originPath: string | undefined, request: string) => boolean;
  reactIconsAdapter: string;
};

// Unit tests for the plain TypeScript parts of the app (scan session, input parsing, the icon
// adapter). React Native itself is not loaded: tests mock react-native-svg.
export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('.', import.meta.url)) },
  },
  plugins: [
    {
      // The same redirect as metro.config.js, so tests see the icons the app draws.
      name: 'react-icons-native',
      enforce: 'pre',
      resolveId(source, importer) {
        return isReactIconsLib(importer, source) ? reactIconsAdapter : null;
      },
    },
  ],
  test: {
    include: ['test/**/*.test.{ts,tsx}'],
    environment: 'node',
    // Run react-icons through Vite so the redirect above applies to its imports.
    server: { deps: { inline: ['react-icons'] } },
  },
});
