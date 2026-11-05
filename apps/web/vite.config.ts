import path from 'node:path';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
  build: {
    rolldownOptions: {
      output: {
        // Vendor code in its own long-cached chunks. Firestore is left out of the "firebase"
        // chunk: it stays with the lazily loaded signed-in pages, so the sign-in page does not
        // download it.
        chunkFileNames: (chunk) =>
          chunk.moduleIds.some((id) => /[\\/]@firebase[\\/]firestore[\\/]/.test(id))
            ? 'assets/firestore-[hash].js'
            : 'assets/[name]-[hash].js',
        codeSplitting: {
          groups: [
            {
              name: 'firebase',
              test: /[\\/]node_modules[\\/](?:@firebase[\\/](?!firestore|webchannel-wrapper)|firebase[\\/](?!firestore))/,
              priority: 30,
            },
            {
              name: 'react',
              test: /[\\/]node_modules[\\/](?:react|react-dom|react-router|scheduler)[\\/]/,
              priority: 20,
            },
          ],
        },
      },
    },
  },
});
