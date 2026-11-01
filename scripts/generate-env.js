#!/usr/bin/env node
/**
 * Writes js/env.js from .env (or process.env).
 *
 *   node scripts/generate-env.js           → direct mode (key in env.js — local use only)
 *   node scripts/generate-env.js --proxy   → proxy mode (NO key in env.js — safe to deploy)
 *
 * Use this if you serve the app with something other than `npm start`
 * (for example VS Code Live Server). `npm start` serves env.js on the fly
 * and doesn't need this step.
 */
import { writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnv, renderEnvModule, isPlaceholderKey } from './load-env.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const env = loadEnv(root);
const proxyMode = process.argv.includes('--proxy');
const target = resolve(root, 'js', 'env.js');

if (proxyMode) {
  const proxyUrl = env.API_PROXY_URL || '/.netlify/functions/owm';
  writeFileSync(target, renderEnvModule({ OPENWEATHER_API_KEY: '', API_PROXY_URL: proxyUrl }));
  console.log(`✔ js/env.js written in PROXY mode → ${proxyUrl} (no API key included)`);
  process.exit(0);
}

if (isPlaceholderKey(env.OPENWEATHER_API_KEY) && !env.API_PROXY_URL) {
  console.error('✖ No OPENWEATHER_API_KEY found. Copy .env.example to .env and add your key.');
  process.exit(1);
}

writeFileSync(target, renderEnvModule(env));
console.log('✔ js/env.js written (direct mode). This file is git-ignored — keep it that way.');
