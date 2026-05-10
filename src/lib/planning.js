import path from 'node:path';
import { writeFile } from 'node:fs/promises';
import { appendJsonl, id, now, VERSION, writeJson } from './util.js';

export async function buildPlan(root, profile, researchResult) {
  const claims = researchResult.claims || [];
  const claimLines = claims.map((claim) => `- ${claim.text} (${Math.round(claim.confidence * 100)}% confidence)`).join('\n') || '- No claims yet.';
  const website = profile.website || 'No website provided';
  const plan = `# Initial Modernization Map\n\nCustomer: ${profile.name}\nWebsite: ${website}\nGenerated: ${now()}\n\n## Current snapshot\n\n${claimLines}\n\n## Recommended next moves\n\n1. **Confirm identity and business goals**\n   - Evidence: initial intake is thin by design.\n   - Value: avoids building on a wrong assumption.\n   - Approval: internal only.\n\n2. **Deepen public presence research**\n   - Evidence: homepage snapshot is only the first pass.\n   - Value: finds subtleties in services, tone, trust signals, and conversion paths.\n   - Approval: not required for public read-only research.\n\n3. **Prepare a human-reviewed modernization brief**\n   - Evidence: early claims need review before outreach.\n   - Value: turns observations into a small, credible proposal.\n   - Approval: required before any customer-facing send.\n\n4. **Draft first outreach or internal kickoff note**\n   - Evidence: Contextula can draft from the bounded workspace.\n   - Value: demonstrates continuity while preserving human control.\n   - Approval: required before external contact.\n\n## Open questions\n\n- What is the intended first offer: audit, website refresh, ongoing operator, or consulting engagement?\n- What contact channel is appropriate?\n- What business outcome matters most to this customer?\n`;
  await writeFile(path.join(root, 'plans', 'initial-modernization-map.md'), plan, 'utf8');
  await appendJsonl(path.join(root, 'timeline.jsonl'), { id: id('evt'), type: 'plan.generated', at: now(), artifact: 'plans/initial-modernization-map.md' });
}

export async function createApproval(root) {
  const approval = {
    id: id('appr'),
    version: VERSION,
    type: 'outreach.send',
    status: 'pending',
    requestedAt: now(),
    requestedBy: 'contextula-intake',
    artifact: 'drafts/intro-outreach.md',
    reason: 'External customer contact requires human approval.'
  };
  await writeFile(path.join(root, 'drafts', 'intro-outreach.md'), `# Intro Outreach Draft\n\nThis is a placeholder draft. Review the research snapshot and modernization map before writing customer-facing copy.\n`, 'utf8');
  await writeJson(path.join(root, 'approvals', `${approval.id}.json`), approval);
  await appendJsonl(path.join(root, 'timeline.jsonl'), { id: id('evt'), type: 'approval.requested', at: now(), approvalId: approval.id, action: approval.type, artifact: approval.artifact });
}
