import type { CheckResult, PageData } from '@audit/types';
import { randomUUID } from 'crypto';

/**
 * HEADING-001 through HEADING-004
 * Audits heading structure.
 */
export function runHeadingAudit(pages: PageData[]): CheckResult[] {
  const results: CheckResult[] = [];
  const indexablePages = pages.filter(
    (p) =>
      p.statusCode === 200 &&
      !(p.metaRobots && p.metaRobots.toLowerCase().includes('noindex')),
  );

  if (indexablePages.length === 0) return results;

  // ── HEADING-001: H1 present ───────────────────────────────────────────
  const missingH1: string[] = [];
  const multipleH1: { url: string; count: number }[] = [];
  for (const page of indexablePages) {
    const h1s = page.headings.filter((h) => h.level === 1);
    if (h1s.length === 0) {
      missingH1.push(page.url);
    } else if (h1s.length > 1) {
      multipleH1.push({ url: page.url, count: h1s.length });
    }
  }
  const h1Ok = missingH1.length === 0;
  results.push({
    id: randomUUID(),
    checkId: 'HEADING-001',
    checkName: 'H1 tag present',
    pillar: 'seo',
    category: 'On-Page SEO',
    pageUrl: null,
    status: h1Ok ? 'pass' : 'fail',
    severity: 'high',
    score: h1Ok
      ? 100
      : Math.round(
          ((indexablePages.length - missingH1.length) /
            indexablePages.length) *
            100,
        ),
    message: h1Ok
      ? `All ${indexablePages.length} indexable pages have an H1 tag.`
      : `${missingH1.length} page(s) are missing an H1 tag.`,
    details: {
      missingH1: missingH1.slice(0, 30),
      multipleH1: multipleH1.slice(0, 30),
    },
    recommendation: h1Ok
      ? null
      : 'Add a single, descriptive H1 tag to every page. The H1 should clearly communicate the main topic.',
    wcagCriterion: null,
    element: null,
  });

  // ── HEADING-002: single H1 per page ───────────────────────────────────
  const singleH1Ok = multipleH1.length === 0;
  results.push({
    id: randomUUID(),
    checkId: 'HEADING-002',
    checkName: 'Single H1 per page',
    pillar: 'seo',
    category: 'On-Page SEO',
    pageUrl: null,
    status: singleH1Ok ? 'pass' : 'warning',
    severity: 'info',
    score: singleH1Ok
      ? 100
      : Math.max(
          0,
          Math.round(
            ((indexablePages.length - multipleH1.length) /
              indexablePages.length) *
              100,
          ),
        ),
    message: singleH1Ok
      ? 'All pages have exactly one H1 tag.'
      : `${multipleH1.length} page(s) have multiple H1 tags.`,
    details: singleH1Ok ? null : { multipleH1: multipleH1.slice(0, 30) },
    recommendation: singleH1Ok
      ? null
      : 'While multiple H1s are technically valid in HTML5, best practice is to use a single H1 per page for clarity.',
    wcagCriterion: null,
    element: null,
  });

  // ── HEADING-003: heading hierarchy (no skipped levels) ────────────────
  const skippedLevelPages: { url: string; issue: string }[] = [];
  for (const page of indexablePages) {
    if (page.headings.length === 0) continue;

    let prevLevel = 0;
    for (const heading of page.headings) {
      if (heading.level > prevLevel + 1 && prevLevel > 0) {
        skippedLevelPages.push({
          url: page.url,
          issue: `Jumped from H${prevLevel} to H${heading.level} ("${heading.text.substring(0, 50)}")`,
        });
        break; // One issue per page is enough
      }
      prevLevel = heading.level;
    }

    // Also check if the first heading is not H1
    if (page.headings.length > 0 && page.headings[0].level !== 1) {
      // Only add if not already flagged
      const alreadyFlagged = skippedLevelPages.some((p) => p.url === page.url);
      if (!alreadyFlagged) {
        skippedLevelPages.push({
          url: page.url,
          issue: `First heading is H${page.headings[0].level} instead of H1`,
        });
      }
    }
  }
  const hierarchyOk = skippedLevelPages.length === 0;
  results.push({
    id: randomUUID(),
    checkId: 'HEADING-003',
    checkName: 'Heading hierarchy (no skipped levels)',
    pillar: 'seo',
    category: 'On-Page SEO',
    pageUrl: null,
    status: hierarchyOk ? 'pass' : 'warning',
    severity: 'warning',
    score: hierarchyOk
      ? 100
      : Math.max(
          0,
          Math.round(
            ((indexablePages.length - skippedLevelPages.length) /
              indexablePages.length) *
              100,
          ),
        ),
    message: hierarchyOk
      ? 'All pages have a proper heading hierarchy without skipped levels.'
      : `${skippedLevelPages.length} page(s) have heading hierarchy issues.`,
    details: hierarchyOk
      ? null
      : { skippedLevelPages: skippedLevelPages.slice(0, 30) },
    recommendation: hierarchyOk
      ? null
      : 'Maintain proper heading hierarchy (H1 > H2 > H3, etc.) without skipping levels. This helps search engines understand your content structure.',
    wcagCriterion: null,
    element: null,
  });

  // ── HEADING-004: empty headings ───────────────────────────────────────
  const emptyHeadingPages: { url: string; emptyHeadings: string[] }[] = [];
  for (const page of indexablePages) {
    const empty = page.headings.filter(
      (h) => !h.text || h.text.trim().length === 0,
    );
    if (empty.length > 0) {
      emptyHeadingPages.push({
        url: page.url,
        emptyHeadings: empty.map((h) => `H${h.level}`),
      });
    }
  }
  const noEmptyHeadings = emptyHeadingPages.length === 0;
  results.push({
    id: randomUUID(),
    checkId: 'HEADING-004',
    checkName: 'No empty headings',
    pillar: 'seo',
    category: 'On-Page SEO',
    pageUrl: null,
    status: noEmptyHeadings ? 'pass' : 'warning',
    severity: 'warning',
    score: noEmptyHeadings
      ? 100
      : Math.max(
          0,
          Math.round(
            ((indexablePages.length - emptyHeadingPages.length) /
              indexablePages.length) *
              100,
          ),
        ),
    message: noEmptyHeadings
      ? 'No empty heading tags detected.'
      : `${emptyHeadingPages.length} page(s) contain empty heading tags.`,
    details: noEmptyHeadings
      ? null
      : { emptyHeadingPages: emptyHeadingPages.slice(0, 30) },
    recommendation: noEmptyHeadings
      ? null
      : 'Remove or fill in empty heading tags. Empty headings provide no value to search engines or users.',
    wcagCriterion: null,
    element: null,
  });

  return results;
}
