import { chromium, type Browser, type Page, type Response } from 'playwright';
import type {
  AuditConfig,
  PageData,
  CrawlResult,
  CrawlLogEntry,
} from '@audit/types';
import { normalizeUrl, isSameSite, isNonHtmlResource } from './url-normalizer.js';
import { fetchAndParseRobots, type RobotsResult } from './robots-parser.js';
import { fetchSitemapUrls, type SitemapEntry } from './sitemap-parser.js';
import { extractPageData } from './page-processor.js';
import { buildLinkGraph, type LinkGraphAnalysis } from './link-graph.js';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

export interface CrawlCallbacks {
  onPageCrawled?: (url: string, index: number, total: number) => void;
  onLog?: (entry: CrawlLogEntry) => void;
}

export async function crawlSite(
  config: AuditConfig,
  callbacks?: CrawlCallbacks
): Promise<CrawlResult> {
  const startedAt = new Date();
  const log: CrawlLogEntry[] = [];

  function addLog(url: string, level: CrawlLogEntry['level'], message: string) {
    const entry: CrawlLogEntry = { url, level, message, timestamp: new Date() };
    log.push(entry);
    callbacks?.onLog?.(entry);
  }

  const baseUrl = new URL(config.url).origin;
  const storageDir = join(config.storageDir, 'crawl');
  await mkdir(join(storageDir, 'screenshots'), { recursive: true });
  await mkdir(join(storageDir, 'html'), { recursive: true });

  // Step 1: Fetch and parse robots.txt
  addLog(baseUrl, 'info', 'Fetching robots.txt...');
  const robots = await fetchAndParseRobots(baseUrl, config.userAgent);
  addLog(baseUrl, 'info', `robots.txt: ${robots.raw ? 'found' : 'not found'}`);

  // Step 2: Fetch and parse sitemaps
  const sitemapUrls = [...robots.sitemapUrls];
  // Also try default locations
  const defaultSitemaps = [
    new URL('/sitemap.xml', baseUrl).toString(),
    new URL('/sitemap_index.xml', baseUrl).toString(),
  ];
  for (const url of defaultSitemaps) {
    if (!sitemapUrls.includes(url)) sitemapUrls.push(url);
  }

  addLog(baseUrl, 'info', `Fetching sitemaps from ${sitemapUrls.length} locations...`);
  const sitemapEntries = await fetchSitemapUrls(sitemapUrls, config.userAgent);
  addLog(baseUrl, 'info', `Found ${sitemapEntries.length} URLs in sitemaps`);

  // Step 3: Build seed URL queue
  const normalizedHome = normalizeUrl(config.url, baseUrl);
  const queue: string[] = [];
  const queued = new Set<string>();
  const crawledPages: PageData[] = [];

  function enqueue(raw: string) {
    const normalized = normalizeUrl(raw, baseUrl);
    if (!normalized) return;
    if (!isSameSite(normalized, baseUrl)) return;
    if (isNonHtmlResource(normalized)) return;
    if (queued.has(normalized)) return;
    if (config.respectRobotsTxt && !robots.isAllowed(normalized)) {
      addLog(normalized, 'info', 'Blocked by robots.txt');
      return;
    }
    queued.add(normalized);
    queue.push(normalized);
  }

  // Seed: homepage first
  if (normalizedHome) enqueue(normalizedHome);

  // Seed: sitemap URLs
  for (const entry of sitemapEntries) {
    enqueue(entry.loc);
  }

  addLog(baseUrl, 'info', `Starting crawl with ${queue.length} seed URLs (max: ${config.maxPages})`);

  // Step 4: Launch browser
  let browser: Browser | null = null;

  try {
    if (config.renderJs) {
      browser = await chromium.launch({ headless: true });
    }

    // Step 5: BFS crawl
    const crawlDelay = robots.crawlDelay
      ? Math.max(robots.crawlDelay * 1000, config.crawlDelay)
      : config.crawlDelay;

    let head = 0;
    while (head < queue.length && crawledPages.length < config.maxPages) {
      const url = queue[head++];

      try {
        const pageData = await crawlPage(
          url,
          baseUrl,
          config,
          browser,
          storageDir,
          crawledPages.length
        );

        crawledPages.push(pageData);
        callbacks?.onPageCrawled?.(url, crawledPages.length, Math.min(queue.length, config.maxPages));

        // Discover new URLs from internal links
        for (const link of pageData.internalLinks) {
          enqueue(link.href);
        }

        addLog(url, 'info', `Crawled (${pageData.statusCode}) — ${pageData.wordCount} words, ${pageData.internalLinks.length} internal links`);
      } catch (err) {
        addLog(url, 'error', `Failed to crawl: ${err instanceof Error ? err.message : String(err)}`);
      }

      // Rate limiting
      if (head < queue.length && crawledPages.length < config.maxPages) {
        await sleep(crawlDelay);
      }
    }
  } finally {
    if (browser) await browser.close();
  }

  addLog(baseUrl, 'info', `Crawl complete: ${crawledPages.length} pages crawled`);

  // Step 6: Build link graph
  const linkGraph = buildLinkGraph(crawledPages, normalizedHome ?? config.url);

  const completedAt = new Date();

  return {
    pages: crawledPages,
    robotsTxt: robots.raw || null,
    sitemapUrls: sitemapEntries.map((e) => e.loc),
    linkGraph: linkGraph.edges,
    crawlLog: log,
    startedAt,
    completedAt,
  };
}

