import type { CheckResult, CrawlResult } from '@audit/types';
import { randomUUID } from 'crypto';

/**
 * ROBOTS-001 through ROBOTS-006
 * Audits the robots.txt file for best practices.
 */
export function runRobotsAudit(crawlResult: CrawlResult): CheckResult[] {
  const results: CheckResult[] = [];
  const { robotsTxt, pages } = crawlResult;

  // ── ROBOTS-001: robots.txt exists ──────────────────────────────────────
  const exists = robotsTxt !== null && robotsTxt.trim().length > 0;
  results.push({
    id: randomUUID(),
    checkId: 'ROBOTS-001',
    checkName: 'robots.txt exists',
    pillar: 'seo',
    category: 'Technical SEO',
    pageUrl: null,
    status: exists ? 'pass' : 'fail',
    severity: 'high',
    score: exists ? 100 : 0,
    message: exists
      ? 'robots.txt file is present.'
      : 'No robots.txt file found at the root of the site.',
    details: null,
    recommendation: exists
      ? null
      : 'Create a robots.txt file at the root of your domain to control crawler access.',
    wcagCriterion: null,
    element: null,
  });

  if (!exists) {
    return results;
  }

  const txt = robotsTxt!;
  const lines = txt.split(/\r?\n/);

  // ── ROBOTS-002: valid syntax ───────────────────────────────────────────
  const knownDirectives = new Set([
    'user-agent',
    'disallow',
    'allow',
    'sitemap',
    'crawl-delay',
    'host',
    'clean-param',
    'request-rate',
    'visit-time',
    'noindex',
  ]);
  const invalidLines: { line: number; text: string }[] = [];
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i].trim();
    if (raw === '' || raw.startsWith('#')) continue;
    const colonIdx = raw.indexOf(':');
    if (colonIdx === -1) {
      invalidLines.push({ line: i + 1, text: raw });
      continue;
    }
    const directive = raw.substring(0, colonIdx).trim().toLowerCase();
    if (!knownDirectives.has(directive)) {
      invalidLines.push({ line: i + 1, text: raw });
    }
  }
  const validSyntax = invalidLines.length === 0;
  results.push({
    id: randomUUID(),
    checkId: 'ROBOTS-002',
    checkName: 'robots.txt has valid syntax',
    pillar: 'seo',
    category: 'Technical SEO',
    pageUrl: null,
    status: validSyntax ? 'pass' : 'warning',
    severity: 'warning',
    score: validSyntax ? 100 : Math.max(0, 100 - invalidLines.length * 15),
    message: validSyntax
      ? 'robots.txt syntax is valid.'
      : `Found ${invalidLines.length} line(s) with unrecognised directives or syntax issues.`,
    details: validSyntax ? null : { invalidLines },
    recommendation: validSyntax
      ? null
      : 'Fix the invalid lines in your robots.txt. Each non-comment line should follow the format "Directive: value".',
    wcagCriterion: null,
    element: null,
  });

  // ── ROBOTS-003: file size check (< 500 KB recommended) ────────────────
  const sizeBytes = new TextEncoder().encode(txt).length;
  const maxBytes = 500 * 1024; // 500 KB — Google's limit
  const sizeOk = sizeBytes <= maxBytes;
  results.push({
    id: randomUUID(),
    checkId: 'ROBOTS-003',
    checkName: 'robots.txt file size',
    pillar: 'seo',
    category: 'Technical SEO',
    pageUrl: null,
    status: sizeOk ? 'pass' : 'warning',
    severity: 'warning',
    score: sizeOk ? 100 : 30,
    message: sizeOk
      ? `robots.txt is ${(sizeBytes / 1024).toFixed(1)} KB — well within the 500 KB limit.`
      : `robots.txt is ${(sizeBytes / 1024).toFixed(1)} KB which exceeds the 500 KB limit. Google may ignore rules beyond this limit.`,
    details: { sizeBytes, maxBytes },
    recommendation: sizeOk
      ? null
      : 'Reduce the robots.txt file size to under 500 KB. Consolidate rules or use broader patterns.',
    wcagCriterion: null,
    element: null,
  });

  // ── ROBOTS-004: sitemap referenced in robots.txt ───────────────────────
  const sitemapLines = lines.filter((l) =>
    l.trim().toLowerCase().startsWith('sitemap:'),
  );
  const hasSitemap = sitemapLines.length > 0;
  results.push({
    id: randomUUID(),
    checkId: 'ROBOTS-004',
    checkName: 'Sitemap referenced in robots.txt',
    pillar: 'seo',
    category: 'Technical SEO',
    pageUrl: null,
    status: hasSitemap ? 'pass' : 'warning',
    severity: 'warning',
    score: hasSitemap ? 100 : 40,
    message: hasSitemap
      ? `robots.txt references ${sitemapLines.length} sitemap(s).`
      : 'No Sitemap directive found in robots.txt.',
    details: hasSitemap
      ? { sitemaps: sitemapLines.map((l) => l.split(':').slice(1).join(':').trim()) }
      : null,
    recommendation: hasSitemap
      ? null
      : 'Add a "Sitemap: https://example.com/sitemap.xml" directive to robots.txt so search engines can find your sitemap.',
    wcagCriterion: null,
    element: null,
  });

  // ── Helper: parse disallow/allow rules per user-agent ──────────────────
  interface RobotsRule {
    userAgent: string;
    type: 'disallow' | 'allow';
    path: string;
  }
  const rules: RobotsRule[] = [];
  let currentUA = '*';
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === '' || trimmed.startsWith('#')) continue;
    const colonIdx = trimmed.indexOf(':');
    if (colonIdx === -1) continue;
    const directive = trimmed.substring(0, colonIdx).trim().toLowerCase();
    const value = trimmed.substring(colonIdx + 1).trim();
    if (directive === 'user-agent') {
      currentUA = value.toLowerCase();
    } else if (directive === 'disallow' || directive === 'allow') {
      rules.push({ userAgent: currentUA, type: directive, path: value });
    }
  }

  function isPathBlocked(path: string): boolean {
    // Check rules for * user-agent (simplified — real robots parser is more complex)
    const applicableRules = rules.filter(
      (r) => r.userAgent === '*' || r.userAgent === 'googlebot',
    );
    // Sort by path length descending (longer = more specific wins)
    const sorted = [...applicableRules].sort(
      (a, b) => b.path.length - a.path.length,
    );
    for (const rule of sorted) {
      if (rule.path === '') continue;
      const pattern = rule.path.replace(/\*/g, '.*').replace(/\$$/, '$');
      try {
        const re = new RegExp('^' + pattern);
        if (re.test(path)) {
          return rule.type === 'disallow';
        }
      } catch {
        if (path.startsWith(rule.path)) {
          return rule.type === 'disallow';
        }
      }
    }
    return false;
  }

  // ── ROBOTS-005: critical pages not blocked ─────────────────────────────
  // Check that the homepage and any page returning 200 are not disallowed
  const blockedCriticalPages: string[] = [];
  for (const page of pages) {
    if (page.statusCode !== 200) continue;
    try {
      const parsed = new URL(page.url);
      if (isPathBlocked(parsed.pathname)) {
        blockedCriticalPages.push(page.url);
      }
    } catch {
      // skip unparseable URLs
    }
  }
  const criticalOk = blockedCriticalPages.length === 0;
  results.push({
    id: randomUUID(),
    checkId: 'ROBOTS-005',
    checkName: 'Critical pages not blocked by robots.txt',
    pillar: 'seo',
    category: 'Technical SEO',
    pageUrl: null,
    status: criticalOk ? 'pass' : 'fail',
    severity: 'critical',
    score: criticalOk
      ? 100
      : Math.max(0, 100 - blockedCriticalPages.length * 20),
    message: criticalOk
      ? 'No crawled 200-status pages are blocked by robots.txt.'
      : `${blockedCriticalPages.length} page(s) that return 200 are blocked by robots.txt.`,
    details: criticalOk ? null : { blockedPages: blockedCriticalPages.slice(0, 50) },
    recommendation: criticalOk
      ? null
      : 'Review your robots.txt Disallow rules. These pages return 200 but are blocked from crawlers, preventing indexing.',
    wcagCriterion: null,
    element: null,
  });

  // ── ROBOTS-006: CSS/JS not blocked ─────────────────────────────────────
  const commonResourcePaths = ['/css', '/js', '/assets', '/static', '/wp-content', '/wp-includes'];
  const blockedResources: string[] = [];
  for (const rp of commonResourcePaths) {
    if (isPathBlocked(rp + '/')) {
      blockedResources.push(rp + '/');
    }
  }
  // Also check for broad patterns that would block .css/.js
  const broadBlockRules = rules.filter(
    (r) =>
      r.type === 'disallow' &&
      (r.path.includes('.css') || r.path.includes('.js')),
  );
  for (const rule of broadBlockRules) {
    blockedResources.push(rule.path);
  }
  const resourcesOk = blockedResources.length === 0;
  results.push({
    id: randomUUID(),
    checkId: 'ROBOTS-006',
    checkName: 'CSS and JS resources not blocked',
    pillar: 'seo',
    category: 'Technical SEO',
    pageUrl: null,
    status: resourcesOk ? 'pass' : 'fail',
    severity: 'high',
    score: resourcesOk ? 100 : 20,
    message: resourcesOk
      ? 'CSS and JS resources are accessible to crawlers.'
      : `${blockedResources.length} resource path(s) appear to be blocked, which may prevent search engines from rendering pages.`,
    details: resourcesOk ? null : { blockedResources },
    recommendation: resourcesOk
      ? null
      : 'Allow search engines to access CSS and JavaScript files so they can render and index your pages correctly.',
    wcagCriterion: null,
    element: null,
  });

  return results;
}
