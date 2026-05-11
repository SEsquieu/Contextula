import path from 'node:path';
import { readdir } from 'node:fs/promises';
import { resolveWorkspace } from './storage.js';
import { exists } from './util.js';

const knownArtifacts = [
  'profile.json',
  'state.json',
  'reports/state-summary.md',
  'reports/current-status.md',
  'reports/modernization-brief.md',
  'reports/agent-research-brief.md',
  'reports/dashboard.html',
  'research/agent-packet.json',
  'research/extracted/homepage.md',
  'plans/initial-modernization-map.md',
  'tickets/modernization-tickets.md',
  'drafts/intro-outreach.md',
  'design/briefs/design-brief.md',
  'design/mocks/homepage-v1.md',
  'design/revisions/homepage-v2.md',
  'memory/preferences.json'
];

async function latestIn(root, relativeDir, prefix = '') {
  const dir = path.join(root, relativeDir);
  const files = (await readdir(dir, { withFileTypes: true }).catch(() => []))
    .filter((entry) => entry.isFile() && (!prefix || entry.name.startsWith(prefix)))
    .map((entry) => path.join(relativeDir, entry.name));
  return files;
}

export async function listArtifacts(home, workspaceId) {
  const { record, root } = await resolveWorkspace(home, workspaceId);
  const artifacts = [];
  for (const artifact of knownArtifacts) {
    if (await exists(path.join(root, artifact))) artifacts.push(artifact);
  }
  for (const artifact of await latestIn(root, 'drafts', 'outreach-')) artifacts.push(artifact);
  for (const artifact of await latestIn(root, 'content/drafts')) artifacts.push(artifact);
  for (const artifact of await latestIn(root, 'approvals')) artifacts.push(artifact);
  return { record, root, artifacts: [...new Set(artifacts)] };
}

export function formatArtifactSummary({ record, root, artifacts }) {
  return `Artifacts for ${record.name || record.slug} (${record.id})\nRoot: ${root}\n\n${artifacts.map((artifact) => `- ${artifact}`).join('\n') || '- No artifacts found.'}`;
}
