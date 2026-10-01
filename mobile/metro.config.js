const { getDefaultConfig } = require("expo/metro-config");
const path = require("node:path");

const config = getDefaultConfig(__dirname);
// This repo has separate web/mobile installs rather than npm workspaces. Watch
// only dependency-free shared modules; don't resolve React from the web app.
config.watchFolders = [...config.watchFolders, path.resolve(__dirname, "../shared")];
module.exports = config;
