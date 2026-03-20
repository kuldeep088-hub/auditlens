/**
 * Freshness audit for GEO.
 * Checks GEO-FRESH-001 through GEO-FRESH-003 to evaluate content
 * freshness signals that AI engines use to determine recency and
 * relevance of content for citation.
 */

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
    category: 'Technical GEO',
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

/** Try to parse a date string. Returns Date or null. */
function parseDate(dateStr: string): Date | null {
  if (!dateStr || dateStr.trim().length === 0) return null;
  const parsed = new Date(dateStr.trim());
  return isNaN(parsed.getTime()) ? null : parsed;
}

/** Recursively search an object for a key and return its string value. */
function findDateInObject(obj: unknown, key: string): string | null {
  if (obj === null || obj === undefined || typeof obj !== 'object') return null;
  if (Array.isArray(obj)) {
    for (const item of obj) {
      const result = findDateInObject(item, key);
      if (result) return result;
    }
    return null;
  }
  const record = obj as Record<string, unknown>;
  if (key in record && typeof record[key] === 'string') return record[key] as string;
  for (const value of Object.values(record)) {
    if (typeof value === 'object') {
      const result = findDateInObject(value, key);
      if (result) return result;
    }
  }
  return null;
}

/** Extract dateModified from schema markup. Falls back to datePublished. */
function extractDateModifiedFromSchema(schemaMarkup: unknown[]): Date | null {
  for (const schema of schemaMarkup) {
    const dateStr = findDateInObject(schema, 'dateModified');
    if (dateStr) { const parsed = parseDate(dateStr); if (parsed) return parsed; }
    const pubDateStr = findDateInObject(schema, 'datePublished');
    if (pubDateStr) { const parsed = parseDate(pubDateStr); if (parsed) return parsed; }
  }
  return null;
}

type FreshnessCategory = 'fresh' | 'aging' | 'stale' | 'outdated';

function classifyFreshness(date: Date, now: Date): FreshnessCategory {
  const diffMonths = (now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24 * 30.44);
  if (diffMonths <= 3) return 'fresh';
  if (diffMonths <= 6) return 'aging';
  if (diffMonths <= 12) return 'stale';
  return 'outdated';
}

/** GEO-FRESH-001: Last-Modified headers. % of pages with Last-Modified. */
function checkLastModifiedHeaders(pages: PageData[]): CheckResult {
  if (pages.length === 0) {
    return makeResult('GEO-FRESH-001', 'Last-Modified Headers', null, 'info', 'info', 100,
      'No pages to evaluate.', { pageCount: 0 }, null);
  }

  let pagesWithHeader = 0;
  const pagesAnalyzed: { url: string; hasLastModified: boolean; value: string | null }[] = [];

  for (const page of pages) {
    const lastModified = page.responseHeaders['last-modified'] ||
      page.responseHeaders['Last-Modified'] || page.responseHeaders['LAST-MODIFIED'];
    const hasHeader = !!lastModified;
    if (hasHeader) pagesWithHeader++;
    pagesAnalyzed.push({ url: page.url, hasLastModified: hasHeader, value: lastModified || null });
  }

  const score = Math.round((pagesWithHeader / pages.length) * 100);
  const status: CheckResult['status'] = score >= 70 ? 'pass' : score >= 30 ? 'warning' : 'info';

  return makeResult('GEO-FRESH-001', 'Last-Modified Headers', null, status, 'info', score,
    `${pagesWithHeader} of ${pages.length} page(s) (${score}%) include a Last-Modified response header.`,
    { pagesWithHeader, totalPages: pages.length, percentage: score, samples: pagesAnalyzed.slice(0, 10) },
    score < 70
      ? 'Configure your server to send Last-Modified headers. AI engines use these to assess content freshness and prioritize recently updated content.'
      : null);
}

