import path from 'node:path';
import { mkdir, readdir, writeFile } from 'node:fs/promises';
import { createApproval } from './approvals.js';
import { resolveWorkspace } from './storage.js';
import { appendJsonl, id, now, readJson, readJsonl, slugify, VERSION, writeJson } from './util.js';
import { classifyWorkspace } from './classification.js';

function topClaims(claims, limit = 10) {
  return claims
    .filter((claim) => claim.status === 'active')
    .sort((a, b) => (b.confidence || 0) - (a.confidence || 0))
    .slice(0, limit);
}

function firstSentence(text) {
  return String(text || '').split(/[.!?]\s+/)[0].trim().replace(/\.+$/, '');
}

function editorialClaims(claims) {
  const lowValue = /approval|critique|viewport|generated|provider|clickable route|change-control|verdict|score|meta tag|build/i;
  const preferred = claims.filter((claim) => !lowValue.test(claim.text || ''));
  return preferred.length ? preferred : claims;
}

function draftBody({ title, topic, type, profile, classification, claims }) {
  const usableClaims = editorialClaims(claims);
  const claimBullets = claims.map((claim) => `- ${claim.text}`).join('\n') || '- No grounded claims yet; keep this piece clearly marked as exploratory.';
  const projectName = profile.name || 'this project';
  const leadClaim = firstSentence(usableClaims[0]?.text) || `${projectName} is still defining its public story`;
  return `# ${title}\n\nType: ${type}\nTopic: ${topic}\nStatus: draft\nGenerated: ${now()}\n\n## Editorial guardrails\n\n- Stay grounded in the workspace claims below.\n- Do not invent dates, launch claims, metrics, testimonials, customer quotes, credentials, or integrations.\n- Preserve the workspace classification: ${classification.label}.\n- Human approval is required before publishing.\n\n## Grounding claims\n\n${claimBullets}\n\n## Draft\n\n${projectName} is easiest to understand as a signal, not a brochure. ${leadClaim}.\n\nThat matters because a useful site should not just fill space. It should help visitors understand what is active, what is planned, and where the strongest route currently points. For this workspace, the safest editorial move is to explain the current project context plainly, keep the tone close to the existing identity, and avoid pretending that unfinished lanes are already mature publications.\n\nThe practical next step is small: publish content that describes the live work, points to the right destination, and leaves room for future notes without rewriting the whole site around every new idea. That gives the hub a reason to exist today while keeping the structure stable for tomorrow.\n\n## Publish checklist\n\n- Confirm the topic still matches the customer's current intent.\n- Replace generic phrasing with human-reviewed specifics where available.\n- Confirm any linked destination is real and approved.\n- Run site change-control before wiring this into navigation or an index.\n`;
}

export async function draftContent(home, workspaceId, { topic, type = 'blog-post', title } = {}) {
  if (!topic) throw new Error('Missing --topic');
  const { record, root } = await resolveWorkspace(home, workspaceId);
  await mkdir(path.join(root, 'content', 'drafts'), { recursive: true });
  const profile = await readJson(path.join(root, 'profile.json'), {});
  const claims = topClaims(await readJsonl(path.join(root, 'memory', 'claims.jsonl')).catch(() => []), 10);
  const classification = classifyWorkspace(claims);
  const safeTitle = title || topic;
  const contentId = id('content');
  const slug = slugify(safeTitle);
  const artifact = `content/drafts/${slug}-${contentId}.md`;
  const metaArtifact = `content/drafts/${slug}-${contentId}.json`;
  const body = draftBody({ title: safeTitle, topic, type, profile: { ...profile, name: record.name || profile.name || record.slug }, classification, claims });
  const metadata = {
    version: 1,
    id: contentId,
    kind: 'contextula.content.draft',
    status: 'draft',
    type,
    title: safeTitle,
    topic,
    slug,
    createdAt: now(),
    workspaceId: record.id,
    artifact,
    groundingClaimIds: claims.map((claim) => claim.id),
    classification: { kind: classification.kind, label: classification.label, primaryGoal: classification.primaryGoal },
    publish: { approved: false, target: 'notes', requiresSiteChange: true }
  };
  await writeFile(path.join(root, artifact), body, 'utf8');
  await writeJson(path.join(root, metaArtifact), metadata);
  await appendJsonl(path.join(root, 'timeline.jsonl'), { id: id('evt'), type: 'content.drafted', at: now(), artifact, contentId, topic, contentType: type });
  const approvalResult = await createApproval(root, {
    id: id('appr'),
    version: VERSION,
    type: 'content.publish.review',
    status: 'pending',
    requestedAt: now(),
    requestedBy: 'contextula-content',
    artifact,
    reason: 'Generated content requires human review before publishing or wiring into a site.'
  });
  return { content: metadata, artifact, metaArtifact, approval: approvalResult.approval };
}

export async function listContent(home, workspaceId) {
  const { record, root } = await resolveWorkspace(home, workspaceId);
  const draftsDir = path.join(root, 'content', 'drafts');
  const files = (await readdir(draftsDir).catch(() => [])).filter((file) => file.endsWith('.json'));
  const items = [];
  for (const file of files) items.push(await readJson(path.join(draftsDir, file), {}));
  items.sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
  return { record, root, items };
}
