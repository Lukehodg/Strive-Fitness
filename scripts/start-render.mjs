// Render generates and retains this secret; never print its value.
import { pathToFileURL } from 'node:url';

export function renderEnvironment(env) {
  const encoded = env.RENDER_INTEGRATION_KEY_BASE64 || '';
  const key = Buffer.from(encoded, 'base64');
  if (key.length !== 32 || key.toString('base64') !== encoded)
    throw new Error('Render integration key must be a canonical base64-encoded 32-byte secret.');
  const origin = new URL(env.PUBLIC_API_URL || env.RENDER_EXTERNAL_URL || '');
  if (origin.protocol !== 'https:' || origin.username || origin.password || origin.pathname !== '/' || origin.search || origin.hash)
    throw new Error('Render requires a public HTTPS origin.');
  if (!env.BETA_ALLOWED_EMAILS?.trim())
    throw new Error('The private beta requires an explicit signup allowlist.');
  return { INTEGRATION_ENCRYPTION_KEY: key.toString('hex'), PUBLIC_API_URL: origin.origin };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  Object.assign(process.env, renderEnvironment(process.env));
  await import('../dist/index.js');
}
