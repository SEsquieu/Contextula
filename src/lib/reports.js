import path from 'node:path';
import { readdir, writeFile } from 'node:fs/promises';
import { appendJsonl, id, now, readJson, readJsonl } from './util.js';
import { resolveWorkspace } from './storage.js';

async function readApprovals(root) {
  const approvalFiles = (await readdir(path.join(root, 'approvals'))).filter((file) => file.endsWith('.json'));
  const approvals = [];
  for (const file of approvalFiles) approvals.push(await readJson(path.join(root, 'approvals', file), {}));
  return approvals;
}

function topClaims(claims, limit = 8) {
  return claims
    .filter((claim) => claim.status === 'active')
    .sort((a, b) => (b.confidence || 0) - (a.confidence || 0))
    .slice(0, limit);
}

export async function generateReport(home, workspaceId) {
  const { record, root } = await resolveWorkspace(home, workspaceId);
  const profile = await readJson(path.join(root, 'profile.json'), {});
  const timeline = await readJsonl(path.join(root, 'timeline.jsonl'));
  const claims = await readJsonl(path.join(root, 'memory', 'claims.jsonl'));
  const approvals = await readApprovals(root);

  const pendingApprovals = approvals.filter((approval) => approval.status === 'pending');
  const latestEvents = timeline.slice(-8).map((event) => `- ${event.at} — ${event.type}`).join('\n') || '- No events yet.';
  const claimLines = topClaims(claims, 10).map((claim) => `- ${claim.text} (${Math.round((claim.confidence || 0) * 100)}%)`).join('\n') || '- No active claims yet.';
  const approvalLines = pendingApprovals.map((approval) => `- ${approval.id}: ${approval.type} → ${approval.artifact || '(no artifact)'}`).join('\n') || '- No pending approvals.';

  const report = `# Workspace Status Report\n\nWorkspace: ${record.name || record.slug}\nID: ${record.id}\nGenerated: ${now()}\n\n## Profile\n\n- Website: ${profile.website || '(none)'}\n- Status: ${record.status}\n- Homepage captured: ${profile.currentDigitalPresence?.websiteSnapshotCaptured ? 'yes' : 'no'}\n\n## Active claims\n\n${claimLines}\n\n## Pending approvals\n\n${approvalLines}\n\n## Recent timeline\n\n${latestEvents}\n`;
  await writeFile(path.join(root, 'reports', 'current-status.md'), report, 'utf8');
  await appendJsonl(path.join(root, 'timeline.jsonl'), { id: id('evt'), type: 'report.generated', at: now(), artifact: 'reports/current-status.md' });
  return report;
}

export async function generateBrief(home, workspaceId) {
  const { record, root } = await resolveWorkspace(home, workspaceId);
  const profile = await readJson(path.join(root, 'profile.json'), {});
  const claims = topClaims(await readJsonl(path.join(root, 'memory', 'claims.jsonl')), 12);
  const approvals = await readApprovals(root);
  const pendingApprovalCount = approvals.filter((approval) => approval.status === 'pending').length;

  const claimLines = claims.map((claim) => `- ${claim.text}\n  - Evidence: ${claim.source}\n  - Confidence: ${Math.round((claim.confidence || 0) * 100)}%`).join('\n') || '- No grounded claims yet.';
  const digitalPresence = profile.currentDigitalPresence || {};

  const brief = `# Modernization Brief\n\nCustomer: ${record.name || profile.name || record.slug}\nWorkspace: ${record.id}\nGenerated: ${now()}\n\n## Current understanding\n\n- Website: ${profile.website || '(none provided)'}\n- Homepage status: ${digitalPresence.homepageStatus || '(unknown)'}\n- Pages captured: ${digitalPresence.pagesCaptured || (digitalPresence.websiteSnapshotCaptured ? 1 : 0)}\n- Pending approval gates: ${pendingApprovalCount}\n\n## Grounded claims\n\n${claimLines}\n\n## Initial read\n\nThis workspace has enough context to support an internal modernization conversation, but any customer-facing outreach still needs human review. The useful next move is to turn the strongest claims into a small, specific offer rather than a generic website pitch.\n\n## Suggested modernization angles\n\n1. **Clarify the conversion path**\n   - Make the primary action obvious: call, book, request quote, or start intake.\n   - Keep this tied to what the current site already appears to emphasize.\n\n2. **Preserve existing trust signals**\n   - Reuse credible signals already present in the public presence.\n   - Do not invent authority, credentials, guarantees, or customer outcomes.\n\n3. **Ship one small improvement first**\n   - Recommend a narrow first step with visible business value.\n   - Avoid a huge rebuild proposal until goals and appetite are confirmed.\n\n## Recommended next step\n\nCreate a human-reviewed outreach or kickoff draft that references one or two grounded observations and asks a low-friction discovery question.\n\n## Approval note\n\nDo not send this brief externally as-is. It is an internal operating artifact unless explicitly approved and rewritten for the customer.\n`;

  const artifact = 'reports/modernization-brief.md';
  await writeFile(path.join(root, artifact), brief, 'utf8');
  await appendJsonl(path.join(root, 'timeline.jsonl'), { id: id('evt'), type: 'brief.generated', at: now(), artifact });
  return brief;
}
