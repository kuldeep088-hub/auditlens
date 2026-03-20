/**
 * Authority audit for GEO.
 * Checks GEO-AUTH-001 through GEO-AUTH-004 to evaluate E-E-A-T signals
 * that AI engines use to determine content trustworthiness and citability.
 */

import * as cheerio from 'cheerio';
import crypto from 'node:crypto';
import type { CheckResult, PageData } from '@audit/types';

function makeResult(
  checkId: string,
  checkName: string,
  pageUrl: string | null,
  status: CheckResult['status'],
  severity: CheckResult['severity'],
  score: number,
  message: string,
  details: Record<string, unknown> | null,
  recommendation: string | null,
): CheckResult {
  return {
    id: crypto.randomUUID(),
    checkId,
    checkName,
    pillar: 'geo',
    category: 'Content Structure',
    pageUrl,
    status,
    severity,
    score: Math.max(0, Math.min(100, score)),
    message,
    details,
    recommendation,
    wcagCriterion: null,
    element: null,
  };
}

function isContentPage(page: PageData): boolean {
  return page.wordCount >= 50 && page.statusCode >= 200 && page.statusCode < 400;
}

/**
 * GEO-AUTH-001: Author bylines.
 * Search rawHtml for author indicators: .author, [rel="author"],
 * [itemprop="author"], Person schema in schemaMarkup, and text patterns.
 */
function checkAuthorBylines(pages: PageData[]): CheckResult {
  const contentPages = pages.filter(isContentPage);

  if (contentPages.length === 0) {
    return makeResult('GEO-AUTH-001', 'Author Bylines', null, 'info', 'warning', 100,
      'No content pages found to evaluate.', { contentPageCount: 0 }, null);
  }

  let pagesWithAuthor = 0;
  const pagesAnalyzed: { url: string; hasAuthor: boolean; authorSignals: string[] }[] = [];

  for (const page of contentPages) {
    const $ = cheerio.load(page.rawHtml);
    const signals: string[] = [];

    if ($('.author, [class*="author"], [class*="byline"]').length > 0) signals.push('author-class');
    if ($('[rel="author"]').length > 0) signals.push('rel-author');
    if ($('[itemprop="author"]').length > 0) signals.push('itemprop-author');

    for (const schema of page.schemaMarkup) {
      const schemaStr = JSON.stringify(schema).toLowerCase();
      if (schemaStr.includes('"@type"') && schemaStr.includes('"person"')) {
        signals.push('person-schema');
        break;
      }
      if (schemaStr.includes('"author"')) {
        signals.push('author-in-schema');
        break;
      }
    }

    const bylinePattern = /\b(?:by|written by|authored by|posted by)\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*/;
    if (bylinePattern.test(page.contentText)) signals.push('byline-text-pattern');

    if (signals.length > 0) pagesWithAuthor++;
    pagesAnalyzed.push({ url: page.url, hasAuthor: signals.length > 0, authorSignals: signals });
  }

  const score = Math.round((pagesWithAuthor / contentPages.length) * 100);
  const status: CheckResult['status'] = score >= 70 ? 'pass' : score >= 40 ? 'warning' : 'fail';

  return makeResult('GEO-AUTH-001', 'Author Bylines', null, status, 'warning', score,
    `${pagesWithAuthor} of ${contentPages.length} content page(s) include author attribution.`,
    { pagesWithAuthor, totalContentPages: contentPages.length, percentage: score, samples: pagesAnalyzed.slice(0, 10) },
    'Add visible author bylines to content pages using structured markup (itemprop="author", Person schema) and visible text. AI engines prioritize content with clear authorship for E-E-A-T.');
}

/**
 * GEO-AUTH-002: Author pages.
 * Check if author elements link to internal pages (href contains "/author/" or "/team/").
 */
function checkAuthorPages(pages: PageData[]): CheckResult {
  const contentPages = pages.filter(isContentPage);

  if (contentPages.length === 0) {
    return makeResult('GEO-AUTH-002', 'Author Pages', null, 'info', 'info', 100,
      'No content pages found to evaluate.', { contentPageCount: 0 }, null);
  }

  let authorsFound = 0;
  let authorsWithPages = 0;
  const pagesAnalyzed: { url: string; authorLinksFound: string[] }[] = [];

  for (const page of contentPages) {
    const $ = cheerio.load(page.rawHtml);
    const authorElements = $(
      '.author a, [class*="author"] a, [class*="byline"] a, [rel="author"], [itemprop="author"] a, a[rel="author"]'
    );

    const authorLinks: string[] = [];
    authorElements.each((_, el) => {
      const href = $(el).attr('href') || '';
      if (href) authorLinks.push(href);
    });

    if (authorLinks.length > 0) {
      authorsFound++;
      const hasAuthorPage = authorLinks.some((href) =>
        href.includes('/author/') || href.includes('/authors/') || href.includes('/team/') ||
        href.includes('/about/') || href.includes('/people/') || href.includes('/contributor/') ||
        href.includes('/profile/')
      );
      if (hasAuthorPage) authorsWithPages++;
    }
    pagesAnalyzed.push({ url: page.url, authorLinksFound: authorLinks.slice(0, 5) });
  }

  if (authorsFound === 0) {
    return makeResult('GEO-AUTH-002', 'Author Pages', null, 'info', 'info', 50,
      'No author links detected across content pages.',
      { authorsFound: 0, authorsWithPages: 0, totalContentPages: contentPages.length, samples: pagesAnalyzed.slice(0, 10) },
      'Link author bylines to dedicated author profile pages that showcase expertise and credentials.');
  }

  const score = Math.round((authorsWithPages / authorsFound) * 100);
  const status: CheckResult['status'] = score >= 70 ? 'pass' : score >= 40 ? 'warning' : 'info';

  return makeResult('GEO-AUTH-002', 'Author Pages', null, status, 'info', score,
    `${authorsWithPages} of ${authorsFound} author link(s) point to dedicated author/team pages.`,
    { authorsFound, authorsWithPages, percentage: score, totalContentPages: contentPages.length, samples: pagesAnalyzed.slice(0, 10) },
    'Link author names to dedicated profile pages (e.g., /author/john-doe/) that include bio, credentials, and other published work. This strengthens E-E-A-T signals.');
}

