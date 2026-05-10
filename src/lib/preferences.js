import path from 'node:path';
import { mkdir } from 'node:fs/promises';
import { appendJsonl, id, now, readJsonl, writeJson } from './util.js';
import { resolveWorkspace } from './storage.js';

function classifyPreference(text) {
  const lower = text.toLowerCase();
  if (/design|palette|color|styling|layout|mock|visual/.test(lower)) return 'design';
  if (/tone|voice|copy|plainspoken|language|personality/.test(lower)) return 'voice';
  if (/phone|call|form|quote|book|contact/.test(lower)) return 'conversion';
  return 'general';
}

export async function materializePreferences(home, workspaceId) {
  const { root } = await resolveWorkspace(home, workspaceId);
  await mkdir(path.join(root, 'memory'), { recursive: true });
  const claims = await readJsonl(path.join(root, 'memory', 'claims.jsonl')).catch(() => []);
  const preferenceClaims = claims.filter((claim) => {
    const text = claim.text || '';
    return claim.status === 'active' && /prefer|preference|disliked|liked|tone|design|personality|brand|voice|style/i.test(text);
  });
  const preferences = {
    version: 1,
    generatedAt: now(),
    items: preferenceClaims.map((claim) => ({
      id: claim.id,
      category: classifyPreference(claim.text || ''),
      text: claim.text,
      source: claim.source,
      confidence: claim.confidence || 0.5
    }))
  };
  await writeJson(path.join(root, 'memory', 'preferences.json'), preferences);
  await appendJsonl(path.join(root, 'timeline.jsonl'), { id: id('evt'), type: 'preferences.materialized', at: now(), count: preferences.items.length, artifact: 'memory/preferences.json' });
  return preferences;
}
