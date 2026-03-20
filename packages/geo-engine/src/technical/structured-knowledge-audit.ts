/**
 * Structured Knowledge audit for GEO.
 * Checks GEO-STRUCT-001 and GEO-STRUCT-002 to evaluate the presence
 * of structured knowledge formats that AI engines can easily parse
 * and cite: FAQ sections and properly-headed data tables.
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

function isContentPage(page: PageData): boolean {
  return page.wordCount >= 50 && page.statusCode >= 200 && page.statusCode < 400;
}

/**
 * GEO-STRUCT-001: FAQ sections.
 * Check for FAQPage in schemaMarkup OR headings containing "FAQ" or
 * "Frequently Asked".
 */
function checkFaqSections(pages: PageData[]): CheckResult {
  const contentPages = pages.filter(isContentPage);

  if (contentPages.length === 0) {
    return makeResult('GEO-STRUCT-001', 'FAQ Sections', null, 'info', 'info', 100,
      'No content pages found to evaluate.', { contentPageCount: 0 }, null);
  }

  let pagesWithFaq = 0;
  const pagesAnalyzed: { url: string; hasFaq: boolean; faqSignals: string[] }[] = [];

  for (const page of contentPages) {
    const signals: string[] = [];

    for (const schema of page.schemaMarkup) {
      const schemaStr = JSON.stringify(schema).toLowerCase();
      if (schemaStr.includes('"faqpage"') || schemaStr.includes('"@type":"faqpage"') || schemaStr.includes('"@type": "faqpage"')) {
        signals.push('FAQPage-schema');
        break;
      }
    }

    for (const heading of page.headings) {
      const text = heading.text.toLowerCase().trim();
      if (text.includes('faq') || text.includes('frequently asked') || text.includes('common questions') ||
          text.includes('questions and answers') || text.includes('q&a')) {
        signals.push(`faq-heading: "${heading.text}"`);
        break;
      }
    }

    const $ = cheerio.load(page.rawHtml);
    if ($('[class*="faq"], [id*="faq"], [class*="FAQ"], [id*="FAQ"]').length > 0) {
      signals.push('faq-element');
    }

    if (signals.length > 0) pagesWithFaq++;
    pagesAnalyzed.push({ url: page.url, hasFaq: signals.length > 0, faqSignals: signals });
  }

  const score = Math.round((pagesWithFaq / contentPages.length) * 100);
  const status: CheckResult['status'] = score >= 30 ? 'pass' : score > 0 ? 'warning' : 'info';

  return makeResult('GEO-STRUCT-001', 'FAQ Sections', null, status, 'info', score,
    `${pagesWithFaq} of ${contentPages.length} content page(s) include FAQ sections.`,
    { pagesWithFaq, totalContentPages: contentPages.length, percentage: score, samples: pagesAnalyzed.slice(0, 10) },
    'Add FAQ sections to relevant content pages using FAQPage schema markup. AI engines frequently pull answers from well-structured FAQ content.');
}

/**
 * GEO-STRUCT-002: Data tables with headers.
 * Parse rawHtml for <table> elements that have <th> or <thead>.
 */
function checkDataTablesWithHeaders(pages: PageData[]): CheckResult {
  const contentPages = pages.filter(isContentPage);

  if (contentPages.length === 0) {
    return makeResult('GEO-STRUCT-002', 'Data Tables with Headers', null, 'info', 'info', 100,
      'No content pages found to evaluate.', { contentPageCount: 0 }, null);
  }

  let totalTables = 0;
  let tablesWithHeaders = 0;
  const pagesAnalyzed: { url: string; totalTables: number; tablesWithHeaders: number }[] = [];

  for (const page of contentPages) {
    const $ = cheerio.load(page.rawHtml);
    const tables = $('table').not('[role="presentation"], [role="none"]');
    let pageTablesTotal = 0;
    let pageTablesWithHeaders = 0;

    tables.each((_, el) => {
      pageTablesTotal++;
      const table = $(el);
      if (table.find('th').length > 0 || table.find('thead').length > 0) pageTablesWithHeaders++;
    });

    totalTables += pageTablesTotal;
    tablesWithHeaders += pageTablesWithHeaders;
    pagesAnalyzed.push({ url: page.url, totalTables: pageTablesTotal, tablesWithHeaders: pageTablesWithHeaders });
  }

  if (totalTables === 0) {
    return makeResult('GEO-STRUCT-002', 'Data Tables with Headers', null, 'info', 'info', 100,
      'No data tables found across content pages.',
      { totalTables: 0, tablesWithHeaders: 0, totalContentPages: contentPages.length },
      'Consider adding data tables to present comparative or structured information. AI engines can easily parse well-structured tables for citation.');
  }

  const score = Math.round((tablesWithHeaders / totalTables) * 100);
  const status: CheckResult['status'] = score >= 80 ? 'pass' : score >= 50 ? 'warning' : 'fail';
  const tablesWithoutHeaders = totalTables - tablesWithHeaders;

  return makeResult('GEO-STRUCT-002', 'Data Tables with Headers', null, status, 'info', score,
    `${tablesWithHeaders} of ${totalTables} data table(s) (${score}%) have proper header cells (<th> or <thead>).`,
    {
      totalTables, tablesWithHeaders, tablesWithoutHeaders, percentage: score,
      totalContentPages: contentPages.length,
      samples: pagesAnalyzed.filter((p) => p.totalTables > 0).slice(0, 10),
    },
    tablesWithoutHeaders > 0
      ? `${tablesWithoutHeaders} table(s) lack header cells. Add <th> elements or <thead> to data tables so AI engines can correctly interpret and cite tabular data.`
      : null);
}

/** Run Structured Knowledge audit across all pages. */
export function runStructuredKnowledgeAudit(pages: PageData[]): CheckResult[] {
  const results: CheckResult[] = [];
  results.push(checkFaqSections(pages));
  results.push(checkDataTablesWithHeaders(pages));
  return results;
}
