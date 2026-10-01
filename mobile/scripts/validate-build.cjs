// EAS cloud hook: fail before producing a beta pointed at a placeholder server.
if (["preview", "production"].includes(process.env.EAS_BUILD_PROFILE)) {
  let valid = false;
  try {
    const url = new URL(process.env.EXPO_PUBLIC_API_URL || "");
    valid = url.protocol === "https:" && !url.username && !url.password && !url.search && !url.hash && url.pathname === "/"
      && !["localhost", "127.0.0.1", "[::1]", "example.com"].includes(url.hostname)
      && !url.hostname.endsWith(".localhost") && !url.hostname.endsWith(".example.com") && !url.hostname.endsWith(".example");
  } catch { /* Report only the missing requirement, not its supplied value. */ }
  if (!valid) { console.error("Set EXPO_PUBLIC_API_URL to your deployed HTTPS origin in the EAS build environment."); process.exit(1); }
}
