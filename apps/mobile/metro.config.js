/* eslint-disable @typescript-eslint/no-require-imports */
const path = require('node:path');
const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');
const { isReactIconsLib, reactIconsAdapter } = require('./react-icons-native');

// Expo finds the npm workspace root by itself, so `@youngvista/core` (TypeScript source) and the
// hoisted packages resolve without extra watch folders.
const config = getDefaultConfig(__dirname);

// Claude Code agent worktrees under the repo root hold a second copy of every package: keep Metro
// out of them.
const worktrees = path.resolve(__dirname, '../../.claude');
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const blockWorktrees = new RegExp(`^${escapeRe(worktrees)}(/.*)?$`);
const blockList = config.resolver.blockList;
config.resolver.blockList = blockList
  ? [...(Array.isArray(blockList) ? blockList : [blockList]), blockWorktrees]
  : [blockWorktrees];

// react-icons render through react-native-svg: see react-icons-native.js.
const upstreamResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (isReactIconsLib(context.originModulePath, moduleName)) {
    return { type: 'sourceFile', filePath: reactIconsAdapter };
  }
  return (upstreamResolveRequest ?? context.resolveRequest)(context, moduleName, platform);
};

module.exports = withNativeWind(config, {
  input: path.join(__dirname, 'global.css'),
  inlineRem: 16,
  // nativewind-env.d.ts is committed; do not let Metro rewrite tsconfig.json.
  disableTypeScriptGeneration: true,
});
