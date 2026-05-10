import path from 'node:path';
import { appendJsonl, id, now, readJsonl } from './util.js';

export function normalizeClaimText(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function claimKey({ text, source }) {
  return `${normalizeClaimText(text)}::${String(source || '').toLowerCase().trim()}`;
}

export async function listClaims(root, { status = 'active' } = {}) {
  const claims = await readJsonl(path.join(root, 'memory', 'claims.jsonl'));
  return status === 'all' ? claims : claims.filter((claim) => claim.status === status);
}

export async function findDuplicateClaim(root, { text, source = 'manual', status = 'active' }) {
  const key = claimKey({ text, source });
  const claims = await listClaims(root, { status });
  return claims.find((claim) => claimKey(claim) === key) || null;
}

export async function addClaim(root, { text, confidence = 0.5, source = 'manual', status = 'active', dedupe = true, metadata = {} } = {}) {
  if (!text) throw new Error('Missing claim text');
  if (dedupe) {
    const duplicate = await findDuplicateClaim(root, { text, source, status });
    if (duplicate) {
      await appendJsonl(path.join(root, 'timeline.jsonl'), { id: id('evt'), type: 'claim.duplicate_skipped', at: now(), claimId: duplicate.id, source });
      return { ...duplicate, duplicate: true };
    }
  }

  const claim = {
    id: id('claim'),
    at: now(),
    text,
    source,
    confidence: Number(confidence),
    status,
    ...metadata
  };
  await appendJsonl(path.join(root, 'memory', 'claims.jsonl'), claim);
  await appendJsonl(path.join(root, 'timeline.jsonl'), { id: id('evt'), type: 'claim.added', at: now(), claimId: claim.id, source: claim.source });
  return claim;
}
