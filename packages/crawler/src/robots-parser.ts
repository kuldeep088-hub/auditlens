import robotsParser from 'robots-parser';

export interface RobotsResult {
  raw: string;
  sitemapUrls: string[];
  isAllowed: (url: string, userAgent?: string) => boolean;
  crawlDelay: number | null;
  aiBotsBlocked: Record<string, boolean>;
}

const AI_BOTS = [
  'GPTBot',
  'OAI-SearchBot',
  'ClaudeBot',
  'anthropic-ai',
  'PerplexityBot',
  'Google-Extended',
  'Bytespider',
  'CCBot',
  'Applebot-Extended',
  'Amazonbot',
  'FacebookBot',
  'cohere-ai',
];

export async function fetchAndParseRobots(
  baseUrl: string,
  userAgent: string
): Promise<RobotsResult> {
  const robotsUrl = new URL('/robots.txt', baseUrl).toString();

  let raw = '';
  try {
    const response = await fetch(robotsUrl, {
      headers: { 'User-Agent': userAgent },
      signal: AbortSignal.timeout(10000),
    });
    if (response.ok) {
      raw = await response.text();
    }
  } catch {
    // robots.txt not available — everything is allowed
  }

  const parser = robotsParser(robotsUrl, raw);

  // Extract sitemap URLs from robots.txt
  const sitemapUrls: string[] = [];
  for (const line of raw.split('\n')) {
    const match = line.match(/^Sitemap:\s*(.+)/i);
    if (match) {
      sitemapUrls.push(match[1].trim());
    }
  }

  // Check crawl delay for our user agent
  const crawlDelay = parser.getCrawlDelay(userAgent) ?? null;

  // Check which AI bots are blocked
  const aiBotsBlocked: Record<string, boolean> = {};
  for (const bot of AI_BOTS) {
    aiBotsBlocked[bot] = !parser.isAllowed(baseUrl, bot);
  }

  return {
    raw,
    sitemapUrls,
    isAllowed: (url: string, ua?: string) =>
      parser.isAllowed(url, ua ?? userAgent) !== false,
    crawlDelay,
    aiBotsBlocked,
  };
}
