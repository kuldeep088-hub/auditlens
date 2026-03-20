/**
 * Citability audit for GEO.
 * Checks GEO-CITE-001 through GEO-CITE-003 to evaluate how citable
 * content is for AI engines -- presence of sourced statistics, external
 * citations, and content specificity.
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
 * GEO-CITE-001: Statistics with sources.
 * Regex for numerical patterns in contentText. Check if within 200 chars
 * of an external link. Score = % of stats with a nearby source.
 */
function checkStatisticsWithSources(pages: PageData[]): CheckResult {
  const contentPages = pages.filter(isContentPage);

  if (contentPages.length === 0) {
    return makeResult(
      'GEO-CITE-001', 'Statistics with Sources', null, 'info', 'warning', 100,
      'No content pages found to evaluate.', { contentPageCount: 0 }, null,
    );
  }

  const statPatterns = [
    /\d+(?:\.\d+)?%/g,
    /\$\d[\d,.]*(?:\s*(?:million|billion|trillion))?/gi,
    /\d[\d,.]*\s*(?:million|billion|trillion)/gi,
    /\d{1,3}(?:,\d{3})+/g,
  ];

  let totalStats = 0;
  let statsWithSource = 0;
  const pagesAnalyzed: { url: string; statsFound: number; statsSourced: number }[] = [];

  for (const page of contentPages) {
    const text = page.contentText;
    let pageStats = 0;
    let pageSourced = 0;

    const linkPositions: number[] = [];
    for (const link of page.externalLinks) {
      if (link.isNav) continue;
      const anchorText = link.anchorText.trim();
      if (anchorText.length > 0) {
        let idx = text.indexOf(anchorText);
        while (idx !== -1) {
          linkPositions.push(idx);
          idx = text.indexOf(anchorText, idx + 1);
        }
      }
    }

    for (const pattern of statPatterns) {
      pattern.lastIndex = 0;
      let match;
      while ((match = pattern.exec(text)) !== null) {
        pageStats++;
        const statPos = match.index;
        const hasNearbySource = linkPositions.some(
          (linkPos) => Math.abs(linkPos - statPos) <= 200,
        );
        if (hasNearbySource) pageSourced++;
      }
    }

    totalStats += pageStats;
    statsWithSource += pageSourced;
    pagesAnalyzed.push({ url: page.url, statsFound: pageStats, statsSourced: pageSourced });
  }

  if (totalStats === 0) {
    return makeResult(
      'GEO-CITE-001', 'Statistics with Sources', null, 'info', 'warning', 50,
      'No statistical claims detected across content pages.',
      { totalStats: 0, statsWithSource: 0, totalContentPages: contentPages.length, samples: pagesAnalyzed.slice(0, 10) },
      'Include specific data points and statistics in your content, and link them to authoritative sources. AI engines prioritize content with verifiable claims.',
    );
  }

  const score = Math.round((statsWithSource / totalStats) * 100);
  const status: CheckResult['status'] = score >= 60 ? 'pass' : score >= 30 ? 'warning' : 'fail';

  return makeResult(
    'GEO-CITE-001', 'Statistics with Sources', null, status, 'warning', score,
    `${statsWithSource} of ${totalStats} statistical claim(s) have a nearby external source link.`,
    { totalStats, statsWithSource, percentage: score, totalContentPages: contentPages.length, samples: pagesAnalyzed.slice(0, 10) },
    'Place external source links near statistical claims (within the same sentence or paragraph). AI engines give higher credibility to sourced data.',
  );
}

/**
 * GEO-CITE-002: External source citations.
 * Count external links in content body (not nav). Score = % of content
 * pages with at least one contextual external link.
 */
