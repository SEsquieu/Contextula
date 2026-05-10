import path from 'node:path';
import { appendJsonl, id, now, readJson, writeJson } from './util.js';
import { loadRegistry, resolveWorkspace, saveRegistry } from './storage.js';

export const WORKSPACE_STATUSES = [
  'prospect',
  'researching',
  'briefed',
  'awaiting-approval',
  'active',
  'paused',
  'closed'
];

export async function setWorkspaceStatus(home, workspaceId, status) {
  if (!WORKSPACE_STATUSES.includes(status)) {
    throw new Error(`Invalid status: ${status}. Expected one of: ${WORKSPACE_STATUSES.join(', ')}`);
  }
  const { record, root } = await resolveWorkspace(home, workspaceId);
  const previousStatus = record.status;
  const workspace = await readJson(path.join(root, 'workspace.json'), {});
  workspace.status = status;
  workspace.updatedAt = now();
  await writeJson(path.join(root, 'workspace.json'), workspace);

  const registry = await loadRegistry(home);
  const registryRecord = registry.workspaces.find((item) => item.id === record.id);
  if (registryRecord) {
    registryRecord.status = status;
    registryRecord.updatedAt = workspace.updatedAt;
  }
  await saveRegistry(home, registry);

  await appendJsonl(path.join(root, 'timeline.jsonl'), {
    id: id('evt'),
    type: 'workspace.status.changed',
    at: now(),
    from: previousStatus,
    to: status
  });
  return { previousStatus, status, record: { ...record, status } };
}

export async function getWorkspaceStatus(home, workspaceId) {
  const { record, root } = await resolveWorkspace(home, workspaceId);
  const workspace = await readJson(path.join(root, 'workspace.json'), {});
  return { status: workspace.status || record.status, record, workspace };
}
