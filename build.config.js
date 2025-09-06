import { build } from 'bun';

await build({
  entrypoints: ['./index.js'],
  outdir: './dist',
  target: 'node',
  format: 'cjs',
  minify: true,
  external: [
    'fs',
    'http',
    'https',
    'zlib',
    'stream',
    'util',
    'path',
    'url',
    'querystring',
    'events'
  ],
  loader: {
    '.json': 'json'
  }
});

console.log('✅ Build complete');
