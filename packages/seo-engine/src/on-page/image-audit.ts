import type { CheckResult, PageData } from '@audit/types';
import { randomUUID } from 'crypto';

/**
 * IMG-001 through IMG-006
 * Audits images for SEO best practices.
 */
export function runImageAudit(pages: PageData[]): CheckResult[] {
  const results: CheckResult[] = [];
  const indexablePages = pages.filter(
    (p) =>
      p.statusCode === 200 &&
      !(p.metaRobots && p.metaRobots.toLowerCase().includes('noindex')),
  );

  if (indexablePages.length === 0) return results;

  const allImages = indexablePages.flatMap((p) =>
    p.images.map((img) => ({ ...img, pageUrl: p.url })),
  );

  if (allImages.length === 0) {
    // Still report that we checked
    results.push({
      id: randomUUID(),
      checkId: 'IMG-001',
      checkName: 'Images have alt text',
      pillar: 'seo',
      category: 'On-Page SEO',
      pageUrl: null,
      status: 'pass',
      severity: 'high',
      score: 100,
      message: 'No images found on indexable pages.',
      details: null,
      recommendation: null,
      wcagCriterion: null,
      element: null,
    });
    return results;
  }

  // ── IMG-001: alt text present ─────────────────────────────────────────
  const missingAlt: { pageUrl: string; src: string }[] = [];
  for (const img of allImages) {
    if (img.alt === null || img.alt.trim().length === 0) {
      missingAlt.push({ pageUrl: img.pageUrl, src: img.src });
    }
  }
  const allHaveAlt = missingAlt.length === 0;
  results.push({
    id: randomUUID(),
    checkId: 'IMG-001',
    checkName: 'Images have alt text',
    pillar: 'seo',
    category: 'On-Page SEO',
    pageUrl: null,
    status: allHaveAlt ? 'pass' : 'fail',
    severity: 'high',
    score: allHaveAlt
      ? 100
      : Math.round(
          ((allImages.length - missingAlt.length) / allImages.length) * 100,
        ),
    message: allHaveAlt
      ? `All ${allImages.length} images have alt text.`
      : `${missingAlt.length} of ${allImages.length} images are missing alt text.`,
    details: allHaveAlt ? null : { missingAlt: missingAlt.slice(0, 50) },
    recommendation: allHaveAlt
      ? null
      : 'Add descriptive alt text to all images. Alt text helps search engines understand image content and improves accessibility.',
    wcagCriterion: null,
    element: null,
  });

  // ── IMG-002: alt text quality (not generic) ───────────────────────────
  const genericAltPatterns = [
    /^image$/i,
    /^img$/i,
    /^photo$/i,
    /^picture$/i,
    /^screenshot$/i,
    /^banner$/i,
    /^untitled$/i,
    /^dsc_?\d+$/i,
    /^img_?\d+$/i,
    /^image\s*\d+$/i,
    /^[0-9a-f-]+$/i, // UUID-like
    /^\S+\.(jpg|jpeg|png|gif|webp|svg|avif)$/i, // filename-only alt text
  ];
  const genericAlt: { pageUrl: string; src: string; alt: string }[] = [];
  for (const img of allImages) {
    if (!img.alt || img.alt.trim().length === 0) continue;
    const alt = img.alt.trim();
    const isGeneric = genericAltPatterns.some((p) => p.test(alt));
    if (isGeneric) {
      genericAlt.push({ pageUrl: img.pageUrl, src: img.src, alt });
    }
  }
  const altQualityOk = genericAlt.length === 0;
  results.push({
    id: randomUUID(),
    checkId: 'IMG-002',
    checkName: 'Image alt text quality',
    pillar: 'seo',
    category: 'On-Page SEO',
    pageUrl: null,
    status: altQualityOk ? 'pass' : 'warning',
    severity: 'warning',
    score: altQualityOk
      ? 100
      : Math.max(
          0,
          100 -
            Math.round(
              (genericAlt.length / Math.max(1, allImages.length)) * 100,
            ),
        ),
    message: altQualityOk
      ? 'All alt text appears to be descriptive and meaningful.'
      : `${genericAlt.length} image(s) have generic or non-descriptive alt text (e.g., filenames, "image", "photo").`,
    details: altQualityOk ? null : { genericAlt: genericAlt.slice(0, 30) },
    recommendation: altQualityOk
      ? null
      : 'Replace generic alt text with descriptive text that explains the image content. Avoid using filenames or single words.',
    wcagCriterion: null,
    element: null,
  });

  // ── IMG-003: image file size ──────────────────────────────────────────
  const MAX_IMAGE_SIZE = 200 * 1024; // 200 KB
  const oversized: { pageUrl: string; src: string; sizeKB: number }[] = [];
  for (const img of allImages) {
    if (img.fileSize !== null && img.fileSize > MAX_IMAGE_SIZE) {
      oversized.push({
        pageUrl: img.pageUrl,
        src: img.src,
        sizeKB: Math.round(img.fileSize / 1024),
      });
    }
  }
  const sizeOk = oversized.length === 0;
  results.push({
    id: randomUUID(),
    checkId: 'IMG-003',
    checkName: 'Image file sizes',
    pillar: 'seo',
    category: 'On-Page SEO',
    pageUrl: null,
    status: sizeOk ? 'pass' : 'warning',
    severity: 'warning',
    score: sizeOk
      ? 100
      : Math.max(
          0,
          100 -
            Math.round(
              (oversized.length / Math.max(1, allImages.length)) * 100,
            ),
        ),
    message: sizeOk
      ? 'All images are under 200 KB.'
      : `${oversized.length} image(s) exceed 200 KB.`,
    details: sizeOk
      ? null
      : {
          oversized: oversized
            .sort((a, b) => b.sizeKB - a.sizeKB)
            .slice(0, 30),
        },
    recommendation: sizeOk
      ? null
      : 'Compress oversized images. Use tools like ImageOptim, Squoosh, or convert to WebP/AVIF for better compression.',
    wcagCriterion: null,
    element: null,
  });

  // ── IMG-004: explicit dimensions ──────────────────────────────────────
  const missingDimensions: { pageUrl: string; src: string }[] = [];
  for (const img of allImages) {
    if (img.width === null || img.height === null) {
      missingDimensions.push({ pageUrl: img.pageUrl, src: img.src });
    }
  }
  const dimensionsOk = missingDimensions.length === 0;
  results.push({
    id: randomUUID(),
    checkId: 'IMG-004',
    checkName: 'Images have explicit dimensions',
    pillar: 'seo',
    category: 'On-Page SEO',
    pageUrl: null,
    status: dimensionsOk ? 'pass' : 'warning',
    severity: 'warning',
    score: dimensionsOk
      ? 100
      : Math.round(
          ((allImages.length - missingDimensions.length) /
            allImages.length) *
            100,
        ),
    message: dimensionsOk
      ? 'All images have width and height attributes.'
      : `${missingDimensions.length} image(s) are missing width/height attributes, which can cause layout shifts.`,
    details: dimensionsOk
      ? null
      : { missingDimensions: missingDimensions.slice(0, 40) },
    recommendation: dimensionsOk
      ? null
      : 'Add explicit width and height attributes to all <img> tags to prevent Cumulative Layout Shift.',
    wcagCriterion: null,
    element: null,
  });

  // ── IMG-005: modern image formats ─────────────────────────────────────
  const legacyFormats: { pageUrl: string; src: string; format: string }[] = [];
  for (const img of allImages) {
    const src = img.src.toLowerCase();
    const fmt = (img.format || '').toLowerCase();
    const isLegacy =
      fmt === 'bmp' ||
      fmt === 'tiff' ||
      src.endsWith('.bmp') ||
      src.endsWith('.tiff') ||
      src.endsWith('.tif');
    if (isLegacy) {
      legacyFormats.push({
        pageUrl: img.pageUrl,
        src: img.src,
        format: fmt || src.split('.').pop() || 'unknown',
      });
    }
  }

  // Also count how many could benefit from WebP/AVIF
  const nonModernCount = allImages.filter((img) => {
    const src = img.src.toLowerCase();
    const fmt = (img.format || '').toLowerCase();
    return (
      !src.endsWith('.webp') &&
      !src.endsWith('.avif') &&
      fmt !== 'webp' &&
      fmt !== 'avif' &&
      !src.endsWith('.svg') &&
      fmt !== 'svg'
    );
  }).length;

  const modernRatio =
    allImages.length > 0
      ? (allImages.length - nonModernCount) / allImages.length
      : 1;

  results.push({
    id: randomUUID(),
    checkId: 'IMG-005',
    checkName: 'Modern image formats',
    pillar: 'seo',
    category: 'On-Page SEO',
    pageUrl: null,
    status:
      legacyFormats.length > 0
        ? 'fail'
        : modernRatio < 0.5
          ? 'info'
          : 'pass',
    severity: legacyFormats.length > 0 ? 'warning' : 'info',
    score: legacyFormats.length > 0
      ? Math.max(0, 100 - legacyFormats.length * 15)
      : Math.round(50 + modernRatio * 50),
    message:
      legacyFormats.length > 0
        ? `${legacyFormats.length} image(s) use legacy formats (BMP, TIFF). ${Math.round(modernRatio * 100)}% of images use modern formats.`
        : `${Math.round(modernRatio * 100)}% of images use modern formats (WebP, AVIF, SVG).`,
    details: {
      legacyFormats: legacyFormats.slice(0, 20),
      modernFormatPercentage: Math.round(modernRatio * 100),
      nonModernCount,
      totalImages: allImages.length,
    },
    recommendation:
      legacyFormats.length > 0 || modernRatio < 0.5
        ? 'Convert images to modern formats like WebP or AVIF for better compression and loading performance. Use <picture> with fallbacks for browser compatibility.'
        : null,
    wcagCriterion: null,
    element: null,
  });

  // ── IMG-006: lazy loading ─────────────────────────────────────────────
  // Check how many below-the-fold images use loading="lazy"
  const imagesWithoutLazy: { pageUrl: string; src: string }[] = [];
  const pagesWithManyEagerImages: { url: string; eagerCount: number }[] = [];

  for (const page of indexablePages) {
    if (page.images.length <= 1) continue;
    // First image is likely above-the-fold, skip it
    const belowFoldImages = page.images.slice(1);
    const eagerImages = belowFoldImages.filter(
      (img) => img.loading !== 'lazy',
    );
    if (eagerImages.length > 2) {
      pagesWithManyEagerImages.push({
        url: page.url,
        eagerCount: eagerImages.length,
      });
    }
    for (const img of eagerImages) {
      imagesWithoutLazy.push({ pageUrl: page.url, src: img.src });
    }
  }
  const lazyLoadOk = pagesWithManyEagerImages.length === 0;
  results.push({
    id: randomUUID(),
    checkId: 'IMG-006',
    checkName: 'Image lazy loading',
    pillar: 'seo',
    category: 'On-Page SEO',
    pageUrl: null,
    status: lazyLoadOk ? 'pass' : 'info',
    severity: 'info',
    score: lazyLoadOk
      ? 100
      : Math.max(
          0,
          100 -
            Math.round(
              (pagesWithManyEagerImages.length /
                Math.max(1, indexablePages.length)) *
                100,
            ),
        ),
    message: lazyLoadOk
      ? 'Below-the-fold images appropriately use lazy loading.'
      : `${pagesWithManyEagerImages.length} page(s) have many below-the-fold images without loading="lazy".`,
    details: lazyLoadOk
      ? null
      : {
          pagesWithManyEagerImages: pagesWithManyEagerImages.slice(0, 30),
          totalEagerBelowFold: imagesWithoutLazy.length,
        },
    recommendation: lazyLoadOk
      ? null
      : 'Add loading="lazy" to below-the-fold images. Keep above-the-fold images eager for LCP optimization.',
    wcagCriterion: null,
    element: null,
  });

  return results;
}
