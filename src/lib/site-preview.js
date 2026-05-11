import path from 'node:path';
import { cp, mkdir, readdir, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { appendJsonl, id, now, readJson, VERSION, writeJson } from './util.js';
import { resolveWorkspace } from './storage.js';
import { createApproval } from './approvals.js';

const execFileAsync = promisify(execFile);
const PRODUCTION_BRANCHES = new Set(['main', 'master', 'production', 'prod']);

async function git(repo, args) {
  const { stdout } = await execFileAsync('git', args, { cwd: repo, maxBuffer: 1024 * 1024 * 10 });
  return stdout.trim();
}

async function latestBuild(root) {
  const buildsRoot = path.join(root, 'builds');
  const entries = (await readdir(buildsRoot, { withFileTypes: true }).catch(() => [])).filter((entry) => entry.isDirectory() && entry.name.startsWith('sitebuild_'));
  const builds = [];
  for (const entry of entries) {
    const build = await readJson(path.join(buildsRoot, entry.name, 'contextula', 'build.json'), null).catch(() => null);
    if (build) builds.push({ ...build, directory: entry.name });
  }
  builds.sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
  return builds[0] || null;
}

function normalizeBuildRoot(build) {
  if (!build) return null;
  return build.root || `builds/${build.directory || build.id}`;
}

async function resolveBuild(root, requestedBuild) {
  if (requestedBuild === 'latest') return latestBuild(root);
  return readJson(path.join(root, requestedBuild, 'contextula', 'build.json'), null).catch(() => null);
}

async function changedFiles(repo) {
  const status = await git(repo, ['status', '--porcelain']);
  return status.split(/\r?\n/).filter(Boolean).map((line) => line.slice(3).trim());
}

async function copyBuildFiles(buildRoot, repo) {
  const entries = await readdir(buildRoot, { withFileTypes: true });
  const copied = [];
  for (const entry of entries) {
    if (entry.name === 'contextula') continue;
    const from = path.join(buildRoot, entry.name);
    const to = path.join(repo, entry.name);
    await cp(from, to, { recursive: true, force: true });
    copied.push(entry.name);
  }
  return copied;
}

export async function publishSitePreview(home, workspaceId, { build: requestedBuild = 'latest', repo, branch, viewport = 'mobile', previewUrl = null, push = true } = {}) {
  if (!repo) throw new Error('Missing --repo <path>');
  if (!branch) throw new Error('Missing --branch <preview-branch>');
  if (PRODUCTION_BRANCHES.has(branch)) throw new Error(`Refusing to publish preview to protected production branch: ${branch}`);

  const { record, root } = await resolveWorkspace(home, workspaceId);
  const build = await resolveBuild(root, requestedBuild);
  if (!build) throw new Error('Missing site build. Run site generate/build first.');
  const buildRel = normalizeBuildRoot(build);
  const buildRoot = path.join(root, buildRel);
  const critiqueName = viewport === 'mobile' ? 'site-critique-mobile.json' : 'site-critique.json';
  const critique = await readJson(path.join(buildRoot, 'contextula', critiqueName), null);
  if (!critique) throw new Error(`Missing passing ${viewport} critique for ${buildRel}. Run: contextula site critique ${workspaceId} --build ${buildRel} --viewport ${viewport}`);
  if (critique.verdict !== 'ready-for-review') throw new Error(`Refusing preview publish: ${viewport} critique verdict is ${critique.verdict}, expected ready-for-review.`);

  const repoPath = path.resolve(repo);
  await git(repoPath, ['rev-parse', '--is-inside-work-tree']);
  const before = await changedFiles(repoPath);
  if (before.length) throw new Error(`Target repo is not clean: ${before.join(', ')}`);
  const currentBranch = await git(repoPath, ['branch', '--show-current']);
  if (currentBranch !== branch) await git(repoPath, ['switch', branch]);

  const copied = await copyBuildFiles(buildRoot, repoPath);
  const files = await changedFiles(repoPath);
  const previewId = id('preview');
  const commitMessage = `Publish Contextula preview ${previewId}`;
  let commit = null;
  if (files.length) {
    await git(repoPath, ['add', ...files]);
    await git(repoPath, ['-c', 'user.name=Contextula', '-c', 'user.email=contextula@example.invalid', 'commit', '-m', commitMessage]);
    commit = await git(repoPath, ['rev-parse', '--short', 'HEAD']);
    if (push) await git(repoPath, ['push', '-u', 'origin', branch]);
  }

  const manifest = {
    id: previewId,
    version: 1,
    createdAt: now(),
    workspaceId: record.id,
    workspaceName: record.name || record.slug,
    build: buildRel,
    critique: `${buildRel}/contextula/${critiqueName}`,
    critiqueVerdict: critique.verdict,
    critiqueScore: critique.score,
    viewport,
    repo: repoPath,
    branch,
    commit,
    pushed: Boolean(push && commit),
    previewUrl,
    copied,
    changedFiles: files,
    state: 'review-preview'
  };

  const artifact = `site/previews/${previewId}.json`;
  const report = `site/previews/${previewId}.md`;
  await writeJson(path.join(root, artifact), manifest);
  const md = `# Site Preview Publish\n\nPreview: ${previewId}\nWorkspace: ${manifest.workspaceName}\nBuild: ${buildRel}\nViewport gate: ${viewport} (${critique.verdict}, score ${critique.score})\nRepo: ${repoPath}\nBranch: ${branch}\nCommit: ${commit || '(no changes)'}\nPushed: ${manifest.pushed ? 'yes' : 'no'}\nPreview URL: ${previewUrl || '(not recorded)'}\n\n## Changed files\n\n${files.map((file) => `- ${file}`).join('\n') || '- None.'}\n`;
  await writeFile(path.join(root, report), md, 'utf8');
  await appendJsonl(path.join(root, 'timeline.jsonl'), { id: id('evt'), type: 'site.preview.published', at: now(), artifact, report, build: buildRel, repo: repoPath, branch, commit, pushed: manifest.pushed, previewUrl });
  const approvalResult = await createApproval(root, {
    id: id('appr'),
    version: VERSION,
    type: 'site.production.review',
    status: 'pending',
    requestedAt: now(),
    requestedBy: 'contextula-site-preview',
    artifact,
    reason: 'Preview was published from a passing build. Production merge/deploy requires human approval.'
  });
  return { manifest, artifact, report, approval: approvalResult.approval };
}
