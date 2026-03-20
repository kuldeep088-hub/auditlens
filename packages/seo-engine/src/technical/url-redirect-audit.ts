import type { CheckResult, PageData } from '@audit/types';
import { randomUUID } from 'crypto';

/**
 * URL-001 through URL-007
 * Audits URLs, redirects, canonicals, and URL quality.
 */
export function runUrlRedirectAudit(pages: PageData[]): CheckResult[] {
  const results: CheckResult[] = [];

  // ── URL-001: status code distribution ──────────────────────────────────
  const statusBuckets: Record<string, string[]> = {};
  for (const page of pages) {
    const bucket = `${Math.floor(page.statusCode / 100)}xx`;
    if (!statusBuckets[bucket]) statusBuckets[bucket] = [];
    statusBuckets[bucket].push(page.url);
  }
  const total = pages.length;
  const count2xx = (statusBuckets['2xx'] || []).length;
  const count3xx = (statusBuckets['3xx'] || []).length;
  const count4xx = (statusBuckets['4xx'] || []).length;
  const count5xx = (statusBuckets['5xx'] || []).length;

  const errorRate = total > 0 ? (count4xx + count5xx) / total : 0;
  let statusScore = 100;
  if (errorRate > 0.2) statusScore = 20;
  else if (errorRate > 0.1) statusScore = 50;
  else if (errorRate > 0.05) statusScore = 70;
  else if (errorRate > 0) statusScore = 85;

  results.push({
    id: randomUUID(),
    checkId: 'URL-001',
    checkName: 'HTTP status code distribution',
    pillar: 'seo',
    category: 'Technical SEO',
    pageUrl: null,
    status: errorRate > 0.1 ? 'fail' : errorRate > 0 ? 'warning' : 'pass',
    severity: errorRate > 0.1 ? 'high' : 'warning',
    score: statusScore,
    message: `Status distribution: 2xx: ${count2xx}, 3xx: ${count3xx}, 4xx: ${count4xx}, 5xx: ${count5xx} (total: ${total}).`,
    details: {
      distribution: {
        '2xx': count2xx,
        '3xx': count3xx,
        '4xx': count4xx,
        '5xx': count5xx,
      },
      errorRate: Math.round(errorRate * 100) / 100,
      sample4xx: (statusBuckets['4xx'] || []).slice(0, 20),
      sample5xx: (statusBuckets['5xx'] || []).slice(0, 20),
    },
    recommendation:
      errorRate > 0
        ? 'Investigate and fix pages returning 4xx/5xx errors. Update or remove links pointing to these URLs.'
        : null,
    wcagCriterion: null,
    element: null,
  });

  // ── URL-002: redirect chains (more than 1 hop) ────────────────────────
  const longChains: { url: string; hops: number; chain: string[] }[] = [];
  for (const page of pages) {
    if (page.redirectChain.length > 1) {
      longChains.push({
        url: page.url,
        hops: page.redirectChain.length,
        chain: page.redirectChain.map((h) => `${h.statusCode} ${h.url}`),
      });
    }
  }
  const noLongChains = longChains.length === 0;
  results.push({
    id: randomUUID(),
    checkId: 'URL-002',
    checkName: 'No excessive redirect chains',
    pillar: 'seo',
    category: 'Technical SEO',
    pageUrl: null,
    status: noLongChains ? 'pass' : 'warning',
    severity: 'warning',
    score: noLongChains
      ? 100
      : Math.max(0, 100 - longChains.length * 10),
    message: noLongChains
      ? 'No redirect chains with more than 1 hop detected.'
      : `${longChains.length} URL(s) have redirect chains with more than 1 hop.`,
    details: noLongChains ? null : { longChains: longChains.slice(0, 30) },
    recommendation: noLongChains
      ? null
      : 'Shorten redirect chains to a single hop. Update links to point directly to the final destination URL.',
    wcagCriterion: null,
    element: null,
  });

  // ── URL-003: redirect loops ────────────────────────────────────────────
  const loops: { url: string; chain: string[] }[] = [];
  for (const page of pages) {
    if (page.redirectChain.length > 0) {
      const urls = page.redirectChain.map((h) => h.url);
      const uniqueUrls = new Set(urls);
      if (uniqueUrls.size < urls.length) {
        loops.push({
          url: page.url,
          chain: urls,
        });
      }
    }
  }
  const noLoops = loops.length === 0;
  results.push({
    id: randomUUID(),
    checkId: 'URL-003',
    checkName: 'No redirect loops',
    pillar: 'seo',
    category: 'Technical SEO',
    pageUrl: null,
    status: noLoops ? 'pass' : 'fail',
    severity: 'critical',
    score: noLoops ? 100 : 0,
    message: noLoops
      ? 'No redirect loops detected.'
      : `${loops.length} redirect loop(s) detected.`,
    details: noLoops ? null : { loops: loops.slice(0, 20) },
    recommendation: noLoops
      ? null
      : 'Fix redirect loops immediately. They prevent both users and search engines from accessing the page.',
    wcagCriterion: null,
    element: null,
  });

  // ── URL-004: internal links pointing to non-200 pages ──────────────────
  const pageStatusMap = new Map<string, number>();
  for (const p of pages) {
    pageStatusMap.set(normalizeUrl(p.url), p.statusCode);
  }

  const brokenInternalLinks: { from: string; to: string; statusCode: number | null }[] = [];
  for (const page of pages) {
    for (const link of page.internalLinks) {
      const normalized = normalizeUrl(resolveUrl(page.url, link.href));
      const status = pageStatusMap.get(normalized);
      if (status !== undefined && status !== 200 && status < 300) {
        // non-200, non-redirect
      }
      if (status !== undefined && (status >= 400 || status === 0)) {
        brokenInternalLinks.push({
          from: page.url,
          to: link.href,
          statusCode: status,
        });
      }
    }
  }
  const noBroken = brokenInternalLinks.length === 0;
  results.push({
    id: randomUUID(),
    checkId: 'URL-004',
    checkName: 'Internal links point to valid pages',
    pillar: 'seo',
    category: 'Technical SEO',
    pageUrl: null,
    status: noBroken ? 'pass' : 'fail',
    severity: 'high',
    score: noBroken
      ? 100
      : Math.max(0, 100 - brokenInternalLinks.length * 5),
    message: noBroken
      ? 'All internal links point to pages that return 200.'
      : `${brokenInternalLinks.length} internal link(s) point to non-200 pages (4xx/5xx).`,
    details: noBroken ? null : { brokenLinks: brokenInternalLinks.slice(0, 50) },
    recommendation: noBroken
      ? null
      : 'Fix or remove internal links to broken pages. Update them to point to valid URLs.',
    wcagCriterion: null,
    element: null,
  });

  // ── URL-005: canonical tag present on all indexable pages ──────────────
  const indexablePages = pages.filter(
    (p) =>
      p.statusCode === 200 &&
      !(p.metaRobots && p.metaRobots.toLowerCase().includes('noindex')),
  );
  const missingCanonical: string[] = [];
  for (const page of indexablePages) {
    if (!page.canonicalUrl) {
      missingCanonical.push(page.url);
    }
  }
  const allHaveCanonical = missingCanonical.length === 0;
  results.push({
    id: randomUUID(),
    checkId: 'URL-005',
    checkName: 'Canonical tag present on indexable pages',
    pillar: 'seo',
    category: 'Technical SEO',
    pageUrl: null,
    status: allHaveCanonical ? 'pass' : 'warning',
    severity: 'warning',
    score: allHaveCanonical
      ? 100
      : indexablePages.length > 0
        ? Math.round(
            ((indexablePages.length - missingCanonical.length) /
              indexablePages.length) *
              100,
          )
        : 100,
    message: allHaveCanonical
      ? `All ${indexablePages.length} indexable pages have a canonical tag.`
      : `${missingCanonical.length} of ${indexablePages.length} indexable page(s) are missing a canonical tag.`,
    details: allHaveCanonical ? null : { missingCanonical: missingCanonical.slice(0, 50) },
    recommendation: allHaveCanonical
      ? null
      : 'Add a rel="canonical" tag to every indexable page to prevent duplicate content issues.',
    wcagCriterion: null,
    element: null,
  });

  // ── URL-006: self-referencing canonicals ───────────────────────────────
  const nonSelfCanonical: { url: string; canonical: string }[] = [];
  for (const page of indexablePages) {
    if (page.canonicalUrl) {
      if (normalizeUrl(page.canonicalUrl) !== normalizeUrl(page.url)) {
        nonSelfCanonical.push({ url: page.url, canonical: page.canonicalUrl });
      }
    }
  }
  const allSelfRef = nonSelfCanonical.length === 0;
  const pagesWithCanonical = indexablePages.filter((p) => p.canonicalUrl).length;
  results.push({
    id: randomUUID(),
    checkId: 'URL-006',
    checkName: 'Self-referencing canonical tags',
    pillar: 'seo',
    category: 'Technical SEO',
    pageUrl: null,
    status: allSelfRef ? 'pass' : 'info',
    severity: 'info',
    score: allSelfRef
      ? 100
      : pagesWithCanonical > 0
        ? Math.round(
            ((pagesWithCanonical - nonSelfCanonical.length) /
              pagesWithCanonical) *
              100,
          )
        : 100,
    message: allSelfRef
      ? 'All canonical tags are self-referencing.'
      : `${nonSelfCanonical.length} page(s) have canonical tags pointing to a different URL.`,
    details: allSelfRef ? null : { nonSelfCanonical: nonSelfCanonical.slice(0, 50) },
    recommendation: allSelfRef
      ? null
      : 'Review pages with non-self-referencing canonicals. Ensure the canonical URL is the preferred version of the page.',
    wcagCriterion: null,
    element: null,
  });

  // ── URL-007: URL quality ──────────────────────────────────────────────
  const urlIssues: { url: string; problems: string[] }[] = [];
  for (const page of pages) {
    const problems: string[] = [];
    try {
      const parsed = new URL(page.url);
      const path = parsed.pathname;

      // Check for uppercase
      if (path !== path.toLowerCase()) {
        problems.push('Contains uppercase characters');
      }
      // Check for underscores
      if (path.includes('_')) {
        problems.push('Contains underscores (use hyphens instead)');
      }
      // Check for double slashes
      if (path.includes('//')) {
        problems.push('Contains double slashes');
      }
      // Check for excessive query params
      if (parsed.searchParams.toString().length > 200) {
        problems.push('Excessively long query string');
      }
      // Check for depth
      const segments = path.split('/').filter(Boolean);
      if (segments.length > 5) {
        problems.push(`Deep URL nesting (${segments.length} levels)`);
      }
      // Check for length
      if (page.url.length > 200) {
        problems.push(`URL too long (${page.url.length} characters)`);
      }
      // Check for special chars
      if (/[{}\[\]|\\^~`<>]/.test(path)) {
        problems.push('Contains special characters');
      }
      // Check for session IDs / tracking params
      const suspiciousParams = ['sessionid', 'sid', 'phpsessid', 'jsessionid'];
      for (const sp of suspiciousParams) {
        if (parsed.searchParams.has(sp)) {
          problems.push(`Contains session parameter: ${sp}`);
        }
      }
    } catch {
      problems.push('URL is malformed');
    }

    if (problems.length > 0) {
      urlIssues.push({ url: page.url, problems });
    }
  }
  const urlQualityOk = urlIssues.length === 0;
  results.push({
    id: randomUUID(),
    checkId: 'URL-007',
    checkName: 'URL quality and structure',
    pillar: 'seo',
    category: 'Technical SEO',
    pageUrl: null,
    status: urlQualityOk ? 'pass' : 'warning',
    severity: 'warning',
    score: urlQualityOk
      ? 100
      : Math.max(
          0,
          100 - Math.round((urlIssues.length / Math.max(1, pages.length)) * 100),
        ),
    message: urlQualityOk
      ? 'All URLs follow best practices for structure and readability.'
      : `${urlIssues.length} URL(s) have quality issues.`,
    details: urlQualityOk ? null : { urlIssues: urlIssues.slice(0, 50) },
    recommendation: urlQualityOk
      ? null
      : 'Use lowercase, hyphen-separated, short, descriptive URLs without unnecessary parameters or deep nesting.',
    wcagCriterion: null,
    element: null,
  });

  return results;
}

function normalizeUrl(url: string): string {
  try {
    const u = new URL(url);
    let path = u.pathname;
    if (path.length > 1 && path.endsWith('/')) {
      path = path.slice(0, -1);
    }
    return `${u.protocol}//${u.host}${path}${u.search}`.toLowerCase();
  } catch {
    return url.toLowerCase();
  }
}

function resolveUrl(base: string, href: string): string {
  try {
    return new URL(href, base).href;
  } catch {
    return href;
  }
}
