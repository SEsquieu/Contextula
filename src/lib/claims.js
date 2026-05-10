import path from 'node:path';
import { appendJsonl, id, now, readJsonl } from './util.js';

export async function listClaims(root, { status = 'active' } = {}) {
  const claims = await readJsonl(path.join(root, 'memory', 'claims.jsonl'));
  return status === 'all' ? claims : claims.filter((claim) => claim.status === status);
}

export async function addClaim(root, { text, confidence = 0.5, source = 'manual', status = 'active' }) {
  if (!text) throw new Error('Missing claim text');
  const claim = {
    id: id('claim'),
    at: now(),
    text,
    source,
    confidence: Number(confidence),
    status
  };
  await appendJsonl(path.join(root, 'memory', 'claims.jsonl'), claim);
  await appendJsonl(path.join(root, 'timeline.jsonl'), { id: id('evt'), type: 'claim.added', at: now(), claimId: claim.id, source: claim.source });
  return claim;
}
