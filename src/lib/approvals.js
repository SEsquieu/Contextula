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

export async function createApproval(root, approval) {
  const approvalsDir = path.join(root, 'approvals');
  const files = (await readdir(approvalsDir).catch(() => [])).filter((file) => file.endsWith('.json'));
  for (const file of files) {
    const existing = await readJson(path.join(approvalsDir, file), {});
    if (existing.status === 'pending' && existing.type === approval.type && existing.artifact === approval.artifact) {
      return { approval: existing, created: false };
    }
  }

  const fullApproval = {
    id: approval.id || id('appr'),
    version: approval.version || 1,
    status: approval.status || 'pending',
    requestedAt: approval.requestedAt || now(),
    ...approval
  };
  await writeJson(path.join(root, 'approvals', `${fullApproval.id}.json`), fullApproval);
  await appendJsonl(path.join(root, 'timeline.jsonl'), { id: id('evt'), type: 'approval.requested', at: now(), approvalId: fullApproval.id, action: fullApproval.type, artifact: fullApproval.artifact });
  return { approval: fullApproval, created: true };
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
