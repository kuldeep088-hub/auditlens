import type { CheckResult, PageData } from '@audit/types';
import { randomUUID } from 'crypto';

/**
 * CONTENT-001 through CONTENT-004
 * Audits content quality: thin content, readability, duplicates, E-E-A-T signals.
 */
export function runContentQualityAudit(pages: PageData[]): CheckResult[] {
  const results: CheckResult[] = [];
  const indexablePages = pages.filter(
    (p) =>
      p.statusCode === 200 &&
      !(p.metaRobots && p.metaRobots.toLowerCase().includes('noindex')),
  );

  if (indexablePages.length === 0) return results;

  // ── CONTENT-001: thin content (low word count) ────────────────────────
  const THIN_THRESHOLD = 300;
  const thinPages: { url: string; wordCount: number }[] = [];
  for (const page of indexablePages) {
    if (page.wordCount < THIN_THRESHOLD) {
      thinPages.push({ url: page.url, wordCount: page.wordCount });
    }
  }
  const noThin = thinPages.length === 0;
  results.push({
    id: randomUUID(),
    checkId: 'CONTENT-001',
    checkName: 'Thin content detection',
    pillar: 'seo',
    category: 'Content Quality',
    pageUrl: null,
    status: noThin ? 'pass' : thinPages.length > indexablePages.length * 0.3 ? 'fail' : 'warning',
    severity: thinPages.length > indexablePages.length * 0.3 ? 'high' : 'warning',
    score: noThin
      ? 100
      : Math.max(
          0,
          Math.round(
            ((indexablePages.length - thinPages.length) /
              indexablePages.length) *
              100,
          ),
        ),
    message: noThin
      ? `All indexable pages have at least ${THIN_THRESHOLD} words.`
      : `${thinPages.length} of ${indexablePages.length} indexable page(s) have fewer than ${THIN_THRESHOLD} words.`,
    details: noThin
      ? null
      : {
          thinPages: thinPages
            .sort((a, b) => a.wordCount - b.wordCount)
            .slice(0, 50),
          threshold: THIN_THRESHOLD,
        },
    recommendation: noThin
      ? null
      : 'Expand thin content pages with comprehensive, valuable information. Consider merging very thin pages or adding a noindex directive if the content cannot be expanded.',
    wcagCriterion: null,
    element: null,
  });

  // ── CONTENT-002: readability (Flesch-Kincaid approximation) ───────────
  const readabilityIssues: {
    url: string;
    fleschScore: number;
    avgSentenceLength: number;
    avgSyllables: number;
  }[] = [];
  const readabilityScores: number[] = [];

  for (const page of indexablePages) {
    if (!page.contentText || page.wordCount < 100) continue;

    const text = page.contentText;
    const sentences = text
      .split(/[.!?]+/)
      .filter((s) => s.trim().length > 0);
    const words = text
      .split(/\s+/)
      .filter((w) => w.length > 0);
    const sentenceCount = Math.max(1, sentences.length);
    const wordCount = Math.max(1, words.length);

    const totalSyllables = words.reduce(
      (sum, word) => sum + countSyllables(word),
      0,
    );

    const avgSentenceLength = wordCount / sentenceCount;
    const avgSyllablesPerWord = totalSyllables / wordCount;

    // Flesch Reading Ease
    const flesch =
      206.835 - 1.015 * avgSentenceLength - 84.6 * avgSyllablesPerWord;
    const clampedFlesch = Math.max(0, Math.min(100, flesch));

    readabilityScores.push(clampedFlesch);

    // Flag pages with very low readability (< 30 = very difficult)
    if (clampedFlesch < 30) {
      readabilityIssues.push({
        url: page.url,
        fleschScore: Math.round(clampedFlesch),
        avgSentenceLength: Math.round(avgSentenceLength * 10) / 10,
        avgSyllables: Math.round(avgSyllablesPerWord * 100) / 100,
      });
    }
  }

  const avgReadability =
    readabilityScores.length > 0
      ? readabilityScores.reduce((s, v) => s + v, 0) / readabilityScores.length
      : 60;
  const readabilityOk = readabilityIssues.length === 0;

  results.push({
    id: randomUUID(),
    checkId: 'CONTENT-002',
    checkName: 'Content readability',
    pillar: 'seo',
    category: 'Content Quality',
    pageUrl: null,
    status: readabilityOk ? 'pass' : 'warning',
    severity: 'info',
    score: Math.max(0, Math.round(avgReadability)),
    message: readabilityOk
      ? `Average readability score: ${Math.round(avgReadability)} (Flesch Reading Ease). All pages are reasonably readable.`
      : `Average readability: ${Math.round(avgReadability)}. ${readabilityIssues.length} page(s) have very low readability scores (<30).`,
    details: {
      averageFleschScore: Math.round(avgReadability),
      measured: readabilityScores.length,
      difficultPages: readabilityIssues.slice(0, 30),
    },
    recommendation: readabilityOk
      ? null
      : 'Simplify content on difficult-to-read pages. Use shorter sentences, simpler words, bullet points, and clear headings.',
    wcagCriterion: null,
    element: null,
  });

  // ── CONTENT-003: internal duplicate content (Jaccard of word n-grams) ─
  const NGRAM_SIZE = 3;
  const SIMILARITY_THRESHOLD = 0.7;

  // Build n-gram sets for each page
  const pageNgrams: { url: string; ngrams: Set<string> }[] = [];
  for (const page of indexablePages) {
    if (page.wordCount < 50) continue;
    const words = page.contentText
      .toLowerCase()
      .replace(/[^\w\s]/g, '')
      .split(/\s+/)
      .filter((w) => w.length > 0);

    const ngrams = new Set<string>();
    for (let i = 0; i <= words.length - NGRAM_SIZE; i++) {
      ngrams.add(words.slice(i, i + NGRAM_SIZE).join(' '));
    }
    if (ngrams.size > 0) {
      pageNgrams.push({ url: page.url, ngrams });
    }
  }

  const duplicatePairs: {
    url1: string;
    url2: string;
    similarity: number;
  }[] = [];

  // O(n^2) pairwise comparison — cap at 500 pages to avoid excessive computation
  const maxPagesForComparison = Math.min(pageNgrams.length, 500);
  for (let i = 0; i < maxPagesForComparison; i++) {
    for (let j = i + 1; j < maxPagesForComparison; j++) {
      const a = pageNgrams[i];
      const b = pageNgrams[j];

      // Quick size check — if one set is much larger, similarity will be low
      const minSize = Math.min(a.ngrams.size, b.ngrams.size);
      const maxSize = Math.max(a.ngrams.size, b.ngrams.size);
      if (minSize / maxSize < SIMILARITY_THRESHOLD) continue;

      // Jaccard similarity
      let intersection = 0;
      const smaller = a.ngrams.size <= b.ngrams.size ? a : b;
      const larger = a.ngrams.size <= b.ngrams.size ? b : a;

      for (const ng of smaller.ngrams) {
        if (larger.ngrams.has(ng)) intersection++;
      }

      const union = a.ngrams.size + b.ngrams.size - intersection;
      const similarity = union > 0 ? intersection / union : 0;

      if (similarity >= SIMILARITY_THRESHOLD) {
        duplicatePairs.push({
          url1: a.url,
          url2: b.url,
          similarity: Math.round(similarity * 100) / 100,
        });
      }
    }
  }

  const noDuplicateContent = duplicatePairs.length === 0;
  results.push({
    id: randomUUID(),
    checkId: 'CONTENT-003',
    checkName: 'Internal duplicate content',
    pillar: 'seo',
    category: 'Content Quality',
    pageUrl: null,
    status: noDuplicateContent ? 'pass' : 'warning',
    severity: 'warning',
    score: noDuplicateContent
      ? 100
      : Math.max(
          0,
          100 - duplicatePairs.length * 10,
        ),
    message: noDuplicateContent
      ? 'No significantly duplicated content detected between pages.'
      : `${duplicatePairs.length} pair(s) of pages have highly similar content (>${SIMILARITY_THRESHOLD * 100}% Jaccard similarity of word trigrams).`,
    details: noDuplicateContent
      ? null
      : {
          duplicatePairs: duplicatePairs
            .sort((a, b) => b.similarity - a.similarity)
            .slice(0, 30),
          comparedPages: maxPagesForComparison,
        },
    recommendation: noDuplicateContent
      ? null
      : 'Consolidate or differentiate pages with highly similar content. Use canonical tags if keeping both, or merge them into a single comprehensive page.',
    wcagCriterion: null,
    element: null,
  });

  // ── CONTENT-004: E-E-A-T signals ──────────────────────────────────────
  // Check for author information, publication dates, sources, credentials
  const eatMissingSignals: { url: string; missing: string[] }[] = [];

  for (const page of indexablePages) {
    if (page.wordCount < 200) continue; // only check substantial content pages
    const html = page.rawHtml.toLowerCase();
    const missing: string[] = [];

    // Check for author signal
    const hasAuthor =
      html.includes('rel="author"') ||
      html.includes("rel='author'") ||
      html.includes('class="author"') ||
      html.includes("class='author'") ||
      html.includes('itemprop="author"') ||
      html.includes("itemprop='author'") ||
      html.includes('"author"') && (page.schemaMarkup.length > 0);
    if (!hasAuthor) {
      missing.push('author attribution');
    }

    // Check for date signal
    const hasDate =
      html.includes('datetime=') ||
      html.includes('itemprop="datepublished"') ||
      html.includes("itemprop='datepublished'") ||
      html.includes('itemprop="datemodified"') ||
      html.includes("itemprop='datemodified'") ||
      html.includes('class="date"') ||
      html.includes("class='date'") ||
      html.includes('class="published"') ||
      html.includes("class='published'");
    if (!hasDate) {
      missing.push('publication/modification date');
    }

    // Check for sources/references
    const hasSources =
      html.includes('class="source') ||
      html.includes('class="reference') ||
      html.includes('class="citation') ||
      html.includes('rel="nofollow"') || // external links often have nofollow
      page.externalLinks.length > 0; // citing external sources
    if (!hasSources) {
      missing.push('external sources or references');
    }

    if (missing.length >= 2) {
      eatMissingSignals.push({ url: page.url, missing });
    }
  }

  const substantialPages = indexablePages.filter((p) => p.wordCount >= 200);
  const eatOk = eatMissingSignals.length === 0;
  results.push({
    id: randomUUID(),
    checkId: 'CONTENT-004',
    checkName: 'E-E-A-T signals present',
    pillar: 'seo',
    category: 'Content Quality',
    pageUrl: null,
    status: eatOk ? 'pass' : 'info',
    severity: 'info',
    score: eatOk
      ? 100
      : Math.max(
          0,
          Math.round(
            ((substantialPages.length - eatMissingSignals.length) /
              Math.max(1, substantialPages.length)) *
              100,
          ),
        ),
    message: eatOk
      ? 'Content pages show E-E-A-T signals (authorship, dates, sources).'
      : `${eatMissingSignals.length} content page(s) are missing multiple E-E-A-T signals.`,
    details: eatOk
      ? null
      : { pagesWithMissingSignals: eatMissingSignals.slice(0, 30) },
    recommendation: eatOk
      ? null
      : 'Add author bios, publication dates, credentials, and cite sources. These Experience, Expertise, Authoritativeness, and Trustworthiness signals help build credibility with search engines.',
    wcagCriterion: null,
    element: null,
  });

  return results;
}

/**
 * Approximate syllable count for an English word.
 */
function countSyllables(word: string): number {
  word = word.toLowerCase().replace(/[^a-z]/g, '');
  if (word.length <= 2) return 1;

  // Remove trailing silent e
  word = word.replace(/e$/, '');

  // Count vowel groups
  const vowelGroups = word.match(/[aeiouy]+/g);
  const count = vowelGroups ? vowelGroups.length : 1;

  return Math.max(1, count);
}
