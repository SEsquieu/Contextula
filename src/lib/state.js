import path from 'node:path';
import { readdir, writeFile } from 'node:fs/promises';
import { appendJsonl, id, now, readJson, readJsonl, writeJson } from './util.js';
import { resolveWorkspace } from './storage.js';

async function readApprovals(root) {
  const files = (await readdir(path.join(root, 'approvals')).catch(() => [])).filter((file) => file.endsWith('.json'));
  const approvals = [];
  for (const file of files) approvals.push(await readJson(path.join(root, 'approvals', file), {}));
  return approvals;
}

async function safeJsonl(root, relativePath) {
  return readJsonl(path.join(root, relativePath)).catch(() => []);
}

export async function materializeWorkspaceState(home, workspaceId) {
  const { record, root } = await resolveWorkspace(home, workspaceId);
  const profile = await readJson(path.join(root, 'profile.json'), {});
  const timeline = await safeJsonl(root, 'timeline.jsonl');
  const claims = await safeJsonl(root, 'memory/claims.jsonl');
  const observations = await safeJsonl(root, 'research/observations.jsonl');
  const tickets = await safeJsonl(root, 'tickets/tickets.jsonl');
  const approvals = await readApprovals(root);

  const activeClaims = claims.filter((claim) => claim.status === 'active');
  const pendingApprovals = approvals.filter((approval) => approval.status === 'pending');
  const openTickets = tickets.filter((ticket) => ticket.status === 'open');
  const state = {
    version: 1,
    generatedAt: now(),
    workspace: {
      id: record.id,
      type: record.type,
      name: record.name || record.slug,
      status: record.status,
      path: record.path
    },
    profile: {
      name: profile.name || null,
      website: profile.website || null,
      homepageCaptured: Boolean(profile.currentDigitalPresence?.websiteSnapshotCaptured),
      pagesCaptured: profile.currentDigitalPresence?.pagesCaptured || 0,
      lastResearchAt: profile.currentDigitalPresence?.lastResearchAt || null
    },
    counts: {
      events: timeline.length,
      activeClaims: activeClaims.length,
      observations: observations.length,
      openTickets: openTickets.length,
      pendingApprovals: pendingApprovals.length,
      totalApprovals: approvals.length
    },
    latestEvent: timeline.at(-1) || null,
    pendingApprovals: pendingApprovals.map((approval) => ({ id: approval.id, type: approval.type, artifact: approval.artifact || null })),
    openTickets: openTickets.map((ticket) => ({ id: ticket.id, title: ticket.title, priority: ticket.priority, effort: ticket.effort })),
    topClaims: activeClaims
      .sort((a, b) => (b.confidence || 0) - (a.confidence || 0))
      .slice(0, 8)
      .map((claim) => ({ id: claim.id, text: claim.text, confidence: claim.confidence, source: claim.source }))
  };

  await writeJson(path.join(root, 'state.json'), state);
  const md = `# Workspace State\n\nWorkspace: ${state.workspace.name}\nID: ${state.workspace.id}\nGenerated: ${state.generatedAt}\n\n## Counts\n\n- Events: ${state.counts.events}\n- Active claims: ${state.counts.activeClaims}\n- Observations: ${state.counts.observations}\n- Open tickets: ${state.counts.openTickets}\n- Pending approvals: ${state.counts.pendingApprovals}\n\n## Pending approvals\n\n${state.pendingApprovals.map((approval) => `- ${approval.id}: ${approval.type} → ${approval.artifact || '(none)'}`).join('\n') || '- None.'}\n\n## Open tickets\n\n${state.openTickets.map((ticket) => `- ${ticket.id}: ${ticket.title} (${ticket.priority})`).join('\n') || '- None.'}\n\n## Top claims\n\n${state.topClaims.map((claim) => `- ${claim.text} (${Math.round((claim.confidence || 0) * 100)}%)`).join('\n') || '- None.'}\n`;
  await writeFile(path.join(root, 'reports', 'state-summary.md'), md, 'utf8');
  await appendJsonl(path.join(root, 'timeline.jsonl'), { id: id('evt'), type: 'state.materialized', at: now(), artifacts: ['state.json', 'reports/state-summary.md'] });
  return state;
}

export async function readTimeline(home, workspaceId, { limit = 20 } = {}) {
  const { root } = await resolveWorkspace(home, workspaceId);
  const events = await safeJsonl(root, 'timeline.jsonl');
  return events.slice(-Number(limit || 20));
}
