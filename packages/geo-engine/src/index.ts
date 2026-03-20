/**
 * GEO (Generative Engine Optimization) Engine
 *
 * Runs comprehensive GEO audits to evaluate how well a website is
 * optimized for visibility and citation in AI-powered search engines
 * and large language models.
 */

import type { CrawlResult, CheckResult, GeoQueryResult, AuditConfig } from '@audit/types';

// Content audits
import { runAnswerReadinessAudit } from './content/answer-readiness-audit.js';
import { runCitabilityAudit } from './content/citability-audit.js';
import { runAuthorityAudit } from './content/authority-audit.js';
import { runTopicalAuthorityAudit } from './content/topical-authority-audit.js';

// Technical audits
import { runAiCrawlerAudit } from './technical/ai-crawler-audit.js';
import { runFreshnessAudit } from './technical/freshness-audit.js';
import { runStructuredKnowledgeAudit } from './technical/structured-knowledge-audit.js';

// Visibility audits
import { runAiQueries, registerAdapter } from './visibility/ai-query-runner.js';
import { createChatGptAdapter } from './visibility/chatgpt-monitor.js';
import { createPerplexityAdapter } from './visibility/perplexity-monitor.js';
import { runBrandSentimentAnalysis } from './visibility/brand-sentiment.js';
import { runZeroClickRiskAudit } from './visibility/zero-click-risk.js';

// Re-export individual audits for granular use
export { runAnswerReadinessAudit } from './content/answer-readiness-audit.js';
export { runCitabilityAudit } from './content/citability-audit.js';
export { runAuthorityAudit } from './content/authority-audit.js';
export { runTopicalAuthorityAudit } from './content/topical-authority-audit.js';
export { runAiCrawlerAudit } from './technical/ai-crawler-audit.js';
export { runFreshnessAudit } from './technical/freshness-audit.js';
export { runStructuredKnowledgeAudit } from './technical/structured-knowledge-audit.js';

/**
 * Run the full GEO engine on a crawl result.
 *
 * @returns Object with checks array and geoQueries array.
 */
export async function runGeoEngine(
  crawlResult: CrawlResult,
  config: AuditConfig,
): Promise<{ checks: CheckResult[]; geoQueries: GeoQueryResult[] }> {
  const { pages, robotsTxt, linkGraph } = crawlResult;
  const checks: CheckResult[] = [];

  if (pages.length === 0) {
    return { checks, geoQueries: [] };
  }

  // Content Structure checks
  checks.push(...runAnswerReadinessAudit(pages));
  checks.push(...runCitabilityAudit(pages));
  checks.push(...runAuthorityAudit(pages));
  checks.push(...runTopicalAuthorityAudit(pages, linkGraph));

  // Technical GEO checks
  checks.push(...runAiCrawlerAudit(robotsTxt, pages));
  checks.push(...runFreshnessAudit(pages));
  checks.push(...runStructuredKnowledgeAudit(pages));

  // Visibility audits (AI querying — requires API keys)
  let geoQueries: GeoQueryResult[] = [];

  if (config.geoQueries.length > 0 && config.geoEngines.length > 0) {
    const chatgpt = createChatGptAdapter();
    if (chatgpt) registerAdapter(chatgpt);
    const perplexity = createPerplexityAdapter();
    if (perplexity) registerAdapter(perplexity);

    geoQueries = await runAiQueries(config.geoQueries, config.url, config.geoEngines);

    if (geoQueries.length > 0) {
      checks.push(...runBrandSentimentAnalysis(geoQueries, config.url));
      checks.push(...runZeroClickRiskAudit(geoQueries, pages));
    }
  }

  return { checks, geoQueries };
}
