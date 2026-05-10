import path from 'node:path';
import { readdir, writeFile } from 'node:fs/promises';
import { loadRegistry } from './storage.js';
import { now, readJson, readJsonl } from './util.js';

async function countApprovals(root) {
  const dir = path.join(root, 'approvals');
  const files = (await readdir(dir).catch(() => [])).filter((file) => file.endsWith('.json'));
  let pending = 0;
  let total = 0;
  for (const file of files) {
    const approval = await readJson(path.join(dir, file), {});
    total += 1;
    if (approval.status === 'pending') pending += 1;
  }
  return { pending, total };
}

export async function summarizeWorkspace(home, record) {
  const root = path.join(home, record.path);
  const profile = await readJson(path.join(root, 'profile.json'), {});
  const claims = await readJsonl(path.join(root, 'memory', 'claims.jsonl')).catch(() => []);
  const tickets = await readJsonl(path.join(root, 'tickets', 'tickets.jsonl')).catch(() => []);
  const timeline = await readJsonl(path.join(root, 'timeline.jsonl')).catch(() => []);
  const approvals = await countApprovals(root);
  return {
    id: record.id,
    type: record.type,
    name: record.name || record.slug,
    status: record.status,
    website: profile.website || null,
    activeClaims: claims.filter((claim) => claim.status === 'active').length,
    openTickets: tickets.filter((ticket) => ticket.status === 'open').length,
    pendingApprovals: approvals.pending,
    totalApprovals: approvals.total,
    lastEvent: timeline.at(-1)?.type || null,
    lastEventAt: timeline.at(-1)?.at || null,
    path: record.path
  };
}

export async function portfolioSummary(home) {
  const registry = await loadRegistry(home);
  const workspaces = [];
  for (const record of registry.workspaces) workspaces.push(await summarizeWorkspace(home, record));
  return {
    generatedAt: now(),
    totalWorkspaces: workspaces.length,
    pendingApprovals: workspaces.reduce((sum, workspace) => sum + workspace.pendingApprovals, 0),
    openTickets: workspaces.reduce((sum, workspace) => sum + workspace.openTickets, 0),
    workspaces
  };
}

export async function writePortfolioReport(home) {
  const summary = await portfolioSummary(home);
  const lines = summary.workspaces.map((workspace) => `| ${workspace.id} | ${workspace.name} | ${workspace.status} | ${workspace.pendingApprovals} | ${workspace.openTickets} | ${workspace.activeClaims} | ${workspace.lastEvent || ''} |`);
  const report = `# Contextula Portfolio\n\nGenerated: ${summary.generatedAt}\n\n- Workspaces: ${summary.totalWorkspaces}\n- Pending approvals: ${summary.pendingApprovals}\n- Open tickets: ${summary.openTickets}\n\n| ID | Name | Status | Pending approvals | Open tickets | Claims | Last event |\n|---|---|---:|---:|---:|---:|---|\n${lines.join('\n') || '| | No workspaces yet | | | | | |'}\n`;
  await writeFile(path.join(home, 'portfolio.md'), report, 'utf8');
  return { summary, report, artifact: path.join(home, 'portfolio.md') };
}
