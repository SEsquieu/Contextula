import path from 'node:path';
import { mkdir, rename, writeFile } from 'node:fs/promises';
import { appendJsonl, exists, id, now, readJsonl } from './util.js';
import { resolveWorkspace } from './storage.js';
import { classifyWorkspace } from './classification.js';

function topClaims(claims, limit = 8) {
  return claims
    .filter((claim) => claim.status === 'active')
    .sort((a, b) => (b.confidence || 0) - (a.confidence || 0))
    .slice(0, limit);
}

function ticket(title, rationale, firstStep, { priority = 'medium', effort = 'small', approval = 'internal' } = {}) {
  return {
    id: id('ticket'),
    createdAt: now(),
    status: 'open',
    priority,
    effort,
    approval,
    title,
    rationale,
    firstStep
  };
}

function baseTickets(classification) {
  return [ticket(
    'Confirm site identity and modernization goal',
    `The workspace is currently classified as ${classification.label}. Confirm whether this classification and goal are correct before customer-facing work.`,
    `Review the top claims and confirm the target outcome: ${classification.primaryGoal}`,
    { priority: 'high', effort: 'small', approval: 'internal' }
  )];
}

function projectHubTickets() {
  return [
    ticket(
      'Clarify project routing hierarchy',
      'The site appears to be a personal/project hub, so the key modernization surface is helping visitors understand what is live, planned, and experimental.',
      'Create a simple routing model: live projects, planned channels, experiments, and build notes.',
      { priority: 'high', effort: 'small', approval: 'internal draft; external use requires review' }
    ),
    ticket(
      'Strengthen launch/status storytelling',
      'Semantic claims indicate the site already uses signal/transmission/status language. A structured status layer could make the brand feel intentional.',
      'Draft a small status vocabulary for live, incoming, experimental, and archived destinations.',
      { priority: 'medium', effort: 'small', approval: 'internal' }
    ),
    ticket(
      'Create a project-hub-specific design review',
      'The design should reinforce identity continuity and project navigation rather than quote/contact conversion.',
      'Review the latest design mock for project-hub fit and reject any service-business CTA language.',
      { priority: 'medium', effort: 'small', approval: 'design.review approval required' }
    )
  ];
}

function serviceBusinessTickets(claimText) {
  const tickets = [ticket(
    'Clarify the primary conversion path',
    'Current claims suggest the public presence may rely on direct contact or needs clearer next-step guidance.',
    'Inspect the homepage snapshot and draft one concrete CTA improvement: call, quote request, booking, or intake.',
    { priority: 'high', effort: 'small', approval: 'customer-facing changes require approval' }
  )];

  if (/trust|local|licensed|insured|family|years/.test(claimText)) {
    tickets.push(ticket(
      'Preserve and strengthen trust signals',
      'The research indicates trust/local credibility may already be part of the business messaging.',
      'List existing trust signals from research artifacts and identify where they should appear in a refreshed page or brief.',
      { priority: 'medium', effort: 'small', approval: 'internal draft; external use requires approval' }
    ));
  }

  tickets.push(ticket(
    'Prepare a human-reviewed outreach or kickoff draft',
    'Contextula can turn grounded claims into an outreach artifact, but external communication remains approval-gated.',
    'Run draft outreach, review the generated draft, and approve/reject the corresponding outreach.send approval gate.',
    { priority: 'medium', effort: 'small', approval: 'outreach.send approval required' }
  ));
  return tickets;
}

function generalPresenceTickets() {
  return [
    ticket(
      'Identify the primary audience and next step',
      'The workspace does not yet have enough signal to assume a service funnel or project-hub flow.',
      'Add or confirm claims describing audience, purpose, and the most useful visitor action.',
      { priority: 'high', effort: 'small', approval: 'internal' }
    ),
    ticket(
      'Generate a neutral presence brief',
      'A general web presence should clarify identity before optimizing for a specific conversion model.',
      'Review the modernization brief and update claims with the correct site type.',
      { priority: 'medium', effort: 'small', approval: 'internal' }
    )
  ];
}

export async function generateTickets(home, workspaceId) {
  const { record, root } = await resolveWorkspace(home, workspaceId);
  await mkdir(path.join(root, 'tickets'), { recursive: true });
  const claims = topClaims(await readJsonl(path.join(root, 'memory', 'claims.jsonl')));
  const claimText = claims.map((claim) => claim.text).join(' ').toLowerCase();
  const classification = classifyWorkspace(claims);
  const archiveId = now().replace(/[:.]/g, '-');
  let archivedPrevious = false;
  for (const file of ['tickets.jsonl', 'modernization-tickets.md']) {
    const current = path.join(root, 'tickets', file);
    if (await exists(current)) {
      await mkdir(path.join(root, 'tickets', 'archive'), { recursive: true });
      await rename(current, path.join(root, 'tickets', 'archive', `${archiveId}-${file}`));
      archivedPrevious = true;
    }
  }

  const tickets = [
    ...baseTickets(classification),
    ...(classification.kind === 'personal-project-hub'
      ? projectHubTickets()
      : classification.kind === 'service-business'
        ? serviceBusinessTickets(claimText)
        : generalPresenceTickets())
  ];

  const jsonl = tickets.map((item) => JSON.stringify(item)).join('\n') + '\n';
  await writeFile(path.join(root, 'tickets', 'tickets.jsonl'), jsonl, 'utf8');

  const md = `# Modernization Tickets\n\nWorkspace: ${record.name || record.slug}\nClassification: ${classification.label}\nGenerated: ${now()}\n\n${tickets.map((item, index) => `## ${index + 1}. ${item.title}\n\n- ID: ${item.id}\n- Status: ${item.status}\n- Priority: ${item.priority}\n- Effort: ${item.effort}\n- Approval: ${item.approval}\n\n${item.rationale}\n\nFirst step: ${item.firstStep}\n`).join('\n')}\n`;
  await writeFile(path.join(root, 'tickets', 'modernization-tickets.md'), md, 'utf8');
  await appendJsonl(path.join(root, 'timeline.jsonl'), { id: id('evt'), type: 'tickets.generated', at: now(), count: tickets.length, artifact: 'tickets/modernization-tickets.md', classification: classification.kind, archivedPrevious: archivedPrevious ? archiveId : null });
  return tickets;
}

export async function listTickets(home, workspaceId) {
  const { root } = await resolveWorkspace(home, workspaceId);
  return readJsonl(path.join(root, 'tickets', 'tickets.jsonl'));
}