async function crawlPage(
  url: string,
  baseUrl: string,
  config: AuditConfig,
  browser: Browser | null,
  storageDir: string,
  index: number
): Promise<PageData> {
  const crawledAt = new Date();

  // HTTP fetch (raw HTML, no JS)
  const redirectChain: { url: string; statusCode: number }[] = [];
  let finalUrl = url;
  let statusCode = 0;
  let rawHtml = '';
  let responseHeaders: Record<string, string> = {};

  const response = await fetch(url, {
    headers: { 'User-Agent': config.userAgent },
    redirect: 'follow',
    signal: AbortSignal.timeout(30000),
  });

  statusCode = response.status;
  finalUrl = response.url;
  const hdrs: Record<string, string> = {};
  response.headers.forEach((value, key) => { hdrs[key] = value; });
  responseHeaders = hdrs;
  rawHtml = await response.text();

  // Extract data from raw HTML
  const extracted = extractPageData(
    rawHtml,
    finalUrl,
    url,
    statusCode,
    redirectChain,
    responseHeaders,
    baseUrl
  );

  // JS rendering with Playwright (if enabled and browser available)
  let renderedHtml = rawHtml;
  let isJsDependent = false;
  let loadTiming: PageData['loadTiming'] = {
    ttfb: 0, fcp: 0, lcp: 0, domComplete: 0, fullyLoaded: 0,
  };
  let totalResourceSize = extracted.pageSize;
  let screenshotDesktopPath: string | null = null;
  let screenshotMobilePath: string | null = null;

  if (browser && statusCode === 200) {
    let page: Page | null = null;
    try {
      const context = await browser.newContext({
        userAgent: config.userAgent,
        viewport: { width: 1440, height: 900 },
      });
      page = await context.newPage();

      // Track resource sizes
      let resourceBytes = 0;
      page.on('response', (res) => {
        const headers = res.headers();
        const size = parseInt(headers['content-length'] ?? '0', 10);
        resourceBytes += size;
      });

      const startTime = Date.now();
      let ttfb = 0;

      page.on('response', (res) => {
        if (res.url() === url && ttfb === 0) {
          ttfb = Date.now() - startTime;
        }
      });

      await page.goto(url, {
        waitUntil: 'networkidle',
        timeout: 60000,
      });

      const domComplete = Date.now() - startTime;

      // Get rendered HTML
      renderedHtml = await page.content();
      totalResourceSize = resourceBytes || extracted.pageSize;

      // Check JS dependency: compare raw vs rendered word counts
      const renderedText = await page.evaluate(() => {
        const clone = document.body.cloneNode(true) as HTMLElement;
        clone.querySelectorAll('nav, header, footer, aside, script, style, noscript').forEach(el => el.remove());
        return clone.textContent?.replace(/\s+/g, ' ').trim() ?? '';
      });
      const renderedWordCount = renderedText.split(/\s+/).filter(Boolean).length;
      isJsDependent = Math.abs(renderedWordCount - extracted.wordCount) > extracted.wordCount * 0.2;

      // Performance timing
      const perfTiming = await page.evaluate(() => {
        const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
        const paintEntries = performance.getEntriesByType('paint');
        const fcp = paintEntries.find(e => e.name === 'first-contentful-paint');
        return {
          ttfb: nav?.responseStart ?? 0,
          fcp: fcp?.startTime ?? 0,
          domComplete: nav?.domComplete ?? 0,
          fullyLoaded: nav?.loadEventEnd ?? 0,
        };
      });

      loadTiming = {
        ttfb: perfTiming.ttfb || ttfb,
        fcp: perfTiming.fcp,
        lcp: 0, // LCP requires PerformanceObserver, simplified
        domComplete: perfTiming.domComplete || domComplete,
        fullyLoaded: perfTiming.fullyLoaded || domComplete,
      };

      // Screenshots
      for (const vp of config.screenshotViewports) {
        await page.setViewportSize({ width: vp.width, height: vp.height });
        await sleep(500); // Let layout settle

        const filename = `page-${index}-${vp.label}.png`;
        const filepath = join(storageDir, 'screenshots', filename);
        await page.screenshot({ path: filepath, fullPage: true });

        if (vp.label === 'desktop') screenshotDesktopPath = filepath;
        if (vp.label === 'mobile') screenshotMobilePath = filepath;
      }

      await context.close();
    } catch (err) {
      // Rendering failed — use raw HTML data
      if (page) {
        try { await page.context().close(); } catch { /* ignore */ }
      }
    }
  }

  // If JS-dependent, re-extract from rendered HTML
  let finalExtracted = extracted;
  if (isJsDependent && renderedHtml !== rawHtml) {
    finalExtracted = extractPageData(
      renderedHtml,
      finalUrl,
      url,
      statusCode,
      redirectChain,
      responseHeaders,
      baseUrl
    );
  }

  return {
    ...finalExtracted,
    renderedHtml,
    isJsDependent,
    screenshotDesktopPath,
    screenshotMobilePath,
    totalResourceSize,
    loadTiming,
    crawledAt,
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
