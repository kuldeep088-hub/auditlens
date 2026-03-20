import type { CheckResult, PageData } from '@audit/types';
import { randomUUID } from 'crypto';

/**
 * SOCIAL-001 through SOCIAL-003
 * Audits Open Graph and Twitter Card meta tags.
 */
export function runSocialMetaAudit(pages: PageData[]): CheckResult[] {
  const results: CheckResult[] = [];
  const indexablePages = pages.filter(
    (p) =>
      p.statusCode === 200 &&
      !(p.metaRobots && p.metaRobots.toLowerCase().includes('noindex')),
  );

  if (indexablePages.length === 0) return results;

  // ── SOCIAL-001: Open Graph tags ───────────────────────────────────────
  const requiredOgTags = ['og:title', 'og:description', 'og:image', 'og:type', 'og:url'];
  const ogScoresPerPage: number[] = [];
  const ogIssues: { url: string; present: string[]; missing: string[] }[] = [];

  for (const page of indexablePages) {
    const og = page.ogTags;
    let presentCount = 0;
    const present: string[] = [];
    const missing: string[] = [];

    for (const tag of requiredOgTags) {
      // Check both "og:title" and "title" as key forms
      const key = tag.replace('og:', '');
      if (og[tag] || og[key]) {
        presentCount++;
        present.push(tag);
      } else {
        missing.push(tag);
      }
    }

    // Score = 20 per tag present (5 tags * 20 = 100)
    const pageScore = presentCount * 20;
    ogScoresPerPage.push(pageScore);

    if (missing.length > 0) {
      ogIssues.push({ url: page.url, present, missing });
    }
  }

  const ogAverageScore =
    ogScoresPerPage.length > 0
      ? Math.round(ogScoresPerPage.reduce((a, b) => a + b, 0) / ogScoresPerPage.length)
      : 0;
  const ogOk = ogIssues.length === 0;

  results.push({
    id: randomUUID(),
    checkId: 'SOCIAL-001',
    checkName: 'Open Graph tags',
    pillar: 'seo',
    category: 'Off-Page SEO',
    pageUrl: null,
    status: ogOk ? 'pass' : 'warning',
    severity: 'warning',
    score: ogAverageScore,
    message: ogOk
      ? `All ${indexablePages.length} indexable pages have complete Open Graph tags (${requiredOgTags.join(', ')}).`
      : `${ogIssues.length} of ${indexablePages.length} pages are missing one or more Open Graph tags. Average OG completeness: ${ogAverageScore}%.`,
    details: {
      requiredTags: requiredOgTags,
      pagesChecked: indexablePages.length,
      pagesWithIssues: ogIssues.length,
      issues: ogIssues.slice(0, 30),
    },
    recommendation: ogOk
      ? null
      : `Add the missing Open Graph tags (${requiredOgTags.join(', ')}) to all indexable pages. OG tags control how your content appears when shared on social media platforms.`,
    wcagCriterion: null,
    element: null,
  });

  // ── SOCIAL-002: Twitter Card tags ─────────────────────────────────────
  const requiredTwitterTags = ['twitter:card', 'twitter:title', 'twitter:description', 'twitter:image'];
  const twScoresPerPage: number[] = [];
  const twIssues: { url: string; present: string[]; missing: string[] }[] = [];

  for (const page of indexablePages) {
    const tw = page.twitterTags;
    let presentCount = 0;
    const present: string[] = [];
    const missing: string[] = [];

    for (const tag of requiredTwitterTags) {
      // Check both "twitter:card" and "card" as key forms
      const key = tag.replace('twitter:', '');
      if (tw[tag] || tw[key]) {
        presentCount++;
        present.push(tag);
      } else {
        missing.push(tag);
      }
    }

    // Score = 25 per tag present (4 tags * 25 = 100)
    const pageScore = presentCount * 25;
    twScoresPerPage.push(pageScore);

    if (missing.length > 0) {
      twIssues.push({ url: page.url, present, missing });
    }
  }

  const twAverageScore =
    twScoresPerPage.length > 0
      ? Math.round(twScoresPerPage.reduce((a, b) => a + b, 0) / twScoresPerPage.length)
      : 0;
  const twOk = twIssues.length === 0;

  results.push({
    id: randomUUID(),
    checkId: 'SOCIAL-002',
    checkName: 'Twitter Card tags',
    pillar: 'seo',
    category: 'Off-Page SEO',
    pageUrl: null,
    status: twOk ? 'pass' : 'warning',
    severity: 'warning',
    score: twAverageScore,
    message: twOk
      ? `All ${indexablePages.length} indexable pages have complete Twitter Card tags (${requiredTwitterTags.join(', ')}).`
      : `${twIssues.length} of ${indexablePages.length} pages are missing one or more Twitter Card tags. Average Twitter Card completeness: ${twAverageScore}%.`,
    details: {
      requiredTags: requiredTwitterTags,
      pagesChecked: indexablePages.length,
      pagesWithIssues: twIssues.length,
      issues: twIssues.slice(0, 30),
    },
    recommendation: twOk
      ? null
      : `Add the missing Twitter Card tags (${requiredTwitterTags.join(', ')}) to improve link previews when shared on X/Twitter.`,
    wcagCriterion: null,
    element: null,
  });

  // ── SOCIAL-003: OG Image dimensions ───────────────────────────────────
  let pagesWithOgImage = 0;

  for (const page of indexablePages) {
    const og = page.ogTags;
    const ogImage = og['og:image'] || og['image'] || '';
    if (ogImage) {
      pagesWithOgImage++;
    }
  }

  const ogImagePercent =
    indexablePages.length > 0
      ? Math.round((pagesWithOgImage / indexablePages.length) * 100)
      : 0;

  results.push({
    id: randomUUID(),
    checkId: 'SOCIAL-003',
    checkName: 'OG Image dimensions',
    pillar: 'seo',
    category: 'Off-Page SEO',
    pageUrl: null,
    status: 'info',
    severity: 'info',
    score: ogImagePercent,
    message: `${pagesWithOgImage} of ${indexablePages.length} indexable pages (${ogImagePercent}%) have an og:image tag set.`,
    details: {
      pagesWithOgImage,
      pagesWithoutOgImage: indexablePages.length - pagesWithOgImage,
      totalPages: indexablePages.length,
    },
    recommendation:
      ogImagePercent < 100
        ? 'Add og:image tags to all pages. Social media platforms use these images for link previews. Use images at least 1200x630 pixels for optimal display.'
        : null,
    wcagCriterion: null,
    element: null,
  });

  return results;
}
