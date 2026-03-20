import type { CheckResult, CrawlResult } from '@audit/types';

// Technical audits
import { runRobotsAudit } from './technical/robots-audit.js';
import { runSitemapAudit } from './technical/sitemap-audit.js';
import { runUrlRedirectAudit } from './technical/url-redirect-audit.js';
import { runArchitectureAudit } from './technical/architecture-audit.js';
import { runPerformanceAudit } from './technical/performance-audit.js';
import { runMobileAudit } from './technical/mobile-audit.js';
import { runSecurityAudit } from './technical/security-audit.js';

// On-page audits
import { runTitleAudit } from './on-page/title-audit.js';
import { runMetaDescriptionAudit } from './on-page/meta-description-audit.js';
import { runHeadingAudit } from './on-page/heading-audit.js';
import { runContentQualityAudit } from './on-page/content-quality-audit.js';
import { runImageAudit } from './on-page/image-audit.js';
import { runInternalLinkAudit } from './on-page/internal-link-audit.js';
import { runExternalLinkAudit } from './on-page/external-link-audit.js';

// Off-page audits
import { runSocialMetaAudit } from './off-page/social-meta-audit.js';

// Structured data audits
import { runSchemaAudit } from './structured-data/schema-audit.js';

/**
 * Runs the full SEO engine across all audit modules.
 *
 * Executes every check (ROBOTS, SITEMAP, URL, ARCH, PERF, MOBILE, SEC,
 * TITLE, META, HEADING, CONTENT, IMG, ILINK, ELINK, SOCIAL, SCHEMA)
 * and returns a combined array of CheckResults.
 */
export async function runSeoEngine(
  crawlResult: CrawlResult,
): Promise<CheckResult[]> {
  const { pages, linkGraph } = crawlResult;
  const allResults: CheckResult[] = [];

  // ── Technical SEO ─────────────────────────────────────────────────────
  allResults.push(...runRobotsAudit(crawlResult));
  allResults.push(...runSitemapAudit(crawlResult));
  allResults.push(...runUrlRedirectAudit(pages));
  allResults.push(...runArchitectureAudit(pages, linkGraph));
  allResults.push(...runPerformanceAudit(pages));
  allResults.push(...runMobileAudit(pages));
  allResults.push(...runSecurityAudit(pages));

  // ── On-Page SEO ───────────────────────────────────────────────────────
  allResults.push(...runTitleAudit(pages));
  allResults.push(...runMetaDescriptionAudit(pages));
  allResults.push(...runHeadingAudit(pages));
  allResults.push(...runContentQualityAudit(pages));
  allResults.push(...runImageAudit(pages));
  allResults.push(...runInternalLinkAudit(pages));
  allResults.push(...runExternalLinkAudit(pages));

  // ── Off-Page / Social ─────────────────────────────────────────────────
  allResults.push(...runSocialMetaAudit(pages));

  // ── Structured Data ───────────────────────────────────────────────────
  allResults.push(...runSchemaAudit(pages));

  return allResults;
}

// Re-export individual audit functions for selective use
export { runRobotsAudit } from './technical/robots-audit.js';
export { runSitemapAudit } from './technical/sitemap-audit.js';
export { runUrlRedirectAudit } from './technical/url-redirect-audit.js';
export { runArchitectureAudit } from './technical/architecture-audit.js';
export { runPerformanceAudit } from './technical/performance-audit.js';
export { runMobileAudit } from './technical/mobile-audit.js';
export { runSecurityAudit } from './technical/security-audit.js';
export { runTitleAudit } from './on-page/title-audit.js';
export { runMetaDescriptionAudit } from './on-page/meta-description-audit.js';
export { runHeadingAudit } from './on-page/heading-audit.js';
export { runContentQualityAudit } from './on-page/content-quality-audit.js';
export { runImageAudit } from './on-page/image-audit.js';
export { runInternalLinkAudit } from './on-page/internal-link-audit.js';
export { runExternalLinkAudit } from './on-page/external-link-audit.js';
export { runSocialMetaAudit } from './off-page/social-meta-audit.js';
export { runSchemaAudit } from './structured-data/schema-audit.js';
