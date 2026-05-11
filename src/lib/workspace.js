import path from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';
import { appendJsonl, id, now, readJson, slugify, VERSION, writeJson } from './util.js';
import { ensureHome, loadRegistry, saveRegistry, workspacePath } from './storage.js';
import { normalizeWebsite } from './url.js';

export async function initWorkspaceDirs(root) {
  const dirs = [
    'memory/summaries',
    'research/extracted',
    'research/snapshots',
    'plans',
    'tickets',
    'design/briefs',
    'design/mocks',
    'design/critiques',
    'design/revisions',
    'design/assets',
    'drafts',
    'content/drafts',
    'content/critiques',
    'content/provider-runs',
    'feedback',
    'site/patches',
    'approvals',
    'reports',
    'assets',
    'builds',
    '.contextula'
  ];
  await Promise.all(dirs.map((dir) => mkdir(path.join(root, dir), { recursive: true })));
}

export async function createCustomer(home, input) {
  await ensureHome(home);
  const website = normalizeWebsite(input.website);
  const registry = await loadRegistry(home);
  const duplicate = website ? registry.workspaces.find((workspace) => workspace.website === website) : null;
  if (duplicate && !input.allowDuplicate) {
    throw new Error(`Workspace already exists for ${website}: ${duplicate.id}. Pass --allow-duplicate to create another.`);
  }
  const workspaceId = id('cus');
  const slug = slugify(input.name);
  const root = workspacePath(home, 'customer', workspaceId);
  await initWorkspaceDirs(root);

  const workspace = {
    version: VERSION,
    id: workspaceId,
    type: 'customer',
    slug,
    name: input.name,
    status: input.status || 'prospect',
    createdAt: now(),
    updatedAt: now(),
    source: input.source || 'manual'
  };

  const profile = {
    version: VERSION,
    workspaceId,
    name: input.name,
    website,
    category: null,
    serviceArea: [],
    contact: {},
    positioning: {},
    currentDigitalPresence: {},
    openQuestions: [],
    updatedAt: now()
  };

  await writeJson(path.join(root, 'workspace.json'), workspace);
  await writeJson(path.join(root, 'profile.json'), profile);
  await writeFile(path.join(root, 'timeline.jsonl'), '', 'utf8');
  await writeFile(path.join(root, 'memory', 'claims.jsonl'), '', 'utf8');
  await writeJson(path.join(root, '.contextula', 'policy.json'), {
    version: VERSION,
    role: 'customer-workspace-agent',
    filesystem: { allow: ['./**'], deny: ['../**'] },
    approvalsRequired: ['outreach.send', 'proposal.send', 'scope.change', 'pricing.change', 'deploy', 'billing', 'external.write']
  });

  await appendJsonl(path.join(root, 'timeline.jsonl'), {
    id: id('evt'),
    type: 'customer.created',
    at: now(),
    source: input.source || 'manual',
    name: input.name,
    website
  });
  registry.workspaces.push({
    id: workspaceId,
    type: 'customer',
    slug,
    name: input.name,
    path: path.relative(home, root),
    website,
    status: workspace.status,
    createdAt: workspace.createdAt,
    updatedAt: workspace.updatedAt
  });
  await saveRegistry(home, registry);

  return { workspaceId, root };
}

export async function listWorkspaces(home) {
  const registry = await loadRegistry(home);
  return registry.workspaces;
}

export async function readProfile(root) {
  return readJson(path.join(root, 'profile.json'), {});
}

export async function writeProfile(root, profile) {
  profile.updatedAt = now();
  await writeJson(path.join(root, 'profile.json'), profile);
}
