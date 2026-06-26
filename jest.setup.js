/* eslint-disable */
// Global test mocks for native modules that don't run under jsdom/node.

// AsyncStorage ships an official jest mock.
jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock"),
);

// Safe-area context: render children with static insets.
jest.mock("react-native-safe-area-context", () => {
  const React = require("react");
  const inset = { top: 0, right: 0, bottom: 0, left: 0 };
  return {
    SafeAreaProvider: ({ children }) => React.createElement(React.Fragment, null, children),
    SafeAreaView: ({ children }) => React.createElement(React.Fragment, null, children),
    useSafeAreaInsets: () => inset,
    useSafeAreaFrame: () => ({ x: 0, y: 0, width: 390, height: 844 }),
  };
});

// Vector icons render as simple text in tests.
jest.mock("@expo/vector-icons", () => {
  const React = require("react");
  const { Text } = require("react-native");
  return {
    Ionicons: ({ name }) => React.createElement(Text, null, name),
  };
});

// expo-constants: provide empty extra by default.
jest.mock("expo-constants", () => ({
  expoConfig: { extra: {} },
}));
