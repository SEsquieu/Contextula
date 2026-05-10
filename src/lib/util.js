import crypto from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { access, mkdir, readFile, writeFile, appendFile } from 'node:fs/promises';

export const VERSION = 1;

export function parseArgs(argv) {
  const positional = [];
  const flags = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      const next = argv[i + 1];
      if (!next || next.startsWith('--')) flags[key] = true;
      else flags[key] = argv[++i];
    } else {
      positional.push(arg);
    }
  }
  return { positional, flags };
}

export function defaultHome(flags = {}) {
  return path.resolve(flags.home || process.env.CONTEXTULA_HOME || path.join(os.homedir(), '.contextula'));
}

export function now() {
  return new Date().toISOString();
}

export function id(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${crypto.randomBytes(4).toString('hex')}`;
}

export function slugify(value) {
  return String(value || 'workspace')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'workspace';
}

export async function exists(file) {
  try { await access(file); return true; } catch { return false; }
}

export async function readJson(file, fallback) {
  if (!(await exists(file))) return fallback;
  return JSON.parse(await readFile(file, 'utf8'));
}

export async function writeJson(file, data) {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

export async function appendJsonl(file, data) {
  await mkdir(path.dirname(file), { recursive: true });
  await appendFile(file, `${JSON.stringify(data)}\n`, 'utf8');
}

export async function readJsonl(file) {
  if (!(await exists(file))) return [];
  const content = await readFile(file, 'utf8');
  return content.split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
}
