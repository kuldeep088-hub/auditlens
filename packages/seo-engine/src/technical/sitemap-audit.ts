import type { CheckResult, PageData, CrawlResult } from '@audit/types';
import { randomUUID } from 'crypto';

/**
 * SITEMAP-001 through SITEMAP-007
 * Audits XML sitemaps for completeness and correctness.
 */
export function runSitemapAudit(crawlResult: CrawlResult): CheckResult[] {
  const results: CheckResult[] = [];
  const { sitemapUrls, pages } = crawlResult;

  const pagesByUrl = new Map<string, PageData>();
  for (const p of pages) {
    pagesByUrl.set(normalizeUrl(p.url), p);
  }

  // ── SITEMAP-001: sitemap exists ────────────────────────────────────────
  const exists = sitemapUrls.length > 0;
  results.push({
    id: randomUUID(),
    checkId: 'SITEMAP-001',
    checkName: 'XML sitemap exists',
    pillar: 'seo',
    category: 'Technical SEO',
    pageUrl: null,
    status: exists ? 'pass' : 'fail',
    severity: 'high',
    score: exists ? 100 : 0,
    message: exists
      ? `Found ${sitemapUrls.length} URL(s) in the sitemap.`
      : 'No XML sitemap was found for this site.',
    details: null,
    recommendation: exists
      ? null
      : 'Create and submit an XML sitemap to help search engines discover all important pages.',
    wcagCriterion: null,
    element: null,
  });

  if (!exists) {
    return results;
  }

  // ── SITEMAP-002: valid XML (heuristic — check that sitemap URLs are parseable) ─
  const invalidUrls: string[] = [];
  for (const u of sitemapUrls) {
    try {
      new URL(u);
    } catch {
      invalidUrls.push(u);
    }
  }
  const validXml = invalidUrls.length === 0;
  results.push({
    id: randomUUID(),
    checkId: 'SITEMAP-002',
    checkName: 'Sitemap URLs are valid',
    pillar: 'seo',
    category: 'Technical SEO',
    pageUrl: null,
    status: validXml ? 'pass' : 'warning',
    severity: 'warning',
    score: validXml ? 100 : Math.max(0, 100 - invalidUrls.length * 10),
    message: validXml
      ? 'All sitemap URLs are well-formed.'
      : `${invalidUrls.length} URL(s) in the sitemap are malformed.`,
    details: validXml ? null : { invalidUrls: invalidUrls.slice(0, 20) },
    recommendation: validXml
      ? null
      : 'Fix the malformed URLs in your sitemap. Each <loc> must contain a fully qualified URL.',
    wcagCriterion: null,
    element: null,
  });

  // ── SITEMAP-003: URL count check (max 50,000 per sitemap) ──────────────
  const MAX_URLS = 50000;
  const countOk = sitemapUrls.length <= MAX_URLS;
  results.push({
    id: randomUUID(),
    checkId: 'SITEMAP-003',
    checkName: 'Sitemap URL count within limits',
    pillar: 'seo',
    category: 'Technical SEO',
    pageUrl: null,
    status: countOk ? 'pass' : 'warning',
    severity: 'warning',
    score: countOk ? 100 : 50,
    message: countOk
      ? `Sitemap contains ${sitemapUrls.length} URLs (limit: ${MAX_URLS}).`
      : `Sitemap contains ${sitemapUrls.length} URLs which exceeds the ${MAX_URLS} limit per sitemap file.`,
    details: { urlCount: sitemapUrls.length, maxAllowed: MAX_URLS },
    recommendation: countOk
      ? null
      : 'Split your sitemap into multiple sitemap files using a sitemap index, each containing no more than 50,000 URLs.',
    wcagCriterion: null,
    element: null,
  });

  // ── SITEMAP-004: URLs return 200 ──────────────────────────────────────
  const non200: { url: string; statusCode: number | null }[] = [];
  for (const u of sitemapUrls) {
    const page = pagesByUrl.get(normalizeUrl(u));
    if (page && page.statusCode !== 200) {
      non200.push({ url: u, statusCode: page.statusCode });
    }
  }
  const all200 = non200.length === 0;
  const checkedCount = sitemapUrls.filter((u) => pagesByUrl.has(normalizeUrl(u))).length;
  results.push({
    id: randomUUID(),
    checkId: 'SITEMAP-004',
    checkName: 'Sitemap URLs return HTTP 200',
    pillar: 'seo',
    category: 'Technical SEO',
    pageUrl: null,
    status: all200 ? 'pass' : 'fail',
    severity: 'high',
    score: all200
      ? 100
      : checkedCount > 0
        ? Math.round(((checkedCount - non200.length) / checkedCount) * 100)
        : 100,
    message: all200
      ? `All ${checkedCount} checked sitemap URLs return 200.`
      : `${non200.length} sitemap URL(s) do not return HTTP 200.`,
    details: all200 ? null : { non200Urls: non200.slice(0, 50), checkedCount },
    recommendation: all200
      ? null
      : 'Remove URLs that return non-200 status codes (redirects, 404s, 5xx) from your sitemap.',
    wcagCriterion: null,
    element: null,
  });

  // ── SITEMAP-005: URLs are canonical ───────────────────────────────────
  const nonCanonical: { url: string; canonical: string }[] = [];
  for (const u of sitemapUrls) {
    const page = pagesByUrl.get(normalizeUrl(u));
    if (page && page.canonicalUrl) {
      if (normalizeUrl(page.canonicalUrl) !== normalizeUrl(page.url)) {
        nonCanonical.push({ url: u, canonical: page.canonicalUrl });
      }
    }
  }
  const allCanonical = nonCanonical.length === 0;
  results.push({
    id: randomUUID(),
    checkId: 'SITEMAP-005',
    checkName: 'Sitemap URLs are canonical versions',
    pillar: 'seo',
    category: 'Technical SEO',
    pageUrl: null,
    status: allCanonical ? 'pass' : 'warning',
    severity: 'warning',
    score: allCanonical
      ? 100
      : Math.max(0, 100 - Math.round((nonCanonical.length / Math.max(1, sitemapUrls.length)) * 100)),
    message: allCanonical
      ? 'All sitemap URLs point to their canonical versions.'
      : `${nonCanonical.length} sitemap URL(s) are not the canonical version of the page.`,
    details: allCanonical ? null : { nonCanonicalUrls: nonCanonical.slice(0, 50) },
    recommendation: allCanonical
      ? null
      : 'Only include canonical URLs in your sitemap. Replace non-canonical URLs with their canonical equivalents.',
    wcagCriterion: null,
    element: null,
  });

  // ── SITEMAP-006: URLs are indexable (no noindex) ──────────────────────
  const noindexUrls: string[] = [];
  for (const u of sitemapUrls) {
    const page = pagesByUrl.get(normalizeUrl(u));
    if (page && page.metaRobots) {
      const lower = page.metaRobots.toLowerCase();
      if (lower.includes('noindex')) {
        noindexUrls.push(u);
      }
    }
    // Also check X-Robots-Tag header
    if (page && page.responseHeaders) {
      const xRobots =
        page.responseHeaders['x-robots-tag'] ||
        page.responseHeaders['X-Robots-Tag'] ||
        '';
      if (xRobots.toLowerCase().includes('noindex')) {
        if (!noindexUrls.includes(u)) {
          noindexUrls.push(u);
        }
      }
    }
  }
  const allIndexable = noindexUrls.length === 0;
  results.push({
    id: randomUUID(),
    checkId: 'SITEMAP-006',
    checkName: 'Sitemap URLs are indexable',
    pillar: 'seo',
    category: 'Technical SEO',
    pageUrl: null,
    status: allIndexable ? 'pass' : 'fail',
    severity: 'high',
    score: allIndexable
      ? 100
      : Math.max(0, 100 - Math.round((noindexUrls.length / Math.max(1, sitemapUrls.length)) * 100)),
    message: allIndexable
      ? 'All sitemap URLs are indexable.'
      : `${noindexUrls.length} sitemap URL(s) have a noindex directive.`,
    details: allIndexable ? null : { noindexUrls: noindexUrls.slice(0, 50) },
    recommendation: allIndexable
      ? null
      : 'Remove noindex pages from your sitemap, or remove the noindex directive if these pages should be indexed.',
    wcagCriterion: null,
    element: null,
  });

  // ── SITEMAP-007: missing important pages ──────────────────────────────
  const sitemapUrlSet = new Set(sitemapUrls.map(normalizeUrl));
  const missingPages: string[] = [];
  for (const page of pages) {
    if (page.statusCode !== 200) continue;
    // Skip noindex pages
    if (page.metaRobots && page.metaRobots.toLowerCase().includes('noindex')) continue;
    // Skip non-canonical pages
    if (page.canonicalUrl && normalizeUrl(page.canonicalUrl) !== normalizeUrl(page.url)) continue;
    if (!sitemapUrlSet.has(normalizeUrl(page.url))) {
      missingPages.push(page.url);
    }
  }
  const nothingMissing = missingPages.length === 0;
  const indexablePageCount = pages.filter((p) => {
    if (p.statusCode !== 200) return false;
    if (p.metaRobots && p.metaRobots.toLowerCase().includes('noindex')) return false;
    if (p.canonicalUrl && normalizeUrl(p.canonicalUrl) !== normalizeUrl(p.url)) return false;
    return true;
  }).length;
  results.push({
    id: randomUUID(),
    checkId: 'SITEMAP-007',
    checkName: 'Important pages included in sitemap',
    pillar: 'seo',
    category: 'Technical SEO',
    pageUrl: null,
    status: nothingMissing ? 'pass' : 'warning',
    severity: 'warning',
    score: nothingMissing
      ? 100
      : indexablePageCount > 0
        ? Math.round(((indexablePageCount - missingPages.length) / indexablePageCount) * 100)
        : 100,
    message: nothingMissing
      ? 'All indexable pages are included in the sitemap.'
      : `${missingPages.length} indexable page(s) are missing from the sitemap.`,
    details: nothingMissing ? null : { missingPages: missingPages.slice(0, 100) },
    recommendation: nothingMissing
      ? null
      : 'Add these indexable pages to your sitemap so search engines can discover them more reliably.',
    wcagCriterion: null,
    element: null,
  });

  return results;
}

function normalizeUrl(url: string): string {
  try {
    const u = new URL(url);
    // Remove trailing slash for comparison (except root)
    let path = u.pathname;
    if (path.length > 1 && path.endsWith('/')) {
      path = path.slice(0, -1);
    }
    return `${u.protocol}//${u.host}${path}${u.search}`.toLowerCase();
  } catch {
    return url.toLowerCase();
  }
}
