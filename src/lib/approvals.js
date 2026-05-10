import path from 'node:path';
import { readdir } from 'node:fs/promises';
import { appendJsonl, id, now, readJson, writeJson } from './util.js';
import { resolveWorkspace } from './storage.js';

export async function listApprovals(home, workspaceId) {
  const { record, root } = await resolveWorkspace(home, workspaceId);
  const approvalsDir = path.join(root, 'approvals');
  const files = (await readdir(approvalsDir)).filter((file) => file.endsWith('.json'));
  const approvals = [];
  for (const file of files) approvals.push(await readJson(path.join(approvalsDir, file), {}));
  return { record, root, approvals };
}

export async function setApprovalStatus(home, workspaceId, approvalId, status) {
  const { root } = await resolveWorkspace(home, workspaceId);
  const approvalsDir = path.join(root, 'approvals');
  const files = (await readdir(approvalsDir)).filter((file) => file.endsWith('.json'));
  const file = files.find((candidate) => candidate === `${approvalId}.json` || candidate.startsWith(`${approvalId}.`));
  if (!file) throw new Error(`Approval not found: ${approvalId}`);
  const approvalPath = path.join(approvalsDir, file);
  const approval = await readJson(approvalPath, {});
  approval.status = status;
  approval.resolvedAt = now();
  await writeJson(approvalPath, approval);
  await appendJsonl(path.join(root, 'timeline.jsonl'), {
    id: id('evt'),
    type: `approval.${status}`,
    at: now(),
    approvalId: approval.id,
    action: approval.type,
    artifact: approval.artifact || null
  });
  return approval;
}
