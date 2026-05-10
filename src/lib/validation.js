import path from 'node:path';
import { readdir } from 'node:fs/promises';
import { exists, readJson, readJsonl } from './util.js';
import { loadRegistry, resolveWorkspace } from './storage.js';

const requiredWorkspaceFiles = [
  'workspace.json',
  'profile.json',
  'timeline.jsonl',
  'memory/claims.jsonl',
  '.contextula/policy.json'
];

const requiredWorkspaceDirs = [
  'memory',
  'research/extracted',
  'plans',
  'drafts',
  'approvals',
  'reports',
  'assets',
  'builds'
];

export async function validateWorkspace(home, workspaceId) {
  const { record, root } = await resolveWorkspace(home, workspaceId);
  const problems = [];
  for (const file of requiredWorkspaceFiles) {
    if (!(await exists(path.join(root, file)))) problems.push(`missing file: ${file}`);
  }
  for (const dir of requiredWorkspaceDirs) {
    if (!(await exists(path.join(root, dir)))) problems.push(`missing dir: ${dir}`);
  }

  const workspace = await readJson(path.join(root, 'workspace.json'), null);
  const profile = await readJson(path.join(root, 'profile.json'), null);
  if (workspace?.id !== record.id) problems.push(`workspace id mismatch: registry=${record.id} workspace=${workspace?.id}`);
  if (profile?.workspaceId !== record.id) problems.push(`profile workspaceId mismatch: registry=${record.id} profile=${profile?.workspaceId}`);

  try { await readJsonl(path.join(root, 'timeline.jsonl')); } catch (error) { problems.push(`invalid timeline jsonl: ${error.message}`); }
  try { await readJsonl(path.join(root, 'memory', 'claims.jsonl')); } catch (error) { problems.push(`invalid claims jsonl: ${error.message}`); }

  return { record, root, ok: problems.length === 0, problems };
}

export async function validateHome(home) {
  const registry = await loadRegistry(home);
  const results = [];
  for (const workspace of registry.workspaces) {
    results.push(await validateWorkspace(home, workspace.id));
  }
  return results;
}
