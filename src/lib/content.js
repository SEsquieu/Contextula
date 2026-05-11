import path from 'node:path';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { createApproval } from './approvals.js';
import { resolveWorkspace } from './storage.js';
import { appendJsonl, id, now, readJson, readJsonl, slugify, VERSION, writeJson } from './util.js';
import { classifyWorkspace } from './classification.js';
import { runProviderCommand } from './provider-command.js';
import { defaultOpenClawContentCommand } from './providers.js';

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

export async function buildContentPacket(home, workspaceId, { topic, type = 'blog-post', title, variant = 'content-provider-v1' } = {}) {
  if (!topic) throw new Error('Missing --topic');
  const { record, root } = await resolveWorkspace(home, workspaceId);
  const profile = await readJson(path.join(root, 'profile.json'), {});
  const claims = topClaims(await readJsonl(path.join(root, 'memory', 'claims.jsonl')).catch(() => []), 18);
  const classification = classifyWorkspace(claims);
  const preferences = await readJson(path.join(root, 'memory', 'preferences.json'), null);
  const sitePlan = await readJson(path.join(root, 'site', 'sitemap.json'), null);
  const latestChangeBrief = await latestFileJson(root, 'site/change-briefs');
  return {
    version: 1,
    kind: 'contextula.content.packet',
    generatedAt: now(),
    variant,
    workspace: { id: record.id, name: record.name || record.slug, type: record.type, status: record.status },
    profile,
    classification,
    request: { topic, type, title: title || topic },
    claims,
    editorialClaims: editorialClaims(claims),
    preferences,
    sitePlan: sitePlan ? { routes: sitePlan.routes || [], globalNav: sitePlan.globalNav || [], externalDestinations: sitePlan.externalDestinations || [] } : null,
    changeControl: latestChangeBrief,
    policy: {
      workspaceOnly: true,
      noInventedFacts: true,
      noExternalContact: true,
      publishingRequiresApproval: true,
      durableWritesByContextulaOnly: true
    },
    objective: 'Draft grounded customer-context content that can be reviewed before publication.'
  };
}

export function contentPrompt(packet) {
  return `# Contextula Content Drafting Task

You are a bounded content provider for Contextula.

Use ONLY the packet below. Do not invent dates, launch claims, metrics, testimonials, quotes, credentials, integrations, external facts, or customer approvals.

Return ONLY valid JSON matching this shape:

\`\`\`json
{
  "title": "Human-readable title",
  "summary": "Short rationale grounded in the packet.",
  "bodyMarkdown": "Markdown body for the draft content.",
  "groundingNotes": [],
  "approvalNotes": []
}
\`\`\`

Rules:

- Preserve workspace classification and brand voice.
- Prefer editorial identity/project claims over operational process claims.
- Include useful specifics when grounded; do not pad with generic filler.
- If a fact is uncertain, either omit it or mark it as a review question in approvalNotes.
- Treat the output as a draft artifact. Publishing still requires approval and site change-control.

Packet:

\`\`\`json
${JSON.stringify(packet, null, 2)}
\`\`\`
`;
}

async function latestFileJson(root, relativeDir) {
  const dir = path.join(root, relativeDir);
  const files = (await readdir(dir).catch(() => [])).filter((file) => file.endsWith('.json')).sort().reverse();
  if (!files.length) return null;
  return readJson(path.join(dir, files[0]), null).catch(() => null);
}

function validateContentProviderResponse(response, packet) {
  if (!response || typeof response !== 'object' || Array.isArray(response)) throw new Error('Content provider response must be an object');
  if (!response.bodyMarkdown || typeof response.bodyMarkdown !== 'string') throw new Error('Content provider response field "bodyMarkdown" must be a non-empty string');
  return {
    title: typeof response.title === 'string' && response.title ? response.title : packet.request.title,
    summary: typeof response.summary === 'string' ? response.summary : '',
    bodyMarkdown: response.bodyMarkdown,
    groundingNotes: Array.isArray(response.groundingNotes) ? response.groundingNotes.map(String) : [],
    approvalNotes: Array.isArray(response.approvalNotes) ? response.approvalNotes.map(String) : []
  };
}

async function rawContentOutput(provider, { response, command }, prompt) {
  if (provider === 'json') {
    if (!response) throw new Error('JSON content provider requires --response <path>');
    return readFile(response, 'utf8');
  }
  if (provider === 'openclaw') {
    const providerCommand = command || defaultOpenClawContentCommand();
    if (!providerCommand) throw new Error('OpenClaw content provider requires CONTEXTULA_OPENCLAW_CONTENT_COMMAND or CONTEXTULA_OPENCLAW_COMMAND.');
    return runProviderCommand(providerCommand, prompt);
  }
  throw new Error(`Unknown content provider: ${provider}`);
}

