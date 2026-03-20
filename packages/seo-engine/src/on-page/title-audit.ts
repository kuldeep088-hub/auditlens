import type { CheckResult, PageData } from '@audit/types';
import { randomUUID } from 'crypto';

/**
 * TITLE-001 through TITLE-004
 * Audits page <title> tags.
 */
export function runTitleAudit(pages: PageData[]): CheckResult[] {
  const results: CheckResult[] = [];
  const indexablePages = pages.filter(
    (p) =>
      p.statusCode === 200 &&
      !(p.metaRobots && p.metaRobots.toLowerCase().includes('noindex')),
  );

  if (indexablePages.length === 0) return results;

  // ── TITLE-001: title tag present ──────────────────────────────────────
  const missingTitle: string[] = [];
  for (const page of indexablePages) {
    if (!page.title || page.title.trim().length === 0) {
      missingTitle.push(page.url);
    }
  }
  const allHaveTitle = missingTitle.length === 0;
  results.push({
    id: randomUUID(),
    checkId: 'TITLE-001',
    checkName: 'Title tag present',
    pillar: 'seo',
    category: 'On-Page SEO',
    pageUrl: null,
    status: allHaveTitle ? 'pass' : 'fail',
    severity: 'critical',
    score: allHaveTitle
      ? 100
      : Math.round(
          ((indexablePages.length - missingTitle.length) /
            indexablePages.length) *
            100,
        ),
    message: allHaveTitle
      ? `All ${indexablePages.length} indexable pages have a title tag.`
      : `${missingTitle.length} of ${indexablePages.length} indexable page(s) are missing a title tag.`,
    details: allHaveTitle ? null : { missingTitle: missingTitle.slice(0, 50) },
    recommendation: allHaveTitle
      ? null
      : 'Add a unique, descriptive <title> tag to every indexable page. The title is one of the most important on-page SEO elements.',
    wcagCriterion: null,
    element: null,
  });

  // ── TITLE-002: title length ───────────────────────────────────────────
  const MIN_TITLE_LENGTH = 10;
  const MAX_TITLE_LENGTH = 60;
  const tooShort: { url: string; title: string; length: number }[] = [];
  const tooLong: { url: string; title: string; length: number }[] = [];
  for (const page of indexablePages) {
    if (!page.title) continue;
    const len = page.title.trim().length;
    if (len < MIN_TITLE_LENGTH) {
      tooShort.push({ url: page.url, title: page.title, length: len });
    } else if (len > MAX_TITLE_LENGTH) {
      tooLong.push({ url: page.url, title: page.title, length: len });
    }
  }
  const lengthIssues = tooShort.length + tooLong.length;
  const pagesWithTitle = indexablePages.filter(
    (p) => p.title && p.title.trim().length > 0,
  ).length;
  results.push({
    id: randomUUID(),
    checkId: 'TITLE-002',
    checkName: 'Title tag length',
    pillar: 'seo',
    category: 'On-Page SEO',
    pageUrl: null,
    status: lengthIssues === 0 ? 'pass' : 'warning',
    severity: 'warning',
    score:
      lengthIssues === 0
        ? 100
        : Math.max(
            0,
            Math.round(
              ((pagesWithTitle - lengthIssues) / Math.max(1, pagesWithTitle)) *
                100,
            ),
          ),
    message:
      lengthIssues === 0
        ? `All title tags are between ${MIN_TITLE_LENGTH} and ${MAX_TITLE_LENGTH} characters.`
        : `${tooShort.length} title(s) too short (<${MIN_TITLE_LENGTH} chars); ${tooLong.length} too long (>${MAX_TITLE_LENGTH} chars).`,
    details: { tooShort: tooShort.slice(0, 30), tooLong: tooLong.slice(0, 30) },
    recommendation:
      lengthIssues > 0
        ? `Keep title tags between ${MIN_TITLE_LENGTH}-${MAX_TITLE_LENGTH} characters. Shorter titles waste SERP space; longer ones get truncated.`
        : null,
    wcagCriterion: null,
    element: null,
  });

  // ── TITLE-003: duplicate titles ───────────────────────────────────────
  const titleMap = new Map<string, string[]>();
  for (const page of indexablePages) {
    if (!page.title || page.title.trim().length === 0) continue;
    const normalized = page.title.trim().toLowerCase();
    if (!titleMap.has(normalized)) titleMap.set(normalized, []);
    titleMap.get(normalized)!.push(page.url);
  }
  const duplicates: { title: string; urls: string[] }[] = [];
  for (const [title, urls] of titleMap.entries()) {
    if (urls.length > 1) {
      duplicates.push({ title, urls });
    }
  }
  const duplicatePageCount = duplicates.reduce(
    (s, d) => s + d.urls.length,
    0,
  );
  const noDuplicates = duplicates.length === 0;
  results.push({
    id: randomUUID(),
    checkId: 'TITLE-003',
    checkName: 'Unique title tags',
    pillar: 'seo',
    category: 'On-Page SEO',
    pageUrl: null,
    status: noDuplicates ? 'pass' : 'warning',
    severity: 'warning',
    score: noDuplicates
      ? 100
      : Math.max(
          0,
          Math.round(
            ((pagesWithTitle - duplicatePageCount) /
              Math.max(1, pagesWithTitle)) *
              100,
          ),
        ),
    message: noDuplicates
      ? 'All title tags are unique across the site.'
      : `${duplicates.length} duplicate title(s) found across ${duplicatePageCount} pages.`,
    details: noDuplicates
      ? null
      : { duplicates: duplicates.slice(0, 30).map((d) => ({ title: d.title, urls: d.urls.slice(0, 10) })) },
    recommendation: noDuplicates
      ? null
      : 'Write unique, descriptive titles for each page. Duplicate titles confuse search engines about which page to rank.',
    wcagCriterion: null,
    element: null,
  });

  // ── TITLE-004: title contains target keywords (heuristic) ─────────────
  // Check that title words appear in the page content (relevance check)
  const irrelevantTitles: { url: string; title: string }[] = [];
  for (const page of indexablePages) {
    if (!page.title || page.title.trim().length === 0) continue;
    if (!page.contentText || page.contentText.trim().length === 0) continue;

    const titleWords = page.title
      .toLowerCase()
      .split(/\s+/)
      .filter((w) => w.length > 3) // ignore short words
      .filter((w) => !STOP_WORDS.has(w));

    if (titleWords.length === 0) continue;

    const contentLower = page.contentText.toLowerCase();
    const matchedWords = titleWords.filter((w) => contentLower.includes(w));
    const matchRatio = matchedWords.length / titleWords.length;

    if (matchRatio < 0.3) {
      irrelevantTitles.push({ url: page.url, title: page.title });
    }
  }
  const titlesRelevant = irrelevantTitles.length === 0;
  results.push({
    id: randomUUID(),
    checkId: 'TITLE-004',
    checkName: 'Title tag relevance to page content',
    pillar: 'seo',
    category: 'On-Page SEO',
    pageUrl: null,
    status: titlesRelevant ? 'pass' : 'warning',
    severity: 'info',
    score: titlesRelevant
      ? 100
      : Math.max(
          0,
          100 -
            Math.round(
              (irrelevantTitles.length / Math.max(1, pagesWithTitle)) * 100,
            ),
        ),
    message: titlesRelevant
      ? 'All title tags appear relevant to their page content.'
      : `${irrelevantTitles.length} page(s) have titles that may not reflect the page content.`,
    details: titlesRelevant
      ? null
      : { irrelevantTitles: irrelevantTitles.slice(0, 30) },
    recommendation: titlesRelevant
      ? null
      : 'Ensure your title tags include relevant keywords that match the page content. Titles should accurately describe the page topic.',
    wcagCriterion: null,
    element: null,
  });

  return results;
}

const STOP_WORDS = new Set([
  'the', 'and', 'for', 'are', 'but', 'not', 'you', 'all', 'can', 'had',
  'her', 'was', 'one', 'our', 'out', 'has', 'have', 'been', 'from', 'that',
  'they', 'this', 'with', 'will', 'your', 'each', 'make', 'like', 'just',
  'over', 'such', 'than', 'them', 'would', 'about', 'which', 'their',
  'what', 'when', 'where', 'who', 'how', 'into', 'more', 'some', 'only',
  'also', 'very', 'best', 'most',
]);
