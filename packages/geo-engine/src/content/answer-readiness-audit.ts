/**
 * Answer Readiness audit for GEO.
 * Checks GEO-ANSWER-001 through GEO-ANSWER-004 using heuristic analysis
 * to evaluate how well content is structured for AI engine citation.
 * No Claude API dependency -- pure static analysis for v1.
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

/**
 * Determine if a page is a "content page" (has enough text to be meaningful).
 * Filters out thin pages, error pages, etc.
 */
function isContentPage(page: PageData): boolean {
  return page.wordCount >= 50 && page.statusCode >= 200 && page.statusCode < 400;
}

/**
 * GEO-ANSWER-001: Direct answer in opening.
 * Check if the first 150 words of contentText contain a direct statement
 * that addresses the H1 topic words.
 */
function checkDirectAnswerInOpening(pages: PageData[]): CheckResult {
  const contentPages = pages.filter(isContentPage);

  if (contentPages.length === 0) {
    return makeResult(
      'GEO-ANSWER-001',
      'Direct Answer in Opening',
      null,
      'info',
      'info',
      100,
      'No content pages found to evaluate.',
      { contentPageCount: 0 },
      null,
    );
  }

  let pagesWithDirectAnswer = 0;
  const pagesAnalyzed: { url: string; hasDirectAnswer: boolean; reason: string }[] = [];

  for (const page of contentPages) {
    const h1 = page.headings.find((h) => h.level === 1);
    if (!h1) {
      pagesAnalyzed.push({ url: page.url, hasDirectAnswer: false, reason: 'No H1 heading found.' });
      continue;
    }

    // Extract meaningful topic words from H1 (skip stop words)
    const stopWords = new Set([
      'a', 'an', 'the', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
      'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
      'should', 'may', 'might', 'can', 'shall', 'to', 'of', 'in', 'for',
      'on', 'with', 'at', 'by', 'from', 'and', 'or', 'but', 'not', 'so',
      'if', 'how', 'what', 'why', 'when', 'where', 'who', 'which', 'that',
      'this', 'your', 'you', 'our', 'my', 'it', 'its',
    ]);

    const topicWords = h1.text
      .toLowerCase()
      .replace(/[^\w\s]/g, '')
      .split(/\s+/)
      .filter((w) => w.length > 2 && !stopWords.has(w));

    if (topicWords.length === 0) {
      pagesAnalyzed.push({ url: page.url, hasDirectAnswer: false, reason: 'H1 contains no meaningful topic words.' });
      continue;
    }

    // Get the first 150 words of content
    const words = page.contentText.split(/\s+/);
    const openingText = words.slice(0, 150).join(' ').toLowerCase();

    // Check if the first sentence (or early text) contains topic words
    const topicWordsFound = topicWords.filter((w) => openingText.includes(w));
    const topicCoverage = topicWordsFound.length / topicWords.length;

    // Heuristic: at least 50% of topic words appear in the opening
    const hasDirectAnswer = topicCoverage >= 0.5;

    if (hasDirectAnswer) {
      pagesWithDirectAnswer++;
    }

    pagesAnalyzed.push({
      url: page.url,
      hasDirectAnswer,
      reason: hasDirectAnswer
        ? `Opening contains ${topicWordsFound.length}/${topicWords.length} topic words.`
        : `Opening contains only ${topicWordsFound.length}/${topicWords.length} topic words.`,
    });
  }

  const score = Math.round((pagesWithDirectAnswer / contentPages.length) * 100);
  const status: CheckResult['status'] = score >= 70 ? 'pass' : score >= 40 ? 'warning' : 'info';

  return makeResult(
    'GEO-ANSWER-001',
    'Direct Answer in Opening',
    null,
    status,
    'info',
    score,
    `${pagesWithDirectAnswer} of ${contentPages.length} content page(s) open with a direct answer addressing the H1 topic.`,
    {
      pagesWithDirectAnswer,
      totalContentPages: contentPages.length,
      percentage: score,
      samples: pagesAnalyzed.slice(0, 10),
    },
    'Begin content pages with a direct, concise answer to the topic indicated by the H1. AI engines prefer content that provides immediate answers in the opening paragraph.',
  );
}

/**
 * GEO-ANSWER-002: Summary/takeaway sections.
 * Check headings for keywords indicating summary or takeaway sections.
 */
function checkSummarySections(pages: PageData[]): CheckResult {
  const contentPages = pages.filter(isContentPage);

  if (contentPages.length === 0) {
    return makeResult(
      'GEO-ANSWER-002',
      'Summary/Takeaway Sections',
      null,
      'info',
      'info',
      100,
      'No content pages found to evaluate.',
      { contentPageCount: 0 },
      null,
    );
  }

  const summaryKeywords = [
    'summary', 'key takeaways', 'key takeaway', 'takeaways', 'takeaway',
    'tl;dr', 'tldr', 'conclusion', 'conclusions', 'overview',
    'highlights', 'key points', 'key findings', 'in brief', 'bottom line',
    'what you need to know', 'quick summary',
  ];

  let pagesWithSummary = 0;
  const pagesAnalyzed: { url: string; hasSummary: boolean; matchedHeadings: string[] }[] = [];

  for (const page of contentPages) {
    const matchedHeadings: string[] = [];

    for (const heading of page.headings) {
      const headingLower = heading.text.toLowerCase().trim();
      for (const keyword of summaryKeywords) {
        if (headingLower.includes(keyword)) {
          matchedHeadings.push(heading.text);
          break;
        }
      }
    }

    const hasSummary = matchedHeadings.length > 0;
    if (hasSummary) {
      pagesWithSummary++;
    }

    pagesAnalyzed.push({
      url: page.url,
      hasSummary,
      matchedHeadings,
    });
  }

  const score = Math.round((pagesWithSummary / contentPages.length) * 100);
  const status: CheckResult['status'] = score >= 60 ? 'pass' : score >= 30 ? 'warning' : 'info';

  return makeResult(
    'GEO-ANSWER-002',
    'Summary/Takeaway Sections',
    null,
    status,
    'info',
    score,
    `${pagesWithSummary} of ${contentPages.length} content page(s) include summary or takeaway sections.`,
    {
      pagesWithSummary,
      totalContentPages: contentPages.length,
      percentage: score,
      samples: pagesAnalyzed.slice(0, 10),
    },
    'Add "Key Takeaways", "Summary", or "TL;DR" sections to content pages. AI engines often extract these concise sections for citation.',
  );
}

