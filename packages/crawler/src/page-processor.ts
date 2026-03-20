import * as cheerio from 'cheerio';
import type {
  PageData,
  HeadingData,
  ImageData,
  LinkData,
  ExternalLinkData,
  LoadTimingData,
} from '@audit/types';
import { isSameSite, getDomain, normalizeUrl } from './url-normalizer.js';

/**
 * Extracts all structured data from raw HTML.
 */
export function extractPageData(
  html: string,
  url: string,
  requestUrl: string,
  statusCode: number,
  redirectChain: { url: string; statusCode: number }[],
  responseHeaders: Record<string, string>,
  baseUrl: string
): Omit<PageData, 'renderedHtml' | 'isJsDependent' | 'screenshotDesktopPath' | 'screenshotMobilePath' | 'totalResourceSize' | 'loadTiming' | 'crawledAt'> {
  const $ = cheerio.load(html);

  // Title
  const title = $('title').first().text().trim() || null;

  // Meta description
  const metaDescription =
    $('meta[name="description"]').attr('content')?.trim() ?? null;

  // Meta robots
  const metaRobots =
    $('meta[name="robots"]').attr('content')?.trim() ?? null;

  // Canonical
  const canonicalUrl =
    $('link[rel="canonical"]').attr('href')?.trim() ?? null;

  // Language
  const language = $('html').attr('lang')?.trim() ?? null;

  // Headings
  const headings: HeadingData[] = [];
  $('h1, h2, h3, h4, h5, h6').each((_, el) => {
    const tagName = ((el as any).tagName ?? '').toLowerCase();
    const level = parseInt(tagName.charAt(1), 10);
    const text = $(el).text().trim();
    headings.push({ level, text });
  });

  // Images
  const images: ImageData[] = [];
  $('img').each((_, el) => {
    const $el = $(el);
    images.push({
      src: $el.attr('src') ?? '',
      alt: $el.attr('alt') ?? null,
      width: $el.attr('width') ? parseInt($el.attr('width')!, 10) : null,
      height: $el.attr('height') ? parseInt($el.attr('height')!, 10) : null,
      loading: $el.attr('loading') ?? null,
      fileSize: null, // populated later if needed
      format: null,
    });
  });

  // Links
  const internalLinks: LinkData[] = [];
  const externalLinks: ExternalLinkData[] = [];

  $('a[href]').each((_, el) => {
    const $el = $(el);
    const href = $el.attr('href')?.trim();
    if (!href || href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:') || href.startsWith('javascript:')) {
      return;
    }

    const resolved = normalizeUrl(href, url);
    if (!resolved) return;

    const anchorText = $el.text().trim();
    const rel = $el.attr('rel') ?? null;
    const isNav = !!$el.closest('nav, header, footer').length;

    if (isSameSite(resolved, baseUrl)) {
      internalLinks.push({ href: resolved, anchorText, rel, isNav });
    } else {
      const domain = getDomain(resolved);
      externalLinks.push({
        href: resolved,
        anchorText,
        rel,
        isNav,
        domain: domain ?? '',
      });
    }
  });

  // Schema markup (JSON-LD)
  const schemaMarkup: unknown[] = [];
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const text = $(el).html();
      if (text) {
        schemaMarkup.push(JSON.parse(text));
      }
    } catch {
      // Invalid JSON-LD — will be flagged by schema audit
    }
  });

  // Open Graph tags
  const ogTags: Record<string, string> = {};
  $('meta[property^="og:"]').each((_, el) => {
    const property = $(el).attr('property');
    const content = $(el).attr('content');
    if (property && content) ogTags[property] = content;
  });

  // Twitter Card tags
  const twitterTags: Record<string, string> = {};
  $('meta[name^="twitter:"]').each((_, el) => {
    const name = $(el).attr('name');
    const content = $(el).attr('content');
    if (name && content) twitterTags[name] = content;
  });

  // Content text extraction (strip nav, header, footer, sidebar, ads)
  const $content = $.root().clone();
  $content.find('nav, header, footer, aside, script, style, noscript, [role="navigation"], [role="banner"], [role="contentinfo"]').remove();
  const contentText = $content.text().replace(/\s+/g, ' ').trim();
  const wordCount = contentText.split(/\s+/).filter(Boolean).length;

  const pageSize = Buffer.byteLength(html, 'utf-8');

  return {
    url,
    requestUrl,
    statusCode,
    redirectChain,
    responseHeaders,
    canonicalUrl,
    metaRobots,
    title,
    metaDescription,
    headings,
    images,
    internalLinks,
    externalLinks,
    schemaMarkup,
    ogTags,
    twitterTags,
    contentText,
    wordCount,
    language,
    rawHtml: html,
    pageSize,
  };
}
