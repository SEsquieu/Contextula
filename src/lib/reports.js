import path from 'node:path';
import { readdir, writeFile } from 'node:fs/promises';
import { appendJsonl, id, now, readJson, readJsonl } from './util.js';
import { resolveWorkspace } from './storage.js';

export async function generateReport(home, workspaceId) {
  const { record, root } = await resolveWorkspace(home, workspaceId);
  const profile = await readJson(path.join(root, 'profile.json'), {});
  const timeline = await readJsonl(path.join(root, 'timeline.jsonl'));
  const claims = await readJsonl(path.join(root, 'memory', 'claims.jsonl'));
  const approvalFiles = (await readdir(path.join(root, 'approvals'))).filter((file) => file.endsWith('.json'));
  const approvals = [];
  for (const file of approvalFiles) approvals.push(await readJson(path.join(root, 'approvals', file), {}));

  const pendingApprovals = approvals.filter((approval) => approval.status === 'pending');
  const latestEvents = timeline.slice(-8).map((event) => `- ${event.at} — ${event.type}`).join('\n') || '- No events yet.';
  const activeClaims = claims.filter((claim) => claim.status === 'active');
  const claimLines = activeClaims.slice(0, 10).map((claim) => `- ${claim.text} (${Math.round((claim.confidence || 0) * 100)}%)`).join('\n') || '- No active claims yet.';
  const approvalLines = pendingApprovals.map((approval) => `- ${approval.id}: ${approval.type} → ${approval.artifact || '(no artifact)'}`).join('\n') || '- No pending approvals.';

  const report = `# Workspace Status Report\n\nWorkspace: ${record.name || record.slug}\nID: ${record.id}\nGenerated: ${now()}\n\n## Profile\n\n- Website: ${profile.website || '(none)'}\n- Status: ${record.status}\n- Homepage captured: ${profile.currentDigitalPresence?.websiteSnapshotCaptured ? 'yes' : 'no'}\n\n## Active claims\n\n${claimLines}\n\n## Pending approvals\n\n${approvalLines}\n\n## Recent timeline\n\n${latestEvents}\n`;
  await writeFile(path.join(root, 'reports', 'current-status.md'), report, 'utf8');
  await appendJsonl(path.join(root, 'timeline.jsonl'), { id: id('evt'), type: 'report.generated', at: now(), artifact: 'reports/current-status.md' });
  return report;
}
