import path from 'node:path';
import { access, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createApproval } from './approvals.js';
import { resolveWorkspace } from './storage.js';
import { appendJsonl, id, now, VERSION, writeJson } from './util.js';
import { generateSiteChangeBrief } from './site.js';

const execFileAsync = promisify(execFile);
const PRODUCTION_BRANCHES = new Set(['main', 'master', 'production', 'prod']);
const SNAPSHOT_EXTENSIONS = new Set(['.html', '.css', '.js', '.md', '.json', '.txt']);
const IGNORED_DIRS = new Set(['.git', 'node_modules', 'stale', 'archive', 'archives', 'tmp', 'temp']);

async function git(repo, args) {
  const { stdout } = await execFileAsync('git', args, { cwd: repo, maxBuffer: 1024 * 1024 * 10 });
  return stdout.trim();
}

async function exists(file) {
  try { await access(file); return true; } catch { return false; }
}

async function changedFiles(repo) {
  const status = await git(repo, ['status', '--porcelain']);
  return status.split(/\r?\n/).filter(Boolean).map((line) => {
    const value = line.slice(2).trim();
    return value.includes(' -> ') ? value.split(' -> ').pop() : value;
  });
}

async function walkFiles(root, relative = '') {
  const dir = path.join(root, relative);
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
  const files = [];
  for (const entry of entries) {
    if (IGNORED_DIRS.has(entry.name)) continue;
    const child = path.join(relative, entry.name);
    if (entry.isDirectory()) files.push(...await walkFiles(root, child));
    else files.push(child.replaceAll('\\', '/'));
  }
  return files;
}

async function snapshotRepo(repo) {
  const files = await walkFiles(repo);
  const selected = [];
  for (const file of files) {
    const ext = path.extname(file).toLowerCase();
    if (!SNAPSHOT_EXTENSIONS.has(ext)) continue;
    const content = await readFile(path.join(repo, file), 'utf8').catch(() => null);
    if (content == null) continue;
    selected.push({ path: file, bytes: Buffer.byteLength(content), excerpt: content.slice(0, 12000) });
  }
  selected.sort((a, b) => a.path.localeCompare(b.path));
  return selected;
}

