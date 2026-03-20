import type { CheckResult, PageData } from '@audit/types';
import { randomUUID } from 'crypto';

/**
 * PERF-001 through PERF-011
 * Audits performance metrics derived from PageData.
 */
export function runPerformanceAudit(pages: PageData[]): CheckResult[] {
  const results: CheckResult[] = [];
  const okPages = pages.filter((p) => p.statusCode === 200);

  if (okPages.length === 0) return results;

  // ── PERF-001: Largest Contentful Paint (LCP) ──────────────────────────
  const lcpThresholdGood = 2500;
  const lcpThresholdPoor = 4000;
  const lcpPages = okPages.filter((p) => p.loadTiming && p.loadTiming.lcp > 0);
  const slowLcp: { url: string; lcp: number }[] = [];
  for (const page of lcpPages) {
    if (page.loadTiming.lcp > lcpThresholdGood) {
      slowLcp.push({ url: page.url, lcp: page.loadTiming.lcp });
    }
  }
  const avgLcp =
    lcpPages.length > 0
      ? lcpPages.reduce((s, p) => s + p.loadTiming.lcp, 0) / lcpPages.length
      : 0;
  results.push({
    id: randomUUID(),
    checkId: 'PERF-001',
    checkName: 'Largest Contentful Paint (LCP)',
    pillar: 'seo',
    category: 'Performance',
    pageUrl: null,
    status:
      avgLcp <= lcpThresholdGood
        ? 'pass'
        : avgLcp <= lcpThresholdPoor
          ? 'warning'
          : 'fail',
    severity: avgLcp > lcpThresholdPoor ? 'high' : 'warning',
    score:
      avgLcp <= lcpThresholdGood
        ? 100
        : avgLcp <= lcpThresholdPoor
          ? Math.round(50 + ((lcpThresholdPoor - avgLcp) / (lcpThresholdPoor - lcpThresholdGood)) * 50)
          : Math.max(0, Math.round(50 - ((avgLcp - lcpThresholdPoor) / lcpThresholdPoor) * 50)),
    message: `Average LCP: ${Math.round(avgLcp)}ms across ${lcpPages.length} page(s). ${slowLcp.length} page(s) exceed the 2.5s threshold.`,
    details: {
      averageLcp: Math.round(avgLcp),
      measured: lcpPages.length,
      slowPages: slowLcp
        .sort((a, b) => b.lcp - a.lcp)
        .slice(0, 20),
    },
    recommendation:
      avgLcp > lcpThresholdGood
        ? 'Optimize LCP by reducing server response times, eliminating render-blocking resources, optimizing images, and preloading critical assets.'
        : null,
    wcagCriterion: null,
    element: null,
  });

  // ── PERF-002: Cumulative Layout Shift (CLS) — approximated ────────────
  // We don't have CLS directly; check for images without dimensions as a proxy
  let pagesWithUnsizedImages = 0;
  const unsizedImagePages: { url: string; count: number }[] = [];
  for (const page of okPages) {
    const unsized = page.images.filter(
      (img) => img.width === null || img.height === null,
    );
    if (unsized.length > 0) {
      pagesWithUnsizedImages++;
      unsizedImagePages.push({ url: page.url, count: unsized.length });
    }
  }
  const unsizedRatio = okPages.length > 0 ? pagesWithUnsizedImages / okPages.length : 0;
  results.push({
    id: randomUUID(),
    checkId: 'PERF-002',
    checkName: 'Cumulative Layout Shift (CLS) risk — unsized images',
    pillar: 'seo',
    category: 'Performance',
    pageUrl: null,
    status: unsizedRatio === 0 ? 'pass' : unsizedRatio > 0.3 ? 'fail' : 'warning',
    severity: unsizedRatio > 0.3 ? 'high' : 'warning',
    score: Math.max(0, Math.round((1 - unsizedRatio) * 100)),
    message:
      pagesWithUnsizedImages === 0
        ? 'All images have explicit width and height attributes, minimizing CLS risk.'
        : `${pagesWithUnsizedImages} page(s) contain images without explicit dimensions, increasing CLS risk.`,
    details: { unsizedImagePages: unsizedImagePages.slice(0, 30) },
    recommendation:
      pagesWithUnsizedImages > 0
        ? 'Add explicit width and height attributes to all <img> tags to prevent layout shifts when images load.'
        : null,
    wcagCriterion: null,
    element: null,
  });

  // ── PERF-003: Total Blocking Time / INP proxy ─────────────────────────
  // Use the gap between FCP and DOM complete as a rough TBT proxy
  const tbtProxies: { url: string; estimate: number }[] = [];
  for (const page of okPages) {
    if (page.loadTiming.fcp > 0 && page.loadTiming.domComplete > 0) {
      const estimate = page.loadTiming.domComplete - page.loadTiming.fcp;
      if (estimate > 300) {
        tbtProxies.push({ url: page.url, estimate });
      }
    }
  }
  const avgTbtProxy =
    okPages.length > 0
      ? okPages.reduce((s, p) => {
          const e = p.loadTiming.domComplete - p.loadTiming.fcp;
          return s + Math.max(0, e);
        }, 0) / okPages.length
      : 0;
  results.push({
    id: randomUUID(),
    checkId: 'PERF-003',
    checkName: 'Total Blocking Time (TBT) estimate',
    pillar: 'seo',
    category: 'Performance',
    pageUrl: null,
    status: avgTbtProxy <= 200 ? 'pass' : avgTbtProxy <= 600 ? 'warning' : 'fail',
    severity: avgTbtProxy > 600 ? 'high' : 'warning',
    score:
      avgTbtProxy <= 200
        ? 100
        : avgTbtProxy <= 600
          ? Math.round(50 + ((600 - avgTbtProxy) / 400) * 50)
          : Math.max(0, Math.round(50 - ((avgTbtProxy - 600) / 600) * 50)),
    message: `Estimated average main thread blocking: ${Math.round(avgTbtProxy)}ms. ${tbtProxies.length} page(s) may have significant blocking.`,
    details: {
      averageEstimate: Math.round(avgTbtProxy),
      slowPages: tbtProxies.sort((a, b) => b.estimate - a.estimate).slice(0, 20),
    },
    recommendation:
      avgTbtProxy > 200
        ? 'Reduce JavaScript execution time. Defer non-critical scripts, code-split large bundles, and minimize long tasks.'
        : null,
    wcagCriterion: null,
    element: null,
  });

  // ── PERF-004: Time to First Byte (TTFB) ──────────────────────────────
  const ttfbGood = 800;
  const ttfbPoor = 1800;
  const slowTtfb: { url: string; ttfb: number }[] = [];
  for (const page of okPages) {
    if (page.loadTiming.ttfb > ttfbGood) {
      slowTtfb.push({ url: page.url, ttfb: page.loadTiming.ttfb });
    }
  }
  const avgTtfb =
    okPages.length > 0
      ? okPages.reduce((s, p) => s + p.loadTiming.ttfb, 0) / okPages.length
      : 0;
  results.push({
    id: randomUUID(),
    checkId: 'PERF-004',
    checkName: 'Time to First Byte (TTFB)',
    pillar: 'seo',
    category: 'Performance',
    pageUrl: null,
    status: avgTtfb <= ttfbGood ? 'pass' : avgTtfb <= ttfbPoor ? 'warning' : 'fail',
    severity: avgTtfb > ttfbPoor ? 'high' : 'warning',
    score:
      avgTtfb <= ttfbGood
        ? 100
        : avgTtfb <= ttfbPoor
          ? Math.round(50 + ((ttfbPoor - avgTtfb) / (ttfbPoor - ttfbGood)) * 50)
          : Math.max(0, Math.round(50 - ((avgTtfb - ttfbPoor) / ttfbPoor) * 50)),
    message: `Average TTFB: ${Math.round(avgTtfb)}ms. ${slowTtfb.length} page(s) exceed the 800ms threshold.`,
    details: {
      averageTtfb: Math.round(avgTtfb),
      slowPages: slowTtfb.sort((a, b) => b.ttfb - a.ttfb).slice(0, 20),
    },
    recommendation:
      avgTtfb > ttfbGood
        ? 'Improve server response times. Consider server-side caching, a CDN, database optimization, or upgrading hosting.'
        : null,
    wcagCriterion: null,
    element: null,
  });

  // ── PERF-005: page weight ─────────────────────────────────────────────
  const maxPageWeight = 3 * 1024 * 1024; // 3 MB
  const heavyPages: { url: string; totalSize: number }[] = [];
  for (const page of okPages) {
    if (page.totalResourceSize > maxPageWeight) {
      heavyPages.push({ url: page.url, totalSize: page.totalResourceSize });
    }
  }
  const avgWeight =
    okPages.length > 0
      ? okPages.reduce((s, p) => s + p.totalResourceSize, 0) / okPages.length
      : 0;
  results.push({
    id: randomUUID(),
    checkId: 'PERF-005',
    checkName: 'Total page weight',
    pillar: 'seo',
    category: 'Performance',
    pageUrl: null,
    status: heavyPages.length === 0 ? 'pass' : heavyPages.length > okPages.length * 0.3 ? 'fail' : 'warning',
    severity: heavyPages.length > okPages.length * 0.3 ? 'high' : 'warning',
    score: Math.max(0, Math.round((1 - heavyPages.length / Math.max(1, okPages.length)) * 100)),
    message: `Average page weight: ${(avgWeight / 1024).toFixed(0)} KB. ${heavyPages.length} page(s) exceed the 3 MB threshold.`,
    details: {
      averageWeightKB: Math.round(avgWeight / 1024),
      heavyPages: heavyPages
        .sort((a, b) => b.totalSize - a.totalSize)
        .slice(0, 20)
        .map((p) => ({
          url: p.url,
          totalSizeKB: Math.round(p.totalSize / 1024),
        })),
    },
    recommendation:
      heavyPages.length > 0
        ? 'Reduce page weight by compressing images, minifying CSS/JS, removing unused code, and lazy-loading non-critical resources.'
        : null,
    wcagCriterion: null,
    element: null,
  });

  // ── PERF-006: render-blocking resources (check raw HTML for sync scripts/styles) ──
  const renderBlockingPages: { url: string; blockingCount: number }[] = [];
  for (const page of okPages) {
    const html = page.rawHtml || '';
    // Count sync script tags in <head>
    const headMatch = html.match(/<head[^>]*>([\s\S]*?)<\/head>/i);
    if (headMatch) {
      const headContent = headMatch[1];
      // Scripts without async or defer
      const scripts = headContent.match(/<script\b[^>]*src=[^>]*>/gi) || [];
      const blockingScripts = scripts.filter(
        (s) => !s.includes('async') && !s.includes('defer'),
      );
      // Stylesheet link tags
      const styleLinks = (headContent.match(/<link\b[^>]*rel=["']stylesheet["'][^>]*>/gi) || []);
      // Filter out those with media="print" etc.
      const blockingStyles = styleLinks.filter(
        (s) => !s.includes('media="print"') && !s.includes("media='print'"),
      );
      const total = blockingScripts.length + blockingStyles.length;
      if (total > 3) {
        renderBlockingPages.push({ url: page.url, blockingCount: total });
      }
    }
  }
  const noRenderBlocking = renderBlockingPages.length === 0;
  results.push({
    id: randomUUID(),
    checkId: 'PERF-006',
    checkName: 'Render-blocking resources',
    pillar: 'seo',
    category: 'Performance',
    pageUrl: null,
    status: noRenderBlocking ? 'pass' : 'warning',
    severity: 'warning',
    score: noRenderBlocking
      ? 100
      : Math.max(0, 100 - Math.round((renderBlockingPages.length / Math.max(1, okPages.length)) * 100)),
    message: noRenderBlocking
      ? 'No pages have excessive render-blocking resources in the <head>.'
      : `${renderBlockingPages.length} page(s) have more than 3 render-blocking resources in the <head>.`,
    details: noRenderBlocking ? null : { renderBlockingPages: renderBlockingPages.slice(0, 30) },
    recommendation: noRenderBlocking
      ? null
      : 'Add async or defer attributes to non-critical scripts. Inline critical CSS and load the rest asynchronously.',
    wcagCriterion: null,
    element: null,
  });

  // ── PERF-007: image optimization ──────────────────────────────────────
  const largeImageThreshold = 200 * 1024; // 200 KB
  const oversizedImages: { pageUrl: string; src: string; size: number }[] = [];
  const unoptimizedFormats: { pageUrl: string; src: string; format: string | null }[] = [];

  for (const page of okPages) {
    for (const img of page.images) {
      if (img.fileSize !== null && img.fileSize > largeImageThreshold) {
        oversizedImages.push({
          pageUrl: page.url,
          src: img.src,
          size: img.fileSize,
        });
      }
      // Check for legacy formats
      const fmt = img.format?.toLowerCase() || '';
      const src = img.src.toLowerCase();
      if (
        fmt === 'bmp' ||
        fmt === 'tiff' ||
        src.endsWith('.bmp') ||
        src.endsWith('.tiff') ||
        src.endsWith('.tif')
      ) {
        unoptimizedFormats.push({ pageUrl: page.url, src: img.src, format: img.format });
      }
    }
  }
  const imageOptOk = oversizedImages.length === 0 && unoptimizedFormats.length === 0;
  results.push({
    id: randomUUID(),
    checkId: 'PERF-007',
    checkName: 'Image optimization',
    pillar: 'seo',
    category: 'Performance',
    pageUrl: null,
    status: imageOptOk ? 'pass' : 'warning',
    severity: 'warning',
    score: imageOptOk
      ? 100
      : Math.max(0, 100 - oversizedImages.length * 5 - unoptimizedFormats.length * 10),
    message: imageOptOk
      ? 'All images appear to be reasonably optimized.'
      : `${oversizedImages.length} oversized image(s) (>200 KB) and ${unoptimizedFormats.length} image(s) in legacy formats detected.`,
    details: {
      oversized: oversizedImages.slice(0, 30).map((i) => ({
        ...i,
        sizeKB: Math.round(i.size / 1024),
      })),
      legacyFormats: unoptimizedFormats.slice(0, 20),
    },
    recommendation: imageOptOk
      ? null
      : 'Compress oversized images and convert legacy formats (BMP, TIFF) to modern formats like WebP or AVIF.',
    wcagCriterion: null,
    element: null,
  });

  // ── PERF-008: HTTP/2 usage ────────────────────────────────────────────
  // Check via response headers for alt-svc or similar indicators
  // In practice this is best detected from protocol info; we check headers heuristically
  const http1Pages: string[] = [];
  for (const page of okPages) {
    const headers = page.responseHeaders;
    // If server sends an 'upgrade' header or lacks 'alt-svc', it might be HTTP/1
    // This is a heuristic; real detection requires protocol inspection
    const server = headers['server'] || headers['Server'] || '';
    // We'll flag pages where we see no evidence of HTTP/2
    // Check for the absence of any HTTP/2-indicating headers
    const hasAltSvc = !!(headers['alt-svc'] || headers['Alt-Svc']);
    // Some servers don't expose protocol in headers — skip those
    // Only flag if explicitly HTTP/1.1 indicated by via header
    const via = headers['via'] || headers['Via'] || '';
    if (via.includes('1.1') && !via.includes('2') && !hasAltSvc) {
      http1Pages.push(page.url);
    }
  }
  const http2Ok = http1Pages.length === 0;
  results.push({
    id: randomUUID(),
    checkId: 'PERF-008',
    checkName: 'HTTP/2 usage',
    pillar: 'seo',
    category: 'Performance',
    pageUrl: null,
    status: http2Ok ? 'pass' : 'info',
    severity: 'info',
    score: http2Ok ? 100 : 70,
    message: http2Ok
      ? 'No evidence of HTTP/1.1-only responses detected.'
      : `${http1Pages.length} page(s) may be served over HTTP/1.1 based on response headers.`,
    details: http2Ok ? null : { http1Pages: http1Pages.slice(0, 20) },
    recommendation: http2Ok
      ? null
      : 'Ensure your server supports HTTP/2 for faster multiplexed connections and reduced latency.',
    wcagCriterion: null,
    element: null,
  });

  // ── PERF-009: compression (gzip/br) ───────────────────────────────────
  const uncompressedPages: string[] = [];
  for (const page of okPages) {
    const encoding =
      page.responseHeaders['content-encoding'] ||
      page.responseHeaders['Content-Encoding'] ||
      '';
    if (
      !encoding.includes('gzip') &&
      !encoding.includes('br') &&
      !encoding.includes('deflate')
    ) {
      // Only flag HTML pages (not assets)
      if (page.pageSize > 1024) {
        uncompressedPages.push(page.url);
      }
    }
  }
  const compressionOk = uncompressedPages.length === 0;
  results.push({
    id: randomUUID(),
    checkId: 'PERF-009',
    checkName: 'Text compression enabled',
    pillar: 'seo',
    category: 'Performance',
    pageUrl: null,
    status: compressionOk ? 'pass' : 'warning',
    severity: 'warning',
    score: compressionOk
      ? 100
      : Math.max(0, 100 - Math.round((uncompressedPages.length / Math.max(1, okPages.length)) * 100)),
    message: compressionOk
      ? 'All pages are served with text compression (gzip, Brotli, or deflate).'
      : `${uncompressedPages.length} page(s) are served without text compression.`,
    details: compressionOk ? null : { uncompressedPages: uncompressedPages.slice(0, 30) },
    recommendation: compressionOk
      ? null
      : 'Enable gzip or Brotli compression on your server for HTML, CSS, and JavaScript responses.',
    wcagCriterion: null,
    element: null,
  });

  // ── PERF-010: caching headers ─────────────────────────────────────────
  const noCachePages: string[] = [];
  for (const page of okPages) {
    const cacheControl =
      page.responseHeaders['cache-control'] ||
      page.responseHeaders['Cache-Control'] ||
      '';
    const expires =
      page.responseHeaders['expires'] || page.responseHeaders['Expires'] || '';
    if (!cacheControl && !expires) {
      noCachePages.push(page.url);
    } else if (cacheControl.includes('no-store') || cacheControl.includes('no-cache')) {
      // These pages explicitly opt out — that's fine for dynamic content
    }
  }
  const cachingOk = noCachePages.length === 0;
  results.push({
    id: randomUUID(),
    checkId: 'PERF-010',
    checkName: 'Browser caching headers',
    pillar: 'seo',
    category: 'Performance',
    pageUrl: null,
    status: cachingOk ? 'pass' : 'info',
    severity: 'info',
    score: cachingOk
      ? 100
      : Math.max(0, 100 - Math.round((noCachePages.length / Math.max(1, okPages.length)) * 50)),
    message: cachingOk
      ? 'All pages include caching headers (Cache-Control or Expires).'
      : `${noCachePages.length} page(s) have no caching headers.`,
    details: cachingOk ? null : { noCachePages: noCachePages.slice(0, 30) },
    recommendation: cachingOk
      ? null
      : 'Add Cache-Control headers to improve repeat visit performance. Set appropriate max-age values for static assets.',
    wcagCriterion: null,
    element: null,
  });

  // ── PERF-011: fully loaded time ───────────────────────────────────────
  const fullyLoadedThreshold = 5000; // 5 seconds
  const slowPages: { url: string; fullyLoaded: number }[] = [];
  for (const page of okPages) {
    if (page.loadTiming.fullyLoaded > fullyLoadedThreshold) {
      slowPages.push({ url: page.url, fullyLoaded: page.loadTiming.fullyLoaded });
    }
  }
  const avgFullyLoaded =
    okPages.length > 0
      ? okPages.reduce((s, p) => s + p.loadTiming.fullyLoaded, 0) / okPages.length
      : 0;
  results.push({
    id: randomUUID(),
    checkId: 'PERF-011',
    checkName: 'Fully loaded time',
    pillar: 'seo',
    category: 'Performance',
    pageUrl: null,
    status: slowPages.length === 0 ? 'pass' : avgFullyLoaded > fullyLoadedThreshold ? 'fail' : 'warning',
    severity: avgFullyLoaded > fullyLoadedThreshold ? 'high' : 'warning',
    score:
      slowPages.length === 0
        ? 100
        : Math.max(0, 100 - Math.round((slowPages.length / Math.max(1, okPages.length)) * 100)),
    message: `Average fully loaded time: ${Math.round(avgFullyLoaded)}ms. ${slowPages.length} page(s) exceed the 5s threshold.`,
    details: {
      averageFullyLoadedMs: Math.round(avgFullyLoaded),
      slowPages: slowPages
        .sort((a, b) => b.fullyLoaded - a.fullyLoaded)
        .slice(0, 20),
    },
    recommendation:
      slowPages.length > 0
        ? 'Reduce fully loaded time by optimizing critical rendering path, lazy-loading below-the-fold content, and reducing resource sizes.'
        : null,
    wcagCriterion: null,
    element: null,
  });

  return results;
}
