import js from '@eslint/js';
import prettier from 'eslint-config-prettier/flat';
import reactHooks from 'eslint-plugin-react-hooks';
import { reactRefresh } from 'eslint-plugin-react-refresh';
import { defineConfig, globalIgnores } from 'eslint/config';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default defineConfig([
  globalIgnores([
    '**/dist/',
    '**/coverage/',
    '**/.expo/',
    '**/web-build/',
    'apps/mobile/ios/',
    'apps/mobile/android/',
    '.firebase/',
  ]),
  {
    files: ['**/*.{js,mjs,cjs,ts,mts,cts,tsx}'],
    extends: [js.configs.recommended, tseslint.configs.recommended],
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', ignoreRestSiblings: true },
      ],
    },
  },
  {
    // Node scripts and tool configs.
    files: ['**/*.{js,mjs,cjs}', '**/*.config.{js,mjs,ts}', 'scripts/**/*.{js,ts}'],
    languageOptions: { globals: globals.node },
  },
  {
    files: ['apps/**/*.{ts,tsx}'],
    extends: [reactHooks.configs.flat.recommended],
  },
  {
    files: ['apps/web/**/*.{ts,tsx}'],
    extends: [reactRefresh.configs.vite()],
    languageOptions: { globals: globals.browser },
  },
  {
    // Icons come from react-icons only (CLAUDE.md). `shadcn add` writes lucide-react imports:
    // swap them for the same icons from 'react-icons/lu'.
    files: ['apps/**/*.{ts,tsx}', 'packages/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            { name: 'lucide-react', message: "Use react-icons (e.g. 'react-icons/lu') instead." },
            { name: 'lucide-react-native', message: 'Use react-icons instead.' },
          ],
        },
      ],
    },
  },
  {
    // shadcn/ui components export their variants next to the component.
    files: ['apps/web/src/components/ui/**/*.tsx'],
    rules: { 'react-refresh/only-export-components': 'off' },
  },
  prettier,
]);