function checkExternalSourceCitations(pages: PageData[]): CheckResult {
  const contentPages = pages.filter(isContentPage);

  if (contentPages.length === 0) {
    return makeResult(
      'GEO-CITE-002', 'External Source Citations', null, 'info', 'info', 100,
      'No content pages found to evaluate.', { contentPageCount: 0 }, null,
    );
  }

  let pagesWithExternalLinks = 0;
  const pagesAnalyzed: { url: string; contextualExternalLinks: number }[] = [];

  for (const page of contentPages) {
    const contextualLinks = page.externalLinks.filter((l) => !l.isNav);
    if (contextualLinks.length >= 1) pagesWithExternalLinks++;
    pagesAnalyzed.push({ url: page.url, contextualExternalLinks: contextualLinks.length });
  }

  const score = Math.round((pagesWithExternalLinks / contentPages.length) * 100);
  const status: CheckResult['status'] = score >= 70 ? 'pass' : score >= 40 ? 'warning' : 'info';

  return makeResult(
    'GEO-CITE-002', 'External Source Citations', null, status, 'info', score,
    `${pagesWithExternalLinks} of ${contentPages.length} content page(s) include at least one contextual external link.`,
    { pagesWithExternalLinks, totalContentPages: contentPages.length, percentage: score, samples: pagesAnalyzed.slice(0, 10) },
    'Include contextual external links to authoritative sources within your content body. This signals trustworthiness to AI engines.',
  );
}

/**
 * GEO-CITE-003: Content specificity.
 * Heuristic -- check for specific, quotable sentences containing numbers,
 * proper nouns (capitalized words mid-sentence), or date patterns.
 */
function checkContentSpecificity(pages: PageData[]): CheckResult {
  const contentPages = pages.filter(isContentPage);

  if (contentPages.length === 0) {
    return makeResult(
      'GEO-CITE-003', 'Content Specificity', null, 'info', 'info', 100,
      'No content pages found to evaluate.', { contentPageCount: 0 }, null,
    );
  }

  const numberPattern = /\d+/;
  const datePattern = /\b(?:(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s*\d{2,4}|\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}|\b20[0-2]\d\b)/i;
  const properNounPattern = /\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)+\b/;

  let totalSentences = 0;
  let specificSentences = 0;
  const pagesAnalyzed: { url: string; totalSentences: number; specificSentences: number; density: number }[] = [];

  for (const page of contentPages) {
    const sentences = page.contentText.split(/[.!?]+/).map((s) => s.trim()).filter((s) => s.length > 15);
    let pageSpecific = 0;

    for (const sentence of sentences) {
      if (numberPattern.test(sentence) || datePattern.test(sentence) || properNounPattern.test(sentence)) {
        pageSpecific++;
      }
    }

    totalSentences += sentences.length;
    specificSentences += pageSpecific;
    const density = sentences.length > 0 ? Math.round((pageSpecific / sentences.length) * 100) : 0;
    pagesAnalyzed.push({ url: page.url, totalSentences: sentences.length, specificSentences: pageSpecific, density });
  }

  const overallDensity = totalSentences > 0 ? Math.round((specificSentences / totalSentences) * 100) : 0;
  const score = Math.min(100, overallDensity);
  const status: CheckResult['status'] = score >= 50 ? 'pass' : score >= 25 ? 'warning' : 'info';

  return makeResult(
    'GEO-CITE-003', 'Content Specificity', null, status, 'info', score,
    `${specificSentences} of ${totalSentences} sentence(s) (${overallDensity}%) contain specific, quotable claims (numbers, proper nouns, or dates).`,
    { totalSentences, specificSentences, overallDensity, totalContentPages: contentPages.length, samples: pagesAnalyzed.slice(0, 10) },
    'Include specific data points, proper nouns, and dates in your content. AI engines prefer citing precise, verifiable statements over vague generalizations.',
  );
}

/**
 * Run Citability audit across all pages.
 */
export function runCitabilityAudit(pages: PageData[]): CheckResult[] {
  const results: CheckResult[] = [];
  results.push(checkStatisticsWithSources(pages));
  results.push(checkExternalSourceCitations(pages));
  results.push(checkContentSpecificity(pages));
  return results;
}
