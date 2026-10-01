import { build } from 'esbuild';
await build({ entryPoints: ['server/index.ts'], platform: 'node', packages: 'external', bundle: true,
  format: 'esm', outfile: 'dist/index.js', define: { 'process.env.NODE_ENV': '"production"' } });
