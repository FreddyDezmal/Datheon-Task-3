#!/usr/bin/env node
/**
 * Zero-dependency local development server.
 *
 *   npm start            → http://localhost:5500
 *
 * - Serves the project folder as static files.
 * - Serves /js/env.js generated on the fly from .env, so the key never has
 *   to be written into a file inside the repository.
 * - Blocks access to dotfiles (.env, .git) and path traversal.
 */
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { resolve, dirname, extname, join, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnv, renderEnvModule, isPlaceholderKey } from './load-env.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const initialEnv = loadEnv(root);
const port = Number(process.argv[2] || initialEnv.PORT || 5500);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
};

function send(res, status, body, type = 'text/plain; charset=utf-8') {
  res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  res.end(body);
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    let pathname = decodeURIComponent(url.pathname);

    if (pathname === '/js/env.js') {
      // Re-read .env on every request so edits apply after a refresh.
      const env = loadEnv(root);
      if (isPlaceholderKey(env.OPENWEATHER_API_KEY) && !env.API_PROXY_URL) {
        return send(res, 404, '// No API key configured', MIME['.js']);
      }
      return send(res, 200, renderEnvModule(env), MIME['.js']);
    }

    if (pathname.endsWith('/')) pathname += 'index.html';

    // Refuse dotfiles anywhere in the path (.env, .git, …)
    if (pathname.split('/').some((part) => part.startsWith('.'))) return send(res, 403, 'Forbidden');

    const filePath = resolve(join(root, pathname));
    if (filePath !== root && !filePath.startsWith(root + sep)) return send(res, 403, 'Forbidden');

    const info = await stat(filePath).catch(() => null);
    if (!info || !info.isFile()) return send(res, 404, 'Not found');

    const body = await readFile(filePath);
    send(res, 200, body, MIME[extname(filePath).toLowerCase()] ?? 'application/octet-stream');
  } catch (error) {
    console.error(error);
    send(res, 500, 'Internal server error');
  }
});

server.listen(port, () => {
  console.log(`\n  Atmosphere is running at  http://localhost:${port}\n`);
  if (!initialEnv.hasFile) {
    console.warn('  ⚠  No .env file found. Copy .env.example to .env and add your OpenWeatherMap key.\n');
  } else if (isPlaceholderKey(initialEnv.OPENWEATHER_API_KEY) && !initialEnv.API_PROXY_URL) {
    console.warn('  ⚠  OPENWEATHER_API_KEY in .env is still the placeholder value.\n');
  }
});
