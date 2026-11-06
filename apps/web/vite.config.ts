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
    // The lazily loaded three.js chunk is large on its own; everything else stays small.
    chunkSizeWarningLimit: 1200,
    rolldownOptions: {
      output: {
        // Vendor code in its own long-cached chunks. Firestore, Storage and Functions (AI
        // pictures) are left out of the "firebase" chunk: they stay with the lazily loaded pages
        // that use them, so the sign-in page does not download them. three.js and React Three
        // Fiber only load with the 3D view.
        chunkFileNames: (chunk) =>
          chunk.moduleIds.some((id) => /[\\/]@firebase[\\/]firestore[\\/]/.test(id))
            ? 'assets/firestore-[hash].js'
            : chunk.moduleIds.some((id) => /[\\/]@firebase[\\/]storage[\\/]/.test(id))
              ? 'assets/storage-[hash].js'
              : 'assets/[name]-[hash].js',
        // Groups also take in the modules their members import, highest priority first. The
        // "three" group comes last so React stays in the "react" chunk instead of being pulled
        // into "three" (which would make every page download three.js).
        codeSplitting: {
          groups: [
            {
              name: 'firebase',
              test: /[\\/]node_modules[\\/](?:@firebase[\\/](?!firestore|webchannel-wrapper|storage|functions)|firebase[\\/](?!firestore|storage|functions))/,
              priority: 30,
            },
            {
              name: 'react',
              test: /[\\/]node_modules[\\/](?:react|react-dom|react-router|scheduler)[\\/]/,
              priority: 20,
            },
            {
              name: 'three',
              test: /[\\/]node_modules[\\/](?:three|three-stdlib|@react-three[\\/](?:fiber|drei))[\\/]/,
              priority: 10,
            },
          ],
        },
      },
    },
  },
});
