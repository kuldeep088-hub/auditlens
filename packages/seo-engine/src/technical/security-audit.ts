import type { CheckResult, PageData } from '@audit/types';
import { randomUUID } from 'crypto';

/**
 * SEC-001 through SEC-005
 * Audits security aspects relevant to SEO.
 */
export function runSecurityAudit(pages: PageData[]): CheckResult[] {
  const results: CheckResult[] = [];
  const okPages = pages.filter((p) => p.statusCode === 200);

  if (okPages.length === 0) return results;

  // ── SEC-001: HTTPS usage ──────────────────────────────────────────────
  const httpPages: string[] = [];
  for (const page of pages) {
    try {
      const parsed = new URL(page.url);
      if (parsed.protocol === 'http:') {
        httpPages.push(page.url);
      }
    } catch {
      // skip
    }
  }
  const allHttps = httpPages.length === 0;
  results.push({
    id: randomUUID(),
    checkId: 'SEC-001',
    checkName: 'All pages served over HTTPS',
    pillar: 'seo',
    category: 'Security',
    pageUrl: null,
    status: allHttps ? 'pass' : 'fail',
    severity: 'critical',
    score: allHttps
      ? 100
      : Math.max(
          0,
          Math.round(
            ((pages.length - httpPages.length) / Math.max(1, pages.length)) * 100,
          ),
        ),
    message: allHttps
      ? 'All pages are served over HTTPS.'
      : `${httpPages.length} page(s) are served over insecure HTTP.`,
    details: allHttps ? null : { httpPages: httpPages.slice(0, 30) },
    recommendation: allHttps
      ? null
      : 'Migrate all pages to HTTPS. Set up 301 redirects from HTTP to HTTPS and update internal links.',
    wcagCriterion: null,
    element: null,
  });

  // ── SEC-002: SSL certificate validity (heuristic from headers) ────────
  // We can't directly check certs from PageData, but we can check if any pages
  // failed to load (which might indicate cert issues) and check for cert-related headers
  // This is a basic check — flag if any HTTPS page has statusCode 0 (connection failure)
  const certIssuePages: string[] = [];
  for (const page of pages) {
    try {
      const parsed = new URL(page.url);
      if (parsed.protocol === 'https:' && page.statusCode === 0) {
        certIssuePages.push(page.url);
      }
    } catch {
      // skip
    }
  }
  const certOk = certIssuePages.length === 0;
  results.push({
    id: randomUUID(),
    checkId: 'SEC-002',
    checkName: 'SSL certificate validity',
    pillar: 'seo',
    category: 'Security',
    pageUrl: null,
    status: certOk ? 'pass' : 'fail',
    severity: 'critical',
    score: certOk ? 100 : 0,
    message: certOk
      ? 'No SSL certificate issues detected — all HTTPS pages loaded successfully.'
      : `${certIssuePages.length} HTTPS page(s) failed to load, possibly due to SSL certificate issues.`,
    details: certOk ? null : { certIssuePages: certIssuePages.slice(0, 20) },
    recommendation: certOk
      ? null
      : 'Check your SSL certificate. Ensure it is valid, not expired, covers all subdomains (use a wildcard or SAN cert), and the chain is complete.',
    wcagCriterion: null,
    element: null,
  });

  // ── SEC-003: HSTS (Strict-Transport-Security header) ──────────────────
  const missingHsts: string[] = [];
  for (const page of okPages) {
    const hsts =
      page.responseHeaders['strict-transport-security'] ||
      page.responseHeaders['Strict-Transport-Security'] ||
      '';
    if (!hsts) {
      missingHsts.push(page.url);
    }
  }
  // Deduplicate by origin
  const originsChecked = new Set<string>();
  const uniqueMissingHstsOrigins: string[] = [];
  for (const url of missingHsts) {
    try {
      const origin = new URL(url).origin;
      if (!originsChecked.has(origin)) {
        originsChecked.add(origin);
        uniqueMissingHstsOrigins.push(url);
      }
    } catch {
      uniqueMissingHstsOrigins.push(url);
    }
  }
  const hstsOk = missingHsts.length === 0;
  results.push({
    id: randomUUID(),
    checkId: 'SEC-003',
    checkName: 'HTTP Strict Transport Security (HSTS)',
    pillar: 'seo',
    category: 'Security',
    pageUrl: null,
    status: hstsOk ? 'pass' : 'warning',
    severity: 'warning',
    score: hstsOk
      ? 100
      : Math.max(
          0,
          100 -
            Math.round(
              (missingHsts.length / Math.max(1, okPages.length)) * 100,
            ),
        ),
    message: hstsOk
      ? 'All pages include the Strict-Transport-Security header.'
      : `${missingHsts.length} page(s) are missing the HSTS header.`,
    details: hstsOk
      ? null
      : { samplePages: uniqueMissingHstsOrigins.slice(0, 10) },
    recommendation: hstsOk
      ? null
      : 'Add the Strict-Transport-Security header (e.g., "max-age=31536000; includeSubDomains") to enforce HTTPS.',
    wcagCriterion: null,
    element: null,
  });

  // ── SEC-004: security headers ─────────────────────────────────────────
  const securityHeaders = [
    'x-content-type-options',
    'x-frame-options',
    'x-xss-protection',
    'content-security-policy',
    'referrer-policy',
    'permissions-policy',
  ];

  // Check a representative page (first 200-status page)
  const representativePage = okPages[0];
  const missingHeaders: string[] = [];
  const presentHeaders: string[] = [];

  if (representativePage) {
    for (const header of securityHeaders) {
      const value =
        representativePage.responseHeaders[header] ||
        representativePage.responseHeaders[
          header
            .split('-')
            .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
            .join('-')
        ] ||
        '';
      if (value) {
        presentHeaders.push(header);
      } else {
        missingHeaders.push(header);
      }
    }
  }

  const secHeaderScore =
    securityHeaders.length > 0
      ? Math.round(
          (presentHeaders.length / securityHeaders.length) * 100,
        )
      : 100;

  results.push({
    id: randomUUID(),
    checkId: 'SEC-004',
    checkName: 'Security headers present',
    pillar: 'seo',
    category: 'Security',
    pageUrl: representativePage ? representativePage.url : null,
    status:
      missingHeaders.length === 0
        ? 'pass'
        : missingHeaders.length <= 2
          ? 'info'
          : 'warning',
    severity: 'info',
    score: secHeaderScore,
    message:
      missingHeaders.length === 0
        ? 'All recommended security headers are present.'
        : `${presentHeaders.length} of ${securityHeaders.length} recommended security headers found. Missing: ${missingHeaders.join(', ')}.`,
    details: {
      present: presentHeaders,
      missing: missingHeaders,
    },
    recommendation:
      missingHeaders.length > 0
        ? `Add the following security headers: ${missingHeaders.join(', ')}. These improve security posture and can be a positive trust signal.`
        : null,
    wcagCriterion: null,
    element: null,
  });

  // ── SEC-005: mixed content ────────────────────────────────────────────
  const mixedContentPages: { url: string; mixedResources: string[] }[] = [];
  for (const page of okPages) {
    try {
      const pageProtocol = new URL(page.url).protocol;
      if (pageProtocol !== 'https:') continue;
    } catch {
      continue;
    }

    const html = page.rawHtml || '';
    const mixedResources: string[] = [];

    // Check for http:// in src attributes
    const srcPattern = /\bsrc=["'](http:\/\/[^"']+)["']/gi;
    let srcMatch: RegExpExecArray | null;
    while ((srcMatch = srcPattern.exec(html)) !== null) {
      mixedResources.push(srcMatch[1]);
    }

    // Check for http:// in href for stylesheets
    const stylesheetPattern =
      /<link\b[^>]*rel=["']stylesheet["'][^>]*href=["'](http:\/\/[^"']+)["']/gi;
    let styleMatch: RegExpExecArray | null;
    while ((styleMatch = stylesheetPattern.exec(html)) !== null) {
      mixedResources.push(styleMatch[1]);
    }

    // Also check reverse order: href before rel
    const stylesheetPattern2 =
      /<link\b[^>]*href=["'](http:\/\/[^"']+)["'][^>]*rel=["']stylesheet["']/gi;
    let styleMatch2: RegExpExecArray | null;
    while ((styleMatch2 = stylesheetPattern2.exec(html)) !== null) {
      if (!mixedResources.includes(styleMatch2[1])) {
        mixedResources.push(styleMatch2[1]);
      }
    }

    if (mixedResources.length > 0) {
      mixedContentPages.push({
        url: page.url,
        mixedResources: [...new Set(mixedResources)].slice(0, 10),
      });
    }
  }
  const noMixed = mixedContentPages.length === 0;
  results.push({
    id: randomUUID(),
    checkId: 'SEC-005',
    checkName: 'No mixed content',
    pillar: 'seo',
    category: 'Security',
    pageUrl: null,
    status: noMixed ? 'pass' : 'fail',
    severity: 'high',
    score: noMixed
      ? 100
      : Math.max(
          0,
          100 -
            Math.round(
              (mixedContentPages.length / Math.max(1, okPages.length)) * 100,
            ),
        ),
    message: noMixed
      ? 'No mixed content detected — all resources on HTTPS pages are loaded securely.'
      : `${mixedContentPages.length} HTTPS page(s) load resources over insecure HTTP (mixed content).`,
    details: noMixed ? null : { mixedContentPages: mixedContentPages.slice(0, 30) },
    recommendation: noMixed
      ? null
      : 'Update all resource URLs to use HTTPS. Mixed content degrades security and may cause browser warnings.',
    wcagCriterion: null,
    element: null,
  });

  return results;
}
