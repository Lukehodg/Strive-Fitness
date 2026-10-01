import { readFileSync } from 'node:fs';
const app = JSON.parse(readFileSync(new URL('../mobile/app.json', import.meta.url), 'utf8')).expo;
const checks = [];
const check = (label, ok) => checks.push({ label, ok: !!ok });
function https(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password && !url.search && !url.hash && url.pathname === '/'
      && !['localhost', '127.0.0.1', '[::1]', 'example.com'].includes(url.hostname)
      && !url.hostname.endsWith('.localhost') && !url.hostname.endsWith('.example.com') && !url.hostname.endsWith('.example');
  } catch { return false; }
}
check('Production PostgreSQL URL is configured', /^postgres(ql)?:\/\//.test(process.env.DATABASE_URL || ''));
check('Public HTTPS backend origin is configured', https(process.env.PUBLIC_API_URL));
check('Mobile HTTPS API URL matches backend', https(process.env.EXPO_PUBLIC_API_URL) && process.env.EXPO_PUBLIC_API_URL?.replace(/\/$/, '') === process.env.PUBLIC_API_URL?.replace(/\/$/, ''));
check('Stable provider encryption key is configured', /^[a-f0-9]{64}$/i.test(process.env.INTEGRATION_ENCRYPTION_KEY || ''));
check('Expo project is linked', !!app.extra?.eas?.projectId);
check('iOS bundle identifier is configured', !!app.ios?.bundleIdentifier);
check('Android package identifier is configured', !!app.android?.package);
check('Private beta signup allowlist is configured', !!process.env.BETA_ALLOWED_EMAILS?.trim());
for (const { label, ok } of checks) console.log(`${ok ? 'PASS' : 'MISSING'} ${label}`);
console.log('Signing credentials, iOS device registration, HTTPS reachability, backups and installed-device testing require separate verification.');
process.exitCode = checks.every(c => c.ok) ? 0 : 1;