/** GEO-FRESH-002: dateModified in schema. % of pages with dateModified. */
function checkDateModifiedInSchema(pages: PageData[]): CheckResult {
  if (pages.length === 0) {
    return makeResult('GEO-FRESH-002', 'dateModified in Schema', null, 'info', 'warning', 100,
      'No pages to evaluate.', { pageCount: 0 }, null);
  }

  let pagesWithDateModified = 0;
  const pagesAnalyzed: { url: string; hasDateModified: boolean; dateValue: string | null }[] = [];

  for (const page of pages) {
    if (page.schemaMarkup.length === 0) {
      pagesAnalyzed.push({ url: page.url, hasDateModified: false, dateValue: null });
      continue;
    }
    const dateStr = findDateInObject(page.schemaMarkup, 'dateModified');
    if (dateStr !== null) pagesWithDateModified++;
    pagesAnalyzed.push({ url: page.url, hasDateModified: dateStr !== null, dateValue: dateStr });
  }

  const score = Math.round((pagesWithDateModified / pages.length) * 100);
  const status: CheckResult['status'] = score >= 70 ? 'pass' : score >= 30 ? 'warning' : 'fail';

  return makeResult('GEO-FRESH-002', 'dateModified in Schema', null, status, 'warning', score,
    `${pagesWithDateModified} of ${pages.length} page(s) (${score}%) include dateModified in structured data.`,
    { pagesWithDateModified, totalPages: pages.length, percentage: score, samples: pagesAnalyzed.slice(0, 10) },
    score < 70
      ? 'Add dateModified to your structured data (JSON-LD schema). AI engines rely on this to determine when content was last updated and prioritize fresh content.'
      : null);
}

/** GEO-FRESH-003: Content freshness distribution. Weighted score from dates. */
function checkFreshnessDistribution(pages: PageData[]): CheckResult {
  if (pages.length === 0) {
    return makeResult('GEO-FRESH-003', 'Content Freshness Distribution', null, 'info', 'warning', 100,
      'No pages to evaluate.', { pageCount: 0 }, null);
  }

  const now = new Date();
  const distribution: Record<FreshnessCategory, number> = { fresh: 0, aging: 0, stale: 0, outdated: 0 };
  let pagesWithDates = 0;
  const pagesAnalyzed: { url: string; date: string | null; category: FreshnessCategory | null }[] = [];

  for (const page of pages) {
    let date: Date | null = extractDateModifiedFromSchema(page.schemaMarkup);
    if (!date) {
      const lm = page.responseHeaders['last-modified'] ||
        page.responseHeaders['Last-Modified'] || page.responseHeaders['LAST-MODIFIED'];
      if (lm) date = parseDate(lm);
    }

    if (date) {
      pagesWithDates++;
      const category = classifyFreshness(date, now);
      distribution[category]++;
      pagesAnalyzed.push({ url: page.url, date: date.toISOString(), category });
    } else {
      pagesAnalyzed.push({ url: page.url, date: null, category: null });
    }
  }

  if (pagesWithDates === 0) {
    return makeResult('GEO-FRESH-003', 'Content Freshness Distribution', null, 'info', 'warning', 30,
      'No date information found in schema or headers to assess content freshness.',
      { pagesWithDates: 0, totalPages: pages.length, distribution },
      'Add dateModified to structured data and Last-Modified headers to enable freshness analysis. Without date signals, AI engines may deprioritize your content.');
  }

  const weightedSum = distribution.fresh * 100 + distribution.aging * 70 + distribution.stale * 40 + distribution.outdated * 10;
  const score = Math.round(weightedSum / pagesWithDates);
  const status: CheckResult['status'] = score >= 70 ? 'pass' : score >= 40 ? 'warning' : 'fail';
  const freshPercent = Math.round((distribution.fresh / pagesWithDates) * 100);
  const outdatedPercent = Math.round((distribution.outdated / pagesWithDates) * 100);

  return makeResult('GEO-FRESH-003', 'Content Freshness Distribution', null, status, 'warning', score,
    `Freshness score: ${score}/100. ${distribution.fresh} fresh (<3mo), ${distribution.aging} aging (3-6mo), ${distribution.stale} stale (6-12mo), ${distribution.outdated} outdated (>1yr) out of ${pagesWithDates} dated page(s).`,
    {
      pagesWithDates, totalPages: pages.length, pagesWithoutDates: pages.length - pagesWithDates,
      distribution, freshPercent, outdatedPercent, weightedScore: score, samples: pagesAnalyzed.slice(0, 15),
    },
    score < 70
      ? `${distribution.stale + distribution.outdated} page(s) have stale or outdated content. Review and update these pages with current information. AI engines strongly favor recently updated content for citations.`
      : null);
}

/** Run Freshness audit across all pages. */
export function runFreshnessAudit(pages: PageData[]): CheckResult[] {
  const results: CheckResult[] = [];
  results.push(checkLastModifiedHeaders(pages));
  results.push(checkDateModifiedInSchema(pages));
  results.push(checkFreshnessDistribution(pages));
  return results;
}
