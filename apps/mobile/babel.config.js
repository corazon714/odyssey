module.exports = function babelConfig(api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    // Reanimated 4 moved its worklet transform into react-native-worklets. The plugin
    // must stay last in the list.
    plugins: ['react-native-worklets/plugin'],
  };
};
