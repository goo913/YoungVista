// NativeWind turns `className` into React Native styles (react-native-reusables, shadcn/ui).
module.exports = function (api) {
  api.cache(true);
  return {
    presets: [['babel-preset-expo', { jsxImportSource: 'nativewind' }], 'nativewind/babel'],
  };
};