/**
 * GEO-ANSWER-003: Q&A format headings.
 * Count headings containing "?" or starting with interrogative words.
 */
function checkQaFormatHeadings(pages: PageData[]): CheckResult {
  const contentPages = pages.filter(isContentPage);

  if (contentPages.length === 0) {
    return makeResult(
      'GEO-ANSWER-003',
      'Q&A Format Headings',
      null,
      'info',
      'info',
      100,
      'No content pages found to evaluate.',
      { contentPageCount: 0 },
      null,
    );
  }

  const interrogativePattern = /^(how|what|why|when|where|who|can|is|does|should|do|are|will|would|could)\b/i;

  let pagesWithQaFormat = 0;
  const pagesAnalyzed: { url: string; hasQaFormat: boolean; qaHeadingCount: number; totalHeadings: number }[] = [];

  for (const page of contentPages) {
    let qaHeadingCount = 0;

    for (const heading of page.headings) {
      const text = heading.text.trim();
      if (text.includes('?') || interrogativePattern.test(text)) {
        qaHeadingCount++;
      }
    }

    const hasQaFormat = qaHeadingCount > 0;
    if (hasQaFormat) {
      pagesWithQaFormat++;
    }

    pagesAnalyzed.push({
      url: page.url,
      hasQaFormat,
      qaHeadingCount,
      totalHeadings: page.headings.length,
    });
  }

  const score = Math.round((pagesWithQaFormat / contentPages.length) * 100);
  const status: CheckResult['status'] = score >= 60 ? 'pass' : score >= 30 ? 'warning' : 'info';

  return makeResult(
    'GEO-ANSWER-003',
    'Q&A Format Headings',
    null,
    status,
    'info',
    score,
    `${pagesWithQaFormat} of ${contentPages.length} content page(s) use Q&A format headings.`,
    {
      pagesWithQaFormat,
      totalContentPages: contentPages.length,
      percentage: score,
      samples: pagesAnalyzed.slice(0, 10),
    },
    'Structure content with question-based headings (e.g., "What is...?", "How do you...?"). AI engines frequently match user queries to question-formatted headings.',
  );
}

/**
 * GEO-ANSWER-004: Structured content elements.
 * Parse rawHtml for ol, ul, table, dl, pre/code elements.
 * Pages with 3+ different types score high.
 */
function checkStructuredContentElements(pages: PageData[]): CheckResult {
  const contentPages = pages.filter(isContentPage);

  if (contentPages.length === 0) {
    return makeResult(
      'GEO-ANSWER-004',
      'Structured Content Elements',
      null,
      'info',
      'warning',
      100,
      'No content pages found to evaluate.',
      { contentPageCount: 0 },
      null,
    );
  }

  const pagesAnalyzed: { url: string; elementTypes: string[]; typeCount: number }[] = [];
  let totalWeightedScore = 0;

  for (const page of contentPages) {
    const $ = cheerio.load(page.rawHtml);

    const elementTypes: string[] = [];

    if ($('ol').length > 0) elementTypes.push('ol');
    if ($('ul').length > 0) elementTypes.push('ul');
    if ($('table').length > 0) elementTypes.push('table');
    if ($('dl').length > 0) elementTypes.push('dl');
    if ($('pre, code').length > 0) elementTypes.push('pre/code');

    const typeCount = elementTypes.length;

    // Scoring: 0 types = 0, 1 type = 30, 2 types = 60, 3+ types = 100
    let pageScore: number;
    if (typeCount >= 3) {
      pageScore = 100;
    } else if (typeCount === 2) {
      pageScore = 60;
    } else if (typeCount === 1) {
      pageScore = 30;
    } else {
      pageScore = 0;
    }

    totalWeightedScore += pageScore;

    pagesAnalyzed.push({
      url: page.url,
      elementTypes,
      typeCount,
    });
  }

  const score = Math.round(totalWeightedScore / contentPages.length);
  const status: CheckResult['status'] = score >= 60 ? 'pass' : score >= 30 ? 'warning' : 'fail';

  return makeResult(
    'GEO-ANSWER-004',
    'Structured Content Elements',
    null,
    status,
    'warning',
    score,
    `Weighted average structured content score: ${score}/100 across ${contentPages.length} content page(s).`,
    {
      averageScore: score,
      totalContentPages: contentPages.length,
      samples: pagesAnalyzed.slice(0, 10),
    },
    'Use diverse content structures: ordered lists (ol), unordered lists (ul), tables, definition lists (dl), and code blocks. Pages with 3+ different structural element types are more likely to be cited by AI engines.',
  );
}

/**
 * Run Answer Readiness audit across all pages.
 */
export function runAnswerReadinessAudit(pages: PageData[]): CheckResult[] {
  const results: CheckResult[] = [];

  results.push(checkDirectAnswerInOpening(pages));
  results.push(checkSummarySections(pages));
  results.push(checkQaFormatHeadings(pages));
  results.push(checkStructuredContentElements(pages));

  return results;
}