function composeProviderDraft({ result, packet }) {
  const grounding = result.groundingNotes.map((item) => `- ${item}`).join('\n') || packet.claims.slice(0, 8).map((claim) => `- ${claim.text}`).join('\n') || '- No grounding notes supplied.';
  const approvals = result.approvalNotes.map((item) => `- ${item}`).join('\n') || '- Human approval required before publishing.';
  return `# ${result.title}\n\nType: ${packet.request.type}\nTopic: ${packet.request.topic}\nStatus: draft\nGenerated: ${now()}\n\n## Editorial guardrails\n\n- Stay grounded in workspace claims and packet context.\n- Do not invent dates, metrics, testimonials, credentials, launch claims, or integrations.\n- Preserve workspace classification: ${packet.classification.label}.\n- Human approval is required before publishing.\n\n## Grounding notes\n\n${grounding}\n\n## Draft\n\n${result.bodyMarkdown.trim()}\n\n## Approval notes\n\n${approvals}\n`;
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

export async function draftContentWithProvider(home, workspaceId, { topic, type = 'blog-post', title, provider = 'json', response, command, variant = 'content-provider-v1' } = {}) {
  const { record, root } = await resolveWorkspace(home, workspaceId);
  await mkdir(path.join(root, 'content', 'drafts'), { recursive: true });
  await mkdir(path.join(root, 'content', 'provider-runs'), { recursive: true });
  const packet = await buildContentPacket(home, workspaceId, { topic, type, title, variant });
  const prompt = contentPrompt(packet);
  const runId = id('crun');
  const runArtifact = `content/provider-runs/${runId}`;
  const runDir = path.join(root, runArtifact);
  await mkdir(runDir, { recursive: true });
  await writeJson(path.join(runDir, 'packet.json'), packet);
  await writeFile(path.join(runDir, 'prompt.md'), prompt, 'utf8');

  let result;
  try {
    const raw = await rawContentOutput(provider, { response, command }, prompt);
    await writeFile(path.join(runDir, 'response.raw.json'), raw.replace(/^\uFEFF/, ''), 'utf8');
    result = validateContentProviderResponse(JSON.parse(raw.replace(/^\uFEFF/, '')), packet);
    await writeJson(path.join(runDir, 'response.normalized.json'), result);
  } catch (error) {
    await writeJson(path.join(runDir, 'errors.json'), { message: error.message || String(error), provider, at: now() });
    await appendJsonl(path.join(root, 'timeline.jsonl'), { id: id('evt'), type: 'content.provider.failed', at: now(), provider, run: runArtifact, error: error.message || String(error) });
    throw error;
  }

  const contentId = id('content');
  const safeTitle = result.title || title || topic;
  const slug = slugify(safeTitle);
  const artifact = `content/drafts/${slug}-${contentId}.md`;
  const metaArtifact = `content/drafts/${slug}-${contentId}.json`;
  const body = composeProviderDraft({ result, packet });
  const metadata = { version: 1, id: contentId, kind: 'contextula.content.draft', status: 'draft', type, title: safeTitle, topic, slug, createdAt: now(), workspaceId: record.id, artifact, provider, providerRun: runArtifact, groundingClaimIds: packet.claims.map((claim) => claim.id), classification: { kind: packet.classification.kind, label: packet.classification.label, primaryGoal: packet.classification.primaryGoal }, publish: { approved: false, target: 'notes', requiresSiteChange: true } };
  await writeFile(path.join(root, artifact), body, 'utf8');
  await writeJson(path.join(root, metaArtifact), metadata);
  await appendJsonl(path.join(root, 'timeline.jsonl'), { id: id('evt'), type: 'content.provider_drafted', at: now(), provider, artifact, contentId, providerRun: runArtifact, topic, contentType: type });
  const approvalResult = await createApproval(root, { id: id('appr'), version: VERSION, type: 'content.publish.review', status: 'pending', requestedAt: now(), requestedBy: 'contextula-content-provider', artifact, reason: 'Provider-backed content drafts require human review before publishing or wiring into a site.' });
  return { content: metadata, artifact, metaArtifact, providerRun: runArtifact, approval: approvalResult.approval };
}

export async function critiqueContent(home, workspaceId, { artifact } = {}) {
  if (!artifact) throw new Error('Missing --artifact');
  const { root } = await resolveWorkspace(home, workspaceId);
  const text = await readFile(path.join(root, artifact), 'utf8');
  const findings = [];
  const lower = text.toLowerCase();
  if (!text.includes('## Editorial guardrails')) findings.push({ severity: 'medium', message: 'Draft is missing editorial guardrails.' });
  if (!text.includes('## Draft')) findings.push({ severity: 'high', message: 'Draft body section is missing.' });
  const draftSection = text.split('## Draft')[1]?.split('## Approval notes')[0] || '';
  if (/testimonial|guaranteed|launched on|\b\d+ customers\b|award-winning/i.test(draftSection)) findings.push({ severity: 'high', message: 'Draft may contain ungrounded marketing/proof claims.' });
  if ((draftSection.toLowerCase().match(/approval|critique|viewport|provider|meta tag/g) || []).length > 4) findings.push({ severity: 'medium', message: 'Draft may be over-exposing operational Contextula/process language.' });
  if (draftSection.trim().length < 300) findings.push({ severity: 'medium', message: 'Draft body is very short; may not be useful content yet.' });
  const score = Math.max(0, 100 - findings.reduce((sum, finding) => sum + (finding.severity === 'high' ? 30 : 12), 0));
  const verdict = findings.some((finding) => finding.severity === 'high') || score < 80 ? 'needs-review' : 'ready-for-review';
  const critiqueId = id('contentcrit');
  const critique = { version: 1, id: critiqueId, at: now(), artifact, score, verdict, findings };
  const critiqueArtifact = `content/critiques/${critiqueId}.json`;
  const reportArtifact = `content/critiques/${critiqueId}.md`;
  await mkdir(path.join(root, 'content', 'critiques'), { recursive: true });
  await writeJson(path.join(root, critiqueArtifact), critique);
  await writeFile(path.join(root, reportArtifact), `# Content Critique\n\nArtifact: ${artifact}\nScore: ${score}\nVerdict: ${verdict}\n\n## Findings\n\n${findings.map((finding) => `- ${finding.severity}: ${finding.message}`).join('\n') || '- None.'}\n`, 'utf8');
  await appendJsonl(path.join(root, 'timeline.jsonl'), { id: id('evt'), type: 'content.critiqued', at: now(), artifact, critique: critiqueArtifact, verdict, score });
  return { critique, artifact: critiqueArtifact, report: reportArtifact };
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
