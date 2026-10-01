import { test } from 'node:test';
import assert from 'node:assert/strict';
// @ts-expect-error This deployment entry point is deliberately plain Node ESM.
import { renderEnvironment } from '../scripts/start-render.mjs';

const env = { RENDER_INTEGRATION_KEY_BASE64: Buffer.alloc(32, 7).toString('base64'),
  RENDER_EXTERNAL_URL: 'https://strive-test.onrender.com', BETA_ALLOWED_EMAILS: 'signup-disabled@invalid.example' };
test('Render startup preserves generated key bytes and resolves the public origin', () => {
  assert.deepEqual(renderEnvironment(env), { INTEGRATION_ENCRYPTION_KEY: '07'.repeat(32), PUBLIC_API_URL: env.RENDER_EXTERNAL_URL });
  assert.equal(renderEnvironment({ ...env, PUBLIC_API_URL: 'https://api.strive.example/' }).PUBLIC_API_URL, 'https://api.strive.example');
});
test('Render startup refuses malformed secrets, insecure origins and open beta signup', () => {
  for (const invalid of ['', 'not-base64', Buffer.alloc(16).toString('base64'), env.RENDER_INTEGRATION_KEY_BASE64 + '!'])
    assert.throws(() => renderEnvironment({ ...env, RENDER_INTEGRATION_KEY_BASE64: invalid }));
  for (const invalid of ['http://strive.example', 'https://user:password@strive.example', 'https://strive.example/path'])
    assert.throws(() => renderEnvironment({ ...env, PUBLIC_API_URL: invalid }));
  assert.throws(() => renderEnvironment({ ...env, BETA_ALLOWED_EMAILS: ' ' }));
});
