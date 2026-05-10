import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { copyFile, mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { appendJsonl, id, now, readJson, writeJson } from './util.js';
import { resolveWorkspace } from './storage.js';

function safeName(value) {
  return String(value || 'snapshot').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'snapshot';
}

function viewportPreset(name) {
  if (name === 'mobile') return { width: 390, height: 844, deviceScaleFactor: 1, isMobile: true };
  return { width: 1440, height: 1200, deviceScaleFactor: 1, isMobile: false };
}

async function resolveTarget(root, profile, { url, artifact } = {}) {
  if (artifact) {
    const absolute = path.resolve(root, artifact);
    return { kind: 'artifact', label: artifact, url: pathToFileURL(absolute).href, artifact };
  }
  const targetUrl = url || profile.website;
  if (!targetUrl) throw new Error('Visual snapshot needs --url, --artifact, or profile.website');
  return { kind: 'url', label: targetUrl, url: targetUrl };
}

export async function captureVisualSnapshot(home, workspaceId, { url, artifact, viewport = 'desktop' } = {}) {
  const { record, root } = await resolveWorkspace(home, workspaceId);
  const profile = await readJson(path.join(root, 'profile.json'), {});
  const target = await resolveTarget(root, profile, { url, artifact });
  const snapshotId = id('snap');
  const relativeDir = `visual/snapshots/${snapshotId}`;
  const outDir = path.join(root, relativeDir);
  await mkdir(outDir, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  let title = '';
  try {
    const context = await browser.newContext({ viewport: viewportPreset(viewport) });
    const page = await context.newPage();
    await page.goto(target.url, { waitUntil: 'networkidle', timeout: 30000 });
    title = await page.title().catch(() => '');
    await page.screenshot({ path: path.join(outDir, `${safeName(target.kind)}-${viewport}.png`), fullPage: true });
    await writeFile(path.join(outDir, 'dom-text.txt'), (await page.locator('body').innerText().catch(() => '')).slice(0, 12000), 'utf8');
  } finally {
    await browser.close();
  }

  const metadata = {
    id: snapshotId,
    version: 1,
    createdAt: now(),
    workspaceId: record.id,
    workspaceName: record.name || record.slug,
    target,
    viewport,
    title,
    artifacts: {
      screenshot: `${relativeDir}/${safeName(target.kind)}-${viewport}.png`,
      domText: `${relativeDir}/dom-text.txt`,
      metadata: `${relativeDir}/snapshot.json`,
      analysisPrompt: `${relativeDir}/analysis-prompt.md`
    }
  };

  const prompt = `# Contextula Visual Analysis Task\n\nAnalyze the screenshot and DOM text for visual design continuity. Return concise visual claims suitable for workspace memory.\n\nWorkspace: ${metadata.workspaceName} (${metadata.workspaceId})\nTarget: ${target.label}\nScreenshot: ${metadata.artifacts.screenshot}\nDOM text: ${metadata.artifacts.domText}\n\nFocus on:\n\n- visual style and brand vocabulary\n- layout density and composition\n- typography feel\n- color palette and contrast\n- distinctive details to preserve\n- generic redesign patterns to avoid\n- modernization implications\n\nSuggested claim format:\n\n- Existing visual style: ...\n- Preserve: ...\n- Avoid: ...\n- Modernization implication: ...\n`;

  await writeJson(path.join(outDir, 'snapshot.json'), metadata);
  await writeFile(path.join(outDir, 'analysis-prompt.md'), prompt, 'utf8');
  await appendJsonl(path.join(root, 'timeline.jsonl'), { id: id('evt'), type: 'visual.snapshot.captured', at: now(), target: target.label, viewport, artifact: metadata.artifacts.screenshot, snapshot: relativeDir });
  return metadata;
}

export async function addVisualReference(home, workspaceId, { image, note = '' } = {}) {
  if (!image) throw new Error('Visual reference requires --image <path>');
  const { record, root } = await resolveWorkspace(home, workspaceId);
  const referenceId = id('vref');
  const relativeDir = `visual/references/${referenceId}`;
  const outDir = path.join(root, relativeDir);
  await mkdir(outDir, { recursive: true });
  const ext = path.extname(image) || '.png';
  const imageArtifact = `${relativeDir}/reference${ext}`;
  await copyFile(path.resolve(image), path.join(root, imageArtifact));
  const metadata = {
    id: referenceId,
    version: 1,
    createdAt: now(),
    workspaceId: record.id,
    workspaceName: record.name || record.slug,
    note,
    artifacts: {
      image: imageArtifact,
      metadata: `${relativeDir}/reference.json`,
      analysisPrompt: `${relativeDir}/analysis-prompt.md`
    }
  };
  const prompt = `# Contextula Visual Reference Analysis Task\n\nAnalyze this user-provided reference image as design guidance, not something to copy exactly. Return concise visual preference claims suitable for workspace memory.\n\nWorkspace: ${metadata.workspaceName} (${metadata.workspaceId})\nReference image: ${metadata.artifacts.image}\nUser note: ${note || '(none)'}\n\nFocus on:\n\n- what to borrow: layout density, typography, palette, mood, hierarchy, interaction style\n- what not to borrow\n- how this reference should combine with existing site visual identity\n- concrete constraints for future design prompts\n`;
  await writeJson(path.join(outDir, 'reference.json'), metadata);
  await writeFile(path.join(outDir, 'analysis-prompt.md'), prompt, 'utf8');
  await appendJsonl(path.join(root, 'timeline.jsonl'), { id: id('evt'), type: 'visual.reference.added', at: now(), artifact: imageArtifact, reference: relativeDir, note });
  return metadata;
}