/**
 * GEO-AUTH-003: About page quality.
 * Check if any crawled page URL contains "/about". If found, check word count and contact info.
 */
function checkAboutPageQuality(pages: PageData[]): CheckResult {
  const aboutPages = pages.filter((p) => {
    try {
      const url = new URL(p.url);
      return url.pathname.includes('/about') || url.pathname.includes('/about-us') ||
        url.pathname.includes('/who-we-are') || url.pathname.includes('/our-story');
    } catch { return false; }
  });

  if (aboutPages.length === 0) {
    return makeResult('GEO-AUTH-003', 'About Page Quality', null, 'fail', 'warning', 20,
      'No about page found in the crawled pages.', { aboutPageFound: false },
      'Create a comprehensive "About" page that describes your organization, mission, team credentials, and contact information. This is a key trust signal for AI engines.');
  }

  const aboutPage = aboutPages[0];
  const signals: string[] = [];

  const hasSubstantialContent = aboutPage.wordCount > 200;
  if (hasSubstantialContent) signals.push('substantial-content');

  const emailPattern = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;
  if (emailPattern.test(aboutPage.contentText) || emailPattern.test(aboutPage.rawHtml)) signals.push('email-present');

  const phonePattern = /(?:\+?1[-.\s]?)?(?:\(?\d{3}\)?[-.\s]?)?\d{3}[-.\s]?\d{4}/;
  if (phonePattern.test(aboutPage.contentText) || phonePattern.test(aboutPage.rawHtml)) signals.push('phone-present');

  const addressPattern = /\b(?:\d+\s+[A-Z][a-z]+\s+(?:St|Street|Ave|Avenue|Blvd|Boulevard|Rd|Road|Dr|Drive|Ln|Lane|Way|Ct|Court))\b/;
  if (addressPattern.test(aboutPage.contentText)) signals.push('address-present');

  let score = 33;
  if (hasSubstantialContent) score += 34;
  if (signals.includes('email-present') || signals.includes('phone-present')) score += 33;
  score = Math.min(100, score);

  const status: CheckResult['status'] = score >= 70 ? 'pass' : score >= 40 ? 'warning' : 'fail';

  return makeResult('GEO-AUTH-003', 'About Page Quality', aboutPage.url, status, 'warning', score,
    `About page found at ${aboutPage.url} with ${aboutPage.wordCount} words and ${signals.length} trust signal(s).`,
    { aboutPageUrl: aboutPage.url, wordCount: aboutPage.wordCount, signals, hasSubstantialContent },
    score < 100 ? 'Enhance your about page with detailed company information (200+ words), contact details (email, phone), and team credentials. AI engines use about pages to verify organizational authority.' : null);
}

/**
 * GEO-AUTH-004: Trust signals.
 * Check across all pages for: /contact page, /privacy page, /terms page.
 * Score = 33 per signal found.
 */
function checkTrustSignals(pages: PageData[]): CheckResult {
  const pageUrls = pages.map((p) => {
    try { return new URL(p.url).pathname.toLowerCase(); }
    catch { return p.url.toLowerCase(); }
  });

  const trustSignals: { signal: string; found: boolean; matchedUrl: string | null }[] = [];

  const contactPage = pageUrls.find((path) =>
    path.includes('/contact') || path.includes('/contact-us') || path.includes('/get-in-touch'));
  trustSignals.push({ signal: 'Contact page', found: !!contactPage, matchedUrl: contactPage ?? null });

  const privacyPage = pageUrls.find((path) =>
    path.includes('/privacy') || path.includes('/privacy-policy'));
  trustSignals.push({ signal: 'Privacy policy', found: !!privacyPage, matchedUrl: privacyPage ?? null });

  const termsPage = pageUrls.find((path) =>
    path.includes('/terms') || path.includes('/terms-of-service') ||
    path.includes('/terms-and-conditions') || path.includes('/tos'));
  trustSignals.push({ signal: 'Terms of service', found: !!termsPage, matchedUrl: termsPage ?? null });

  const signalsFound = trustSignals.filter((s) => s.found).length;
  const score = signalsFound * 33 + (signalsFound === 3 ? 1 : 0);
  const status: CheckResult['status'] = score >= 66 ? 'pass' : score >= 33 ? 'warning' : 'info';
  const missingSignals = trustSignals.filter((s) => !s.found).map((s) => s.signal);

  return makeResult('GEO-AUTH-004', 'Trust Signals', null, status, 'info', score,
    `${signalsFound} of 3 trust signal page(s) found: ${trustSignals.filter((s) => s.found).map((s) => s.signal).join(', ') || 'none'}.`,
    { signalsFound, trustSignals, missingSignals },
    missingSignals.length > 0
      ? `Add the following trust signal pages: ${missingSignals.join(', ')}. These pages demonstrate legitimacy and are factored into AI engine trust assessments.`
      : null);
}

/**
 * Run Authority audit across all pages.
 */
export function runAuthorityAudit(pages: PageData[]): CheckResult[] {
  const results: CheckResult[] = [];
  results.push(checkAuthorBylines(pages));
  results.push(checkAuthorPages(pages));
  results.push(checkAboutPageQuality(pages));
  results.push(checkTrustSignals(pages));
  return results;
}
