// eslint-config-expo (classic config for ESLint 8).
module.exports = {
  root: true,
  extends: ["expo"],
  ignorePatterns: [
    "node_modules/",
    "dist/",
    "dist-web/",
    ".expo/",
    "web-stubs/",
    "supabase/functions/", // Deno runtime, separate lint target
  ],
};
