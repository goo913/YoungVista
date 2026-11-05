/* eslint-disable @typescript-eslint/no-require-imports */
// Icons come from react-icons (CLAUDE.md). Every react-icons icon is built by `GenIcon` from the
// package's own `lib`, which renders DOM <svg> elements that React Native cannot show. Metro (and
// Vitest, see vitest.config.mts) send that one import to lib/icons/gen-icon.ts instead, which draws
// the same icon tree with react-native-svg. Icon imports stay the usual `react-icons/lu` etc.
const path = require('node:path');

const reactIconsRoot = path.dirname(require.resolve('react-icons'));

/** The adapter that replaces `react-icons/lib`. */
const reactIconsAdapter = path.join(__dirname, 'lib', 'icons', 'gen-icon.ts');

// Icon packs import '../lib' (CommonJS) or '../lib/index.mjs' (ESM); the package root './lib'.
const LIB_REQUEST = /^\.\.?\/lib(?:\/index(?:\.m?js)?)?$/;

/** True when `request`, made from the file `originPath`, is react-icons' own `lib`. */
function isReactIconsLib(originPath, request) {
  if (!originPath || !LIB_REQUEST.test(request)) return false;
  const rel = path.relative(reactIconsRoot, originPath);
  return rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel);
}

module.exports = { isReactIconsLib, reactIconsAdapter, reactIconsRoot };
