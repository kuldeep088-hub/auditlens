import type { CheckResult, PageData } from '@audit/types';
import { randomUUID } from 'crypto';
import * as cheerio from 'cheerio';

/**
 * ELINK-001 through ELINK-002
 * Audits external linking practices.
 */
export function runExternalLinkAudit(pages: PageData[]): CheckResult[] {
  const results: CheckResult[] = [];
  const indexablePages = pages.filter(
    (p) =>
      p.statusCode === 200 &&
      !(p.metaRobots && p.metaRobots.toLowerCase().includes('noindex')),
  );

  if (indexablePages.length === 0) return results;

  // ── ELINK-001: Broken external links (informational) ──────────────────
  let totalExternalLinks = 0;
  const domainCounts: Record<string, number> = {};

  for (const page of indexablePages) {
    for (const link of page.externalLinks) {
      totalExternalLinks++;
      const domain = link.domain || '(unknown)';
      domainCounts[domain] = (domainCounts[domain] || 0) + 1;
    }
  }

  const uniqueDomains = Object.keys(domainCounts);
  // Sort domains by count descending for the report
  const topDomains = Object.entries(domainCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([domain, count]) => ({ domain, count }));

  results.push({
    id: randomUUID(),
    checkId: 'ELINK-001',
    checkName: 'Broken external links',
    pillar: 'seo',
    category: 'On-Page SEO',
    pageUrl: null,
    status: 'info',
    severity: 'info',
    score: 80,
    message: `Found ${totalExternalLinks} external link(s) across ${indexablePages.length} pages, pointing to ${uniqueDomains.length} unique domain(s). External links cannot be fully verified without HTTP checks.`,
    details: {
      totalExternalLinks,
      uniqueDomainCount: uniqueDomains.length,
      topDomains,
    },
    recommendation:
      totalExternalLinks > 0
        ? 'Periodically verify external links to ensure they are not broken. Use an external link checker tool to validate all outbound URLs.'
        : 'Consider adding relevant external links to authoritative sources to provide additional value to users.',
    wcagCriterion: null,
    element: null,
  });

  // ── ELINK-002: External links security (noopener) ─────────────────────
  // Parse rawHtml with cheerio to find <a target="_blank"> to external domains
  // and check if they have rel="noopener" or rel="noreferrer"
  let totalBlankLinks = 0;
  let safeBlankLinks = 0;
  const unsafeExternalLinks: {
    pageUrl: string;
    href: string;
    rel: string | null;
  }[] = [];

  for (const page of indexablePages) {
    if (!page.rawHtml) continue;

    const $ = cheerio.load(page.rawHtml);

    $('a[target="_blank"]').each((_i, el) => {
      const href = $(el).attr('href') || '';
      // Determine if the link is external
      let isExternal = false;
      try {
        if (href.startsWith('http://') || href.startsWith('https://')) {
          const linkHost = new URL(href).hostname;
          const pageHost = new URL(page.url).hostname;
          isExternal = linkHost !== pageHost;
        }
      } catch {
        // If URL parsing fails, treat as external if it starts with http
        isExternal = href.startsWith('http://') || href.startsWith('https://');
      }

      if (!isExternal) return;

      totalBlankLinks++;
      const rel = ($(el).attr('rel') || '').toLowerCase();
      const hasNoopener = rel.includes('noopener');
      const hasNoreferrer = rel.includes('noreferrer');

      if (hasNoopener || hasNoreferrer) {
        safeBlankLinks++;
      } else {
        unsafeExternalLinks.push({
          pageUrl: page.url,
          href,
          rel: $(el).attr('rel') || null,
        });
      }
    });
  }

  const safePercent =
    totalBlankLinks > 0
      ? Math.round((safeBlankLinks / totalBlankLinks) * 100)
      : 100;
  const securityOk = unsafeExternalLinks.length === 0;

  results.push({
    id: randomUUID(),
    checkId: 'ELINK-002',
    checkName: 'External links security (noopener)',
    pillar: 'seo',
    category: 'On-Page SEO',
    pageUrl: null,
    status: securityOk ? 'pass' : 'warning',
    severity: 'warning',
    score: safePercent,
    message: securityOk
      ? totalBlankLinks > 0
        ? `All ${totalBlankLinks} external link(s) with target="_blank" include rel="noopener" or rel="noreferrer".`
        : 'No external links with target="_blank" found.'
      : `${unsafeExternalLinks.length} of ${totalBlankLinks} external link(s) with target="_blank" are missing rel="noopener" or rel="noreferrer".`,
    details: securityOk
      ? null
      : { unsafeExternalLinks: unsafeExternalLinks.slice(0, 40) },
    recommendation: securityOk
      ? null
      : 'Add rel="noopener" or rel="noreferrer" to all external links that use target="_blank" to prevent reverse tabnabbing attacks and improve security.',
    wcagCriterion: null,
    element: null,
  });

  return results;
}
