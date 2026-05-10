import path from 'node:path';
import { writeFile } from 'node:fs/promises';
import { appendJsonl, id, now } from './util.js';

function stripHtml(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function matchFirst(html, regex) {
  const match = html.match(regex);
  return match ? stripHtml(match[1]).slice(0, 300) : null;
}

function collectMatches(html, regex, limit = 20) {
  return [...html.matchAll(regex)].map((m) => stripHtml(m[1])).filter(Boolean).slice(0, limit);
}

function normalizeUrl(href, base) {
  try { return new URL(href, base).href; } catch { return href; }
}

export function inferClaims({ profile, page, artifact = 'research/extracted/homepage.md' }) {
  const text = `${page.title || ''} ${page.description || ''} ${page.headings.join(' ')} ${page.bodySample}`.toLowerCase();
  const claims = [];
  const push = (claimText, confidence, source = artifact) => claims.push({
    id: id('claim'),
    at: now(),
    text: claimText,
    source,
    confidence,
    status: 'active'
  });

  if (profile.website) push(`Customer has a public website at ${profile.website}.`, 0.95);
  if (page.title) push(`The page title is "${page.title}".`, 0.9);
  if (/call|phone|tel:|contact/.test(text)) push('The public presence appears to emphasize direct contact as a conversion path.', 0.66);
  if (/emergency|24\/7|24 hour|same day|urgent/.test(text)) push('Urgency or fast response may be part of the business positioning.', 0.64);
  if (/family|local|trusted|licensed|insured|years/.test(text)) push('Trust/local credibility signals appear important to the business messaging.', 0.62);
  if (/service|repair|install|maintenance/.test(text)) push('The business likely sells service-oriented work where clear service pages and CTAs matter.', 0.58);
  if (page.links.length > 12) push('The website has enough navigation/link structure to warrant a deeper crawl in a later research pass.', 0.55);

  return claims;
}

export async function fetchPage(url) {
  const startedAt = now();
  const response = await fetch(url, { redirect: 'follow', headers: { 'user-agent': 'Contextula/0.1 research snapshot' } });
  const html = await response.text();
  const title = matchFirst(html, /<title[^>]*>([\s\S]*?)<\/title>/i);
  const description = matchFirst(html, /<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["'][^>]*>/i) ||
    matchFirst(html, /<meta[^>]+content=["']([^"']*)["'][^>]+name=["']description["'][^>]*>/i);
  const headings = collectMatches(html, /<h[1-3][^>]*>([\s\S]*?)<\/h[1-3]>/gi, 20);
  const links = [...html.matchAll(/<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)]
    .map((m) => ({ href: normalizeUrl(m[1], response.url || url), text: stripHtml(m[2]).slice(0, 100) }))
    .filter((link) => link.href && !link.href.startsWith('#'))
    .slice(0, 80);
  const bodyText = stripHtml(html);

  return {
    url: response.url || url,
    status: response.status,
    fetchedAt: startedAt,
    title,
    description,
    headings,
    links,
    bodySample: bodyText.slice(0, 5000)
  };
}

function pageMarkdown(page, heading = 'Homepage Snapshot') {
  return [`# ${heading}`, ``, `URL: ${page.url}`, `Status: ${page.status}`, `Fetched: ${page.fetchedAt}`, ``, `## Title`, page.title || '(none)', ``, `## Description`, page.description || '(none)', ``, `## Headings`, ...page.headings.map((h) => `- ${h}`), ``, `## Links`, ...page.links.map((l) => `- [${l.text || l.href}](${l.href})`), ``, `## Body Sample`, page.bodySample].join('\n');
}

export async function researchHomepage(root, profile) {
  const url = profile.website;
  if (!url) return { page: null, claims: [] };

  let page;
  try {
    page = await fetchPage(url);
  } catch (error) {
    await appendJsonl(path.join(root, 'timeline.jsonl'), { id: id('evt'), type: 'research.fetch.failed', at: now(), url, error: String(error.message || error) });
    return { page: null, claims: [] };
  }

  const artifact = 'research/extracted/homepage.md';
  await appendJsonl(path.join(root, 'research', 'sources.jsonl'), {
    id: id('src'),
    type: 'website.homepage',
    at: now(),
    url,
    finalUrl: page.url,
    status: page.status,
    artifact
  });
  await writeFile(path.join(root, artifact), `${pageMarkdown(page)}\n`, 'utf8');
  await appendJsonl(path.join(root, 'timeline.jsonl'), { id: id('evt'), type: 'research.homepage.captured', at: now(), url, status: page.status, artifact });

  const claims = inferClaims({ profile, page, artifact });
  for (const claim of claims) await appendJsonl(path.join(root, 'memory', 'claims.jsonl'), claim);
  await appendJsonl(path.join(root, 'timeline.jsonl'), { id: id('evt'), type: 'claims.created', at: now(), count: claims.length, source: artifact });

  return { page, claims };
}

export async function researchWebsite(root, profile, { maxPages = 4 } = {}) {
  const homepage = await researchHomepage(root, profile);
  if (!homepage.page) return { pages: [], claims: [] };

  const baseHost = new URL(homepage.page.url).host;
  const candidates = homepage.page.links
    .map((link) => link.href)
    .filter((href) => {
      try {
        const url = new URL(href);
        return url.host === baseHost && !url.hash && !/\.(pdf|jpg|jpeg|png|gif|webp|zip)$/i.test(url.pathname);
      } catch { return false; }
    });
  const unique = [...new Set(candidates)].filter((href) => href !== homepage.page.url).slice(0, Math.max(0, maxPages - 1));

  const pages = [homepage.page];
  const claims = [...homepage.claims];
  for (const url of unique) {
    try {
      const page = await fetchPage(url);
      const safeName = new URL(page.url).pathname.replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '').toLowerCase() || 'page';
      const artifact = `research/extracted/${safeName}.md`;
      await writeFile(path.join(root, artifact), `${pageMarkdown(page, 'Page Snapshot')}\n`, 'utf8');
      await appendJsonl(path.join(root, 'research', 'sources.jsonl'), { id: id('src'), type: 'website.page', at: now(), url, finalUrl: page.url, status: page.status, artifact });
      const pageClaims = inferClaims({ profile, page, artifact });
      for (const claim of pageClaims) await appendJsonl(path.join(root, 'memory', 'claims.jsonl'), claim);
      pages.push(page);
      claims.push(...pageClaims);
    } catch (error) {
      await appendJsonl(path.join(root, 'timeline.jsonl'), { id: id('evt'), type: 'research.fetch.failed', at: now(), url, error: String(error.message || error) });
    }
  }
  await appendJsonl(path.join(root, 'timeline.jsonl'), { id: id('evt'), type: 'research.website.completed', at: now(), pages: pages.length, claims: claims.length });
  return { pages, claims };
}