function localTarget(repo, href, fromFile) {
  if (!href || href.startsWith('#') || /^[a-z][a-z0-9+.-]*:/i.test(href) || href.startsWith('//')) return null;
  const clean = href.split('#')[0].split('?')[0];
  if (!clean) return null;
  if (clean.startsWith('/')) {
    const rel = clean === '/' ? 'index.html' : clean.replace(/^\//, '');
    return path.join(repo, rel.endsWith('/') ? `${rel}index.html` : rel);
  }
  const base = path.dirname(path.join(repo, fromFile));
  return path.join(base, clean.endsWith('/') ? `${clean}index.html` : clean);
}

async function checkHtml(repo) {
  const files = (await walkFiles(repo)).filter((file) => file.toLowerCase().endsWith('.html'));
  const findings = [];
  for (const file of files) {
    const html = await readFile(path.join(repo, file), 'utf8');
    if (!/<meta[^>]+name=["']viewport["']/i.test(html)) findings.push({ severity: 'high', file, message: 'Missing viewport meta tag.' });
    const refs = [...html.matchAll(/\b(?:href|src)=["']([^"']+)["']/gi)].map((match) => match[1]);
    for (const ref of refs) {
      const target = localTarget(repo, ref, file);
      if (target && !(await exists(target))) findings.push({ severity: 'high', file, message: `Broken local reference: ${ref}` });
    }
  }
  return { ok: findings.length === 0, filesChecked: files.length, findings };
}

export async function publishExistingSitePatch(home, workspaceId, { repo, branch, request, preserve, change, previewUrl = null, push = true, allowEmpty = false } = {}) {
  if (!repo) throw new Error('Missing --repo <path>');
  if (!branch) throw new Error('Missing --branch <preview-branch>');
  if (PRODUCTION_BRANCHES.has(branch)) throw new Error(`Refusing to patch protected production branch: ${branch}`);

  const { record, root } = await resolveWorkspace(home, workspaceId);
  const repoPath = path.resolve(repo);
  await git(repoPath, ['rev-parse', '--is-inside-work-tree']);
  const currentBranch = await git(repoPath, ['branch', '--show-current']);
  const beforeSwitch = await changedFiles(repoPath);
  if (currentBranch !== branch) {
    if (beforeSwitch.length) throw new Error(`Target repo has uncommitted changes on ${currentBranch}; switch to ${branch} or clean repo first.`);
    await git(repoPath, ['switch', branch]);
  }

  const changeResult = request ? await generateSiteChangeBrief(home, workspaceId, { request, preserve, change }) : null;
  const patchId = id('patch');
  const patchDir = `site/patches/${patchId}`;
  await mkdir(path.join(root, patchDir), { recursive: true });

  const snapshot = await snapshotRepo(repoPath);
  const checks = await checkHtml(repoPath);
  const files = await changedFiles(repoPath);
  if (!checks.ok) throw new Error(`Patch checks failed: ${checks.findings.map((finding) => `${finding.file}: ${finding.message}`).join('; ')}`);
  if (!files.length && !allowEmpty) throw new Error('No repo changes to publish. Use --allow-empty to record a no-op patch.');

  let commit = null;
  if (files.length) {
    await git(repoPath, ['add', '-A']);
    await git(repoPath, ['-c', 'user.name=Contextula', '-c', 'user.email=contextula@example.invalid', 'commit', '-m', `Publish Contextula site patch ${patchId}`]);
    commit = await git(repoPath, ['rev-parse', '--short', 'HEAD']);
    if (push) await git(repoPath, ['push', '-u', 'origin', branch]);
  }

  const manifest = {
    id: patchId,
    version: 1,
    createdAt: now(),
    workspaceId: record.id,
    workspaceName: record.name || record.slug,
    repo: repoPath,
    branch,
    request: request || null,
    changeBrief: changeResult?.artifacts?.[0] || null,
    checks,
    changedFiles: files,
    commit,
    pushed: Boolean(push && commit),
    previewUrl,
    state: 'review-preview-existing-site-patch'
  };
  const artifact = `${patchDir}/manifest.json`;
  const report = `${patchDir}/report.md`;
  await writeJson(path.join(root, artifact), manifest);
  await writeJson(path.join(root, `${patchDir}/snapshot.json`), { version: 1, capturedAt: now(), repo: repoPath, files: snapshot });
  const md = `# Existing Site Patch\n\nPatch: ${patchId}\nWorkspace: ${manifest.workspaceName}\nRepo: ${repoPath}\nBranch: ${branch}\nCommit: ${commit || '(no changes)'}\nPushed: ${manifest.pushed ? 'yes' : 'no'}\nPreview URL: ${previewUrl || '(not recorded)'}\n\n## Request\n\n${request || '(none recorded)'}\n\n## Checks\n\n- HTML files checked: ${checks.filesChecked}\n- Findings: ${checks.findings.length}\n\n## Changed files\n\n${files.map((file) => `- ${file}`).join('\n') || '- None.'}\n`;
  await writeFile(path.join(root, report), md, 'utf8');
  await appendJsonl(path.join(root, 'timeline.jsonl'), { id: id('evt'), type: 'site.patch.published', at: now(), artifact, report, repo: repoPath, branch, commit, pushed: manifest.pushed, previewUrl });
  const approvalResult = await createApproval(root, {
    id: id('appr'),
    version: VERSION,
    type: 'site.production.review',
    status: 'pending',
    requestedAt: now(),
    requestedBy: 'contextula-site-patch',
    artifact,
    reason: 'Existing-site preview patch passed local checks. Production merge/deploy requires human approval.'
  });
  return { manifest, artifact, report, approval: approvalResult.approval, changeApproval: changeResult?.approval || null };
}
