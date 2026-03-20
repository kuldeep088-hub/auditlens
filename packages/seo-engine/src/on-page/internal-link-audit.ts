import type { CheckResult, PageData } from '@audit/types';
import { randomUUID } from 'crypto';

/**
 * ILINK-001 through ILINK-004
 * Audits internal linking practices.
 */
export function runInternalLinkAudit(pages: PageData[]): CheckResult[] {
  const results: CheckResult[] = [];
  const indexablePages = pages.filter(
    (p) =>
      p.statusCode === 200 &&
      !(p.metaRobots && p.metaRobots.toLowerCase().includes('noindex')),
  );

  if (indexablePages.length === 0) return results;

  // Build a map of URL -> statusCode for all crawled pages
  const urlStatusMap = new Map<string, number>();
  for (const page of pages) {
    urlStatusMap.set(page.url, page.statusCode);
    // Also normalize: strip trailing slash for comparison
    const normalized = page.url.endsWith('/')
      ? page.url.slice(0, -1)
      : page.url + '/';
    if (!urlStatusMap.has(normalized)) {
      urlStatusMap.set(normalized, page.statusCode);
    }
  }

  // Helper to look up a status code for an href
  function getStatus(href: string): number | null {
    if (urlStatusMap.has(href)) return urlStatusMap.get(href)!;
    // Try with/without trailing slash
    const alt = href.endsWith('/') ? href.slice(0, -1) : href + '/';
    if (urlStatusMap.has(alt)) return urlStatusMap.get(alt)!;
    return null;
  }

  // ── ILINK-001: Broken internal links ──────────────────────────────────
  const brokenLinks: { pageUrl: string; href: string; statusCode: number }[] = [];

  for (const page of indexablePages) {
    for (const link of page.internalLinks) {
      const status = getStatus(link.href);
      if (status !== null && (status === 404 || status === 410 || status >= 500)) {
        brokenLinks.push({
          pageUrl: page.url,
          href: link.href,
          statusCode: status,
        });
      }
    }
  }

  const brokenCount = brokenLinks.length;
  const brokenScore = Math.max(0, 100 - 5 * brokenCount);
  const brokenSeverity: 'critical' | 'high' = brokenCount > 5 ? 'critical' : 'high';
  const brokenOk = brokenCount === 0;

  results.push({
    id: randomUUID(),
    checkId: 'ILINK-001',
    checkName: 'Broken internal links',
    pillar: 'seo',
    category: 'On-Page SEO',
    pageUrl: null,
    status: brokenOk ? 'pass' : 'fail',
    severity: brokenOk ? 'high' : brokenSeverity,
    score: brokenScore,
    message: brokenOk
      ? 'No broken internal links found across all crawled pages.'
      : `${brokenCount} broken internal link(s) found pointing to 404, 410, or 5xx pages.`,
    details: brokenOk
      ? null
      : { brokenLinks: brokenLinks.slice(0, 50) },
    recommendation: brokenOk
      ? null
      : 'Fix or remove broken internal links. Update the href to a valid destination or remove the link entirely. Broken links waste crawl budget and harm user experience.',
    wcagCriterion: null,
    element: null,
  });

  // ── ILINK-002: Internal links to redirects ────────────────────────────
  const redirectLinks: { pageUrl: string; href: string; statusCode: number }[] = [];

  for (const page of indexablePages) {
    for (const link of page.internalLinks) {
      const status = getStatus(link.href);
      if (status !== null && (status === 301 || status === 302)) {
        redirectLinks.push({
          pageUrl: page.url,
          href: link.href,
          statusCode: status,
        });
      }
    }
  }

  const redirectCount = redirectLinks.length;
  const redirectScore = Math.max(0, 100 - 2 * redirectCount);
  const redirectOk = redirectCount === 0;

  results.push({
    id: randomUUID(),
    checkId: 'ILINK-002',
    checkName: 'Internal links to redirects',
    pillar: 'seo',
    category: 'On-Page SEO',
    pageUrl: null,
    status: redirectOk ? 'pass' : 'warning',
    severity: 'warning',
    score: redirectScore,
    message: redirectOk
      ? 'No internal links point to redirecting pages.'
      : `${redirectCount} internal link(s) point to pages that return 301/302 redirects.`,
    details: redirectOk
      ? null
      : { redirectLinks: redirectLinks.slice(0, 50) },
    recommendation: redirectOk
      ? null
      : 'Update internal links to point directly to the final destination URL instead of going through redirects. This saves crawl budget and reduces latency.',
    wcagCriterion: null,
    element: null,
  });

  // ── ILINK-003: Anchor text quality ────────────────────────────────────
  const genericAnchors = new Set([
    'click here',
    'read more',
    'here',
    'link',
    'this',
    '',
  ]);

  let totalInternalLinks = 0;
  let descriptiveCount = 0;
  const genericAnchorLinks: { pageUrl: string; href: string; anchor: string }[] = [];

  for (const page of indexablePages) {
    for (const link of page.internalLinks) {
      totalInternalLinks++;
      const anchor = link.anchorText.trim().toLowerCase();
      if (genericAnchors.has(anchor)) {
        genericAnchorLinks.push({
          pageUrl: page.url,
          href: link.href,
          anchor: link.anchorText || '(empty)',
        });
      } else {
        descriptiveCount++;
      }
    }
  }

  const descriptivePercent =
    totalInternalLinks > 0
      ? Math.round((descriptiveCount / totalInternalLinks) * 100)
      : 100;
  const anchorOk = descriptivePercent >= 90;

  results.push({
    id: randomUUID(),
    checkId: 'ILINK-003',
    checkName: 'Anchor text quality',
    pillar: 'seo',
    category: 'On-Page SEO',
    pageUrl: null,
    status: anchorOk ? 'pass' : 'info',
    severity: 'info',
    score: descriptivePercent,
    message: anchorOk
      ? `${descriptivePercent}% of internal links use descriptive anchor text.`
      : `${descriptivePercent}% of internal links use descriptive anchor text. ${genericAnchorLinks.length} link(s) use generic or empty anchors.`,
    details: {
      totalInternalLinks,
      descriptiveCount,
      genericCount: genericAnchorLinks.length,
      genericAnchorLinks: genericAnchorLinks.slice(0, 50),
    },
    recommendation: anchorOk
      ? null
      : 'Replace generic anchor text like "click here", "read more", or "here" with descriptive text that tells users and search engines what the linked page is about.',
    wcagCriterion: null,
    element: null,
  });

  // ── ILINK-004: Internal nofollow ──────────────────────────────────────
  const nofollowedInternalLinks: { pageUrl: string; href: string; rel: string }[] = [];

  for (const page of indexablePages) {
    for (const link of page.internalLinks) {
      if (link.rel && link.rel.toLowerCase().includes('nofollow')) {
        nofollowedInternalLinks.push({
          pageUrl: page.url,
          href: link.href,
          rel: link.rel,
        });
      }
    }
  }

  const hasNofollow = nofollowedInternalLinks.length > 0;

  results.push({
    id: randomUUID(),
    checkId: 'ILINK-004',
    checkName: 'Internal nofollow',
    pillar: 'seo',
    category: 'On-Page SEO',
    pageUrl: null,
    status: hasNofollow ? 'warning' : 'pass',
    severity: 'warning',
    score: hasNofollow ? 60 : 100,
    message: hasNofollow
      ? `${nofollowedInternalLinks.length} internal link(s) use rel="nofollow", preventing link equity flow.`
      : 'No internal links use rel="nofollow".',
    details: hasNofollow
      ? { nofollowedLinks: nofollowedInternalLinks.slice(0, 40) }
      : null,
    recommendation: hasNofollow
      ? 'Remove rel="nofollow" from internal links unless there is a specific reason (e.g., user-generated content). Internal links should pass PageRank freely.'
      : null,
    wcagCriterion: null,
    element: null,
  });

  return results;
}
