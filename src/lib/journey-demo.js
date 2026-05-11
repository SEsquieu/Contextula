import { createCustomer, readProfile, writeProfile } from './workspace.js';
import { researchHomepage, researchWebsite } from './research.js';
import { buildPlan } from './planning.js';
import { runResearchAgent } from './agents/research-agent.js';
import { generateBrief } from './reports.js';
import { generateDashboard } from './dashboard.js';
import { draftContent, critiqueContent } from './content.js';
import { recordFeedback } from './feedback.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateSitePlan, buildStaticSite, critiqueStaticSite, runSiteProvider } from './site.js';
import { generateCustomerReviewPackage } from './customer-review.js';
import { setWorkspaceStatus } from './lifecycle.js';

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const defaultJourneySiteResponse = path.resolve(moduleDir, '../../docs/fixtures/journey-demo-site-response-good.json');

export async function runJourneyDemo(home, { name, website, feedback, contentTopic, previewUrl, siteProvider = 'json', siteResponse, siteCommand } = {}) {
  if (!name) throw new Error('Missing --name');
  const { workspaceId, root } = await createCustomer(home, { name, website, source: 'journey-demo', allowDuplicate: true });
  await setWorkspaceStatus(home, workspaceId, 'researching');
  const profile = await readProfile(root);
  const researchResult = website ? await researchWebsite(root, profile, { maxPages: 2 }) : await researchHomepage(root, profile);
  profile.currentDigitalPresence = {
    ...profile.currentDigitalPresence,
    websiteSnapshotCaptured: Boolean(researchResult.pages?.length || researchResult.page),
    pagesCaptured: researchResult.pages?.length || (researchResult.page ? 1 : 0),
    lastResearchAt: new Date().toISOString()
  };
  await writeProfile(root, profile);
  await runResearchAgent(home, workspaceId, { provider: 'static' });
  await buildPlan(root, profile, researchResult);
  await generateBrief(home, workspaceId);
  if (feedback) await recordFeedback(home, workspaceId, { area: 'brand', text: feedback });
  const content = await draftContent(home, workspaceId, { topic: contentTopic || 'What this business should say publicly', type: 'brand-note' });
  await critiqueContent(home, workspaceId, { artifact: content.artifact });
  await generateSitePlan(home, workspaceId);
  const build = siteProvider === 'static'
    ? await buildStaticSite(home, workspaceId)
    : await runSiteProvider(home, workspaceId, { provider: siteProvider, response: siteResponse || (siteProvider === 'json' ? defaultJourneySiteResponse : undefined), command: siteCommand });
  await critiqueStaticSite(home, workspaceId, { build: build.build.root, viewport: 'desktop' });
  await generateDashboard(home, workspaceId);
  const review = await generateCustomerReviewPackage(home, workspaceId, { previewUrl: previewUrl || null, note: 'Demo package: this is a mock customer journey showing Contextula\'s onboarding/review loop.' });
  await setWorkspaceStatus(home, workspaceId, 'briefed');
  return { workspaceId, root, reviewPackage: review.artifact, pendingApprovals: review.pendingApprovals };
}
