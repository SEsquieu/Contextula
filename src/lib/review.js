import path from 'node:path';
import { listApprovals } from './approvals.js';
import { exists } from './util.js';

export async function buildReview(home, workspaceId) {
  const { record, root, approvals } = await listApprovals(home, workspaceId);
  const pending = approvals.filter((approval) => approval.status === 'pending');
  const lines = [];
  lines.push(`Review queue for ${record.name || record.slug} (${record.id})`);
  lines.push(`Root: ${root}`);
  lines.push('');
  if (!pending.length) {
    lines.push('No pending approvals.');
  } else {
    for (const approval of pending) {
      const artifact = approval.artifact || '';
      const artifactPath = artifact ? path.join(root, artifact) : null;
      const present = artifactPath ? await exists(artifactPath) : false;
      lines.push(`- ${approval.id}`);
      lines.push(`  Type: ${approval.type}`);
      lines.push(`  Artifact: ${artifact || '(none)'}`);
      lines.push(`  Exists: ${present ? 'yes' : 'no'}`);
      lines.push(`  Reason: ${approval.reason || '(none)'}`);
      lines.push(`  Approve: contextula approve ${record.id} ${approval.id}`);
      lines.push(`  Reject:  contextula reject ${record.id} ${approval.id}`);
      lines.push('');
    }
  }
  return lines.join('\n');
}
