import path from 'node:path';
import { mkdir } from 'node:fs/promises';
import { now, readJson, VERSION, writeJson } from './util.js';

export async function ensureHome(home) {
  await mkdir(home, { recursive: true });
  await mkdir(path.join(home, 'workspaces', 'customers'), { recursive: true });
  await mkdir(path.join(home, 'workspaces', 'projects'), { recursive: true });
  await mkdir(path.join(home, 'indexes'), { recursive: true });
  await mkdir(path.join(home, 'cache'), { recursive: true });
  await mkdir(path.join(home, 'secrets'), { recursive: true });

  const configPath = path.join(home, 'config.json');
  const config = await readJson(configPath, null);
  if (!config) await writeJson(configPath, { version: VERSION, createdAt: now() });

  const registryPath = path.join(home, 'registry.json');
  const registry = await readJson(registryPath, null);
  if (!registry) await writeJson(registryPath, { version: VERSION, workspaces: [] });
}

export async function loadRegistry(home) {
  await ensureHome(home);
  return readJson(path.join(home, 'registry.json'), { version: VERSION, workspaces: [] });
}

export async function saveRegistry(home, registry) {
  await writeJson(path.join(home, 'registry.json'), registry);
}

export function workspacePath(home, type, workspaceId) {
  const plural = type === 'customer' ? 'customers' : 'projects';
  return path.join(home, 'workspaces', plural, workspaceId);
}

export async function resolveWorkspace(home, workspaceId) {
  const registry = await loadRegistry(home);
  const record = registry.workspaces.find((ws) => ws.id === workspaceId || ws.slug === workspaceId);
  if (!record) throw new Error(`Workspace not found: ${workspaceId}`);
  return { record, root: path.join(home, record.path) };
}
