import { parseStringPromise } from 'xml2js';

export interface SitemapEntry {
  loc: string;
  lastmod: string | null;
  changefreq: string | null;
  priority: string | null;
}

/**
 * Fetches and parses XML sitemaps. Handles sitemap index files recursively.
 */
export async function fetchSitemapUrls(
  sitemapUrls: string[],
  userAgent: string
): Promise<SitemapEntry[]> {
  const entries: SitemapEntry[] = [];
  const visited = new Set<string>();

  async function processSitemap(url: string): Promise<void> {
    if (visited.has(url)) return;
    visited.add(url);

    let xml: string;
    try {
      const response = await fetch(url, {
        headers: { 'User-Agent': userAgent },
        signal: AbortSignal.timeout(30000),
      });
      if (!response.ok) return;
      xml = await response.text();
    } catch {
      return;
    }

    let parsed: Record<string, unknown>;
    try {
      parsed = await parseStringPromise(xml, { explicitArray: false });
    } catch {
      return;
    }

    // Sitemap index — contains references to other sitemaps
    if (parsed.sitemapindex) {
      const index = parsed.sitemapindex as Record<string, unknown>;
      const sitemaps = Array.isArray(index.sitemap)
        ? index.sitemap
        : index.sitemap
          ? [index.sitemap]
          : [];
      for (const sm of sitemaps as Record<string, string>[]) {
        if (sm.loc) {
          await processSitemap(sm.loc);
        }
      }
      return;
    }

    // Regular sitemap — contains URLs
    if (parsed.urlset) {
      const urlset = parsed.urlset as Record<string, unknown>;
      const urls = Array.isArray(urlset.url)
        ? urlset.url
        : urlset.url
          ? [urlset.url]
          : [];
      for (const entry of urls as Record<string, string>[]) {
        if (entry.loc) {
          entries.push({
            loc: entry.loc,
            lastmod: entry.lastmod ?? null,
            changefreq: entry.changefreq ?? null,
            priority: entry.priority ?? null,
          });
        }
      }
    }
  }

  // Also try common sitemap locations
  const urlsToTry = [...new Set(sitemapUrls)];
  await Promise.allSettled(urlsToTry.map((url) => processSitemap(url)));

  return entries;
}
