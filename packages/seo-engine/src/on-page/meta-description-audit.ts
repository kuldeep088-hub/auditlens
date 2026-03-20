import type { CheckResult, PageData } from '@audit/types';
import { randomUUID } from 'crypto';

/**
 * META-001 through META-003
 * Audits meta description tags.
 */
export function runMetaDescriptionAudit(pages: PageData[]): CheckResult[] {
  const results: CheckResult[] = [];
  const indexablePages = pages.filter(
    (p) =>
      p.statusCode === 200 &&
      !(p.metaRobots && p.metaRobots.toLowerCase().includes('noindex')),
  );

  if (indexablePages.length === 0) return results;

  // ── META-001: meta description present ────────────────────────────────
  const missingDesc: string[] = [];
  for (const page of indexablePages) {
    if (!page.metaDescription || page.metaDescription.trim().length === 0) {
      missingDesc.push(page.url);
    }
  }
  const allHaveDesc = missingDesc.length === 0;
  results.push({
    id: randomUUID(),
    checkId: 'META-001',
    checkName: 'Meta description present',
    pillar: 'seo',
    category: 'On-Page SEO',
    pageUrl: null,
    status: allHaveDesc ? 'pass' : 'warning',
    severity: 'warning',
    score: allHaveDesc
      ? 100
      : Math.round(
          ((indexablePages.length - missingDesc.length) /
            indexablePages.length) *
            100,
        ),
    message: allHaveDesc
      ? `All ${indexablePages.length} indexable pages have a meta description.`
      : `${missingDesc.length} of ${indexablePages.length} indexable page(s) are missing a meta description.`,
    details: allHaveDesc ? null : { missingDesc: missingDesc.slice(0, 50) },
    recommendation: allHaveDesc
      ? null
      : 'Add a unique, compelling meta description (120-160 characters) to every indexable page to improve click-through rates from SERPs.',
    wcagCriterion: null,
    element: null,
  });

  // ── META-002: meta description length ─────────────────────────────────
  const MIN_DESC_LENGTH = 70;
  const MAX_DESC_LENGTH = 160;
  const tooShort: { url: string; description: string; length: number }[] = [];
  const tooLong: { url: string; description: string; length: number }[] = [];
  for (const page of indexablePages) {
    if (!page.metaDescription || page.metaDescription.trim().length === 0) continue;
    const len = page.metaDescription.trim().length;
    if (len < MIN_DESC_LENGTH) {
      tooShort.push({
        url: page.url,
        description: page.metaDescription,
        length: len,
      });
    } else if (len > MAX_DESC_LENGTH) {
      tooLong.push({
        url: page.url,
        description: page.metaDescription,
        length: len,
      });
    }
  }
  const lengthIssues = tooShort.length + tooLong.length;
  const pagesWithDesc = indexablePages.filter(
    (p) => p.metaDescription && p.metaDescription.trim().length > 0,
  ).length;
  results.push({
    id: randomUUID(),
    checkId: 'META-002',
    checkName: 'Meta description length',
    pillar: 'seo',
    category: 'On-Page SEO',
    pageUrl: null,
    status: lengthIssues === 0 ? 'pass' : 'warning',
    severity: 'info',
    score:
      lengthIssues === 0
        ? 100
        : Math.max(
            0,
            Math.round(
              ((pagesWithDesc - lengthIssues) / Math.max(1, pagesWithDesc)) *
                100,
            ),
          ),
    message:
      lengthIssues === 0
        ? `All meta descriptions are between ${MIN_DESC_LENGTH} and ${MAX_DESC_LENGTH} characters.`
        : `${tooShort.length} description(s) too short (<${MIN_DESC_LENGTH} chars); ${tooLong.length} too long (>${MAX_DESC_LENGTH} chars).`,
    details: {
      tooShort: tooShort.slice(0, 20),
      tooLong: tooLong.slice(0, 20),
    },
    recommendation:
      lengthIssues > 0
        ? `Aim for meta descriptions between ${MIN_DESC_LENGTH}-${MAX_DESC_LENGTH} characters. Include a call to action and relevant keywords.`
        : null,
    wcagCriterion: null,
    element: null,
  });

  // ── META-003: duplicate meta descriptions ─────────────────────────────
  const descMap = new Map<string, string[]>();
  for (const page of indexablePages) {
    if (!page.metaDescription || page.metaDescription.trim().length === 0) continue;
    const normalized = page.metaDescription.trim().toLowerCase();
    if (!descMap.has(normalized)) descMap.set(normalized, []);
    descMap.get(normalized)!.push(page.url);
  }
  const duplicates: { description: string; urls: string[] }[] = [];
  for (const [desc, urls] of descMap.entries()) {
    if (urls.length > 1) {
      duplicates.push({ description: desc, urls });
    }
  }
  const duplicatePageCount = duplicates.reduce(
    (s, d) => s + d.urls.length,
    0,
  );
  const noDuplicates = duplicates.length === 0;
  results.push({
    id: randomUUID(),
    checkId: 'META-003',
    checkName: 'Unique meta descriptions',
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
            ((pagesWithDesc - duplicatePageCount) /
              Math.max(1, pagesWithDesc)) *
              100,
          ),
        ),
    message: noDuplicates
      ? 'All meta descriptions are unique.'
      : `${duplicates.length} duplicate description(s) found across ${duplicatePageCount} pages.`,
    details: noDuplicates
      ? null
      : {
          duplicates: duplicates.slice(0, 20).map((d) => ({
            description: d.description.substring(0, 100),
            urls: d.urls.slice(0, 10),
          })),
        },
    recommendation: noDuplicates
      ? null
      : 'Write unique meta descriptions for each page. Duplicate descriptions reduce CTR and confuse search engines.',
    wcagCriterion: null,
    element: null,
  });

  return results;
}
