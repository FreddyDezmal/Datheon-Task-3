/**
 * Minimal .env parser (no dependencies). Values already present in
 * process.env (e.g. set by Netlify/CI) take precedence over the file.
 */
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

export function parseEnv(text) {
  const result = {};
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    result[key] = value;
  }
  return result;
}

export function loadEnv(root = process.cwd()) {
  const file = resolve(root, '.env');
  const fromFile = existsSync(file) ? parseEnv(readFileSync(file, 'utf8')) : {};
  const pick = (key) => process.env[key] ?? fromFile[key] ?? '';
  return {
    hasFile: existsSync(file),
    OPENWEATHER_API_KEY: pick('OPENWEATHER_API_KEY'),
    API_PROXY_URL: pick('API_PROXY_URL'),
    PORT: pick('PORT'),
  };
}

/** Source code for js/env.js. */
export function renderEnvModule({ OPENWEATHER_API_KEY = '', API_PROXY_URL = '' }) {
  return `// AUTO-GENERATED from .env — do not edit, do not commit (listed in .gitignore).
export default ${JSON.stringify({ OPENWEATHER_API_KEY, API_PROXY_URL }, null, 2)};
`;
}

export const isPlaceholderKey = (key) => !key || /^your[_-]/i.test(key);
