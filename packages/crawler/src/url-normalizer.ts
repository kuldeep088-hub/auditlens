/**
 * Normalizes URLs for consistent comparison and deduplication.
 */
export function normalizeUrl(raw: string, baseUrl: string): string | null {
  try {
    const url = new URL(raw, baseUrl);

    // Only crawl http/https
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;

    // Remove fragment
    url.hash = '';

    // Lowercase hostname
    url.hostname = url.hostname.toLowerCase();

    // Remove default ports
    if (url.port === '80' || url.port === '443') url.port = '';

    // Remove trailing slash on paths (except root)
    if (url.pathname.length > 1 && url.pathname.endsWith('/')) {
      url.pathname = url.pathname.slice(0, -1);
    }

    // Sort query parameters for consistency
    const params = new URLSearchParams(url.search);
    const sorted = new URLSearchParams([...params.entries()].sort());
    url.search = sorted.toString();

    // Remove common tracking parameters
    const trackingParams = [
      'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
      'fbclid', 'gclid', 'msclkid', 'mc_cid', 'mc_eid',
    ];
    for (const param of trackingParams) {
      url.searchParams.delete(param);
    }

    return url.toString();
  } catch {
    return null;
  }
}

/**
 * Extracts the domain (hostname) from a URL string.
 */
export function getDomain(urlStr: string): string | null {
  try {
    return new URL(urlStr).hostname;
  } catch {
    return null;
  }
}

/**
 * Checks if a URL belongs to the same site (same hostname).
 */
export function isSameSite(urlStr: string, baseUrl: string): boolean {
  try {
    const url = new URL(urlStr, baseUrl);
    const base = new URL(baseUrl);
    return url.hostname === base.hostname;
  } catch {
    return false;
  }
}

/**
 * Checks if URL points to a non-HTML resource.
 */
const NON_HTML_EXTENSIONS = new Set([
  '.pdf', '.zip', '.gz', '.tar', '.rar', '.7z',
  '.jpg', '.jpeg', '.png', '.gif', '.svg', '.webp', '.avif', '.ico', '.bmp',
  '.mp4', '.mp3', '.avi', '.mov', '.wmv', '.flv', '.webm', '.ogg',
  '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
  '.css', '.js', '.json', '.xml', '.rss', '.atom',
  '.woff', '.woff2', '.ttf', '.eot', '.otf',
  '.exe', '.dmg', '.msi', '.deb', '.rpm',
]);

export function isNonHtmlResource(urlStr: string): boolean {
  try {
    const pathname = new URL(urlStr).pathname.toLowerCase();
    return [...NON_HTML_EXTENSIONS].some((ext) => pathname.endsWith(ext));
  } catch {
    return false;
  }
}
