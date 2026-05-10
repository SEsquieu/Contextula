import path from 'node:path';
import { writeFile } from 'node:fs/promises';
import { appendJsonl, id, now, readJson, readJsonl, VERSION, writeJson } from './util.js';
import { resolveWorkspace } from './storage.js';

function topClaims(claims, limit = 5) {
  return claims
    .filter((claim) => claim.status === 'active')
    .sort((a, b) => (b.confidence || 0) - (a.confidence || 0))
    .slice(0, limit);
}

function dateStamp() {
  return new Date().toISOString().slice(0, 10);
}

export async function draftOutreach(home, workspaceId, { channel = 'email', tone = 'concise' } = {}) {
  const { record, root } = await resolveWorkspace(home, workspaceId);
  const profile = await readJson(path.join(root, 'profile.json'), {});
  const claims = topClaims(await readJsonl(path.join(root, 'memory', 'claims.jsonl')));
  const claimBullets = claims.map((claim) => `- ${claim.text}`).join('\n') || '- No grounded claims yet; keep this very tentative.';
  const customerName = record.name || profile.name || record.slug;
  const artifact = `drafts/outreach-${dateStamp()}-${id('draft').replace(/[^a-z0-9_]/gi, '-')}.md`;

  const draft = `# Outreach Draft\n\nCustomer: ${customerName}\nChannel: ${channel}\nTone: ${tone}\nGenerated: ${now()}\n\n## Grounding\n\n${claimBullets}\n\n## Draft\n\nSubject: Quick thought on ${customerName}'s web presence\n\nHi there,\n\nI was looking over ${customerName}'s public web presence and noticed a couple of small places where the site could potentially support the business more clearly.\n\nRather than pitch a big rebuild, I would start with a short modernization pass: clarify the main conversion path, preserve the trust signals that are already working, and identify one small improvement that could ship quickly.\n\nWould it be useful if I put together a short, no-pressure snapshot of what I noticed?\n\nBest,\n\n[Your name]\n\n## Internal review checklist\n\n- Verify the business identity is correct.\n- Remove or soften any claim that is not directly grounded.\n- Confirm this outreach fits the intended offer.\n- Human approval is required before sending.\n`;

  await writeFile(path.join(root, artifact), draft, 'utf8');
  await appendJsonl(path.join(root, 'timeline.jsonl'), { id: id('evt'), type: 'draft.generated', at: now(), artifact, channel, tone });

  const approval = {
    id: id('appr'),
    version: VERSION,
    type: 'outreach.send',
    status: 'pending',
    requestedAt: now(),
    requestedBy: 'contextula-draft',
    artifact,
    reason: 'External customer contact requires human approval.'
  };
  await writeJson(path.join(root, 'approvals', `${approval.id}.json`), approval);
  await appendJsonl(path.join(root, 'timeline.jsonl'), { id: id('evt'), type: 'approval.requested', at: now(), approvalId: approval.id, action: approval.type, artifact });

  return { artifact, approval, draft };
}
