import path from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';
import { appendJsonl, id, now, readJson, readJsonl } from './util.js';
import { resolveWorkspace } from './storage.js';

function topClaims(claims, limit = 6) {
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

export async function generateTickets(home, workspaceId) {
  const { record, root } = await resolveWorkspace(home, workspaceId);
  await mkdir(path.join(root, 'tickets'), { recursive: true });
  const profile = await readJson(path.join(root, 'profile.json'), {});
  const claims = topClaims(await readJsonl(path.join(root, 'memory', 'claims.jsonl')));
  const claimText = claims.map((claim) => claim.text).join(' ').toLowerCase();

  const tickets = [];
  tickets.push(ticket(
    'Confirm customer identity and modernization goal',
    'The workspace has initial public/context research, but the first business objective still needs human confirmation before recommendations become customer-facing.',
    'Review profile.json and the strongest claims, then record the intended first offer or discovery goal.',
    { priority: 'high', effort: 'small', approval: 'internal' }
  ));

  if (/call|phone|contact|conversion/.test(claimText) || profile.website) {
    tickets.push(ticket(
      'Clarify the primary conversion path',
      'Current claims suggest the public presence may rely on direct contact or needs clearer next-step guidance.',
      'Inspect the homepage snapshot and draft one concrete CTA improvement: call, quote request, booking, or intake.',
      { priority: 'high', effort: 'small', approval: 'customer-facing changes require approval' }
    ));
  }

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

  const jsonl = tickets.map((item) => JSON.stringify(item)).join('\n') + '\n';
  await writeFile(path.join(root, 'tickets', 'tickets.jsonl'), jsonl, 'utf8');

  const md = `# Modernization Tickets\n\nWorkspace: ${record.name || record.slug}\nGenerated: ${now()}\n\n${tickets.map((item, index) => `## ${index + 1}. ${item.title}\n\n- ID: ${item.id}\n- Status: ${item.status}\n- Priority: ${item.priority}\n- Effort: ${item.effort}\n- Approval: ${item.approval}\n\n${item.rationale}\n\nFirst step: ${item.firstStep}\n`).join('\n')}\n`;
  await writeFile(path.join(root, 'tickets', 'modernization-tickets.md'), md, 'utf8');
  await appendJsonl(path.join(root, 'timeline.jsonl'), { id: id('evt'), type: 'tickets.generated', at: now(), count: tickets.length, artifact: 'tickets/modernization-tickets.md' });
  return tickets;
}

export async function listTickets(home, workspaceId) {
  const { root } = await resolveWorkspace(home, workspaceId);
  return readJsonl(path.join(root, 'tickets', 'tickets.jsonl'));
}
