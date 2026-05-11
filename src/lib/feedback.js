import path from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';
import { addClaim } from './claims.js';
import { materializePreferences } from './preferences.js';
import { resolveWorkspace } from './storage.js';
import { appendJsonl, id, now, writeJson } from './util.js';

function normalizeArea(area) {
  const value = String(area || 'general').toLowerCase().trim();
  if (['content', 'design', 'site', 'brand', 'voice', 'general'].includes(value)) return value;
  return 'general';
}

export async function recordFeedback(home, workspaceId, { area = 'general', text } = {}) {
  if (!text) throw new Error('Missing --text');
  const { record, root } = await resolveWorkspace(home, workspaceId);
  const feedbackArea = normalizeArea(area);
  await mkdir(path.join(root, 'feedback'), { recursive: true });
  const feedbackId = id('fb');
  const artifact = `feedback/${feedbackId}.json`;
  const report = `feedback/${feedbackId}.md`;
  const feedback = {
    version: 1,
    id: feedbackId,
    kind: 'contextula.feedback',
    at: now(),
    workspaceId: record.id,
    workspaceName: record.name || record.slug,
    area: feedbackArea,
    text,
    effect: 'durable-generation-preference'
  };
  await writeJson(path.join(root, artifact), feedback);
  await writeFile(path.join(root, report), `# Feedback\n\nWorkspace: ${feedback.workspaceName}\nArea: ${feedbackArea}\nRecorded: ${feedback.at}\n\n## Text\n\n${text}\n\n## Effect\n\nThis feedback is recorded as durable preference memory and should reduce future provider drift.\n`, 'utf8');
  const claim = await addClaim(root, {
    text: `${feedbackArea} preference feedback: ${text}`,
    source: artifact,
    confidence: 0.96,
    metadata: { feedbackId, area: feedbackArea }
  });
  const preferences = await materializePreferences(home, workspaceId);
  await appendJsonl(path.join(root, 'timeline.jsonl'), { id: id('evt'), type: 'feedback.recorded', at: now(), artifact, report, claimId: claim.id, area: feedbackArea });
  return { feedback, artifact, report, claim, preferences };
}
