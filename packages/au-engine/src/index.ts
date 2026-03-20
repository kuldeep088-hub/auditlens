/**
 * AU (Accessibility & Usability) Engine
 *
 * Runs comprehensive accessibility and usability audits on crawled pages.
 * Produces CheckResult[] conforming to the @audit/types interface.
 */

import type { CrawlResult, CheckResult } from '@audit/types';

// Accessibility
import { runAccessibilityAudit } from './accessibility/axe-runner.js';

// Usability
import { runNavigationAudit } from './usability/navigation-audit.js';
import { runFormAudit } from './usability/form-audit.js';
import { runTypographyAudit } from './usability/typography-audit.js';
import { runInteractiveAudit } from './usability/interactive-audit.js';

// Re-export individual audits for granular use
export { runAccessibilityAudit } from './accessibility/axe-runner.js';
export { runNavigationAudit } from './usability/navigation-audit.js';
export { runFormAudit } from './usability/form-audit.js';
export { runTypographyAudit } from './usability/typography-audit.js';
export { runInteractiveAudit } from './usability/interactive-audit.js';

// Re-export WCAG mapper utilities
export {
  getWcagMapping,
  getWcagCriterion,
  getWcagLevel,
  getAllMappings,
} from './accessibility/wcag-mapper.js';
export type { WcagMapping } from './accessibility/wcag-mapper.js';

/**
 * Run the full AU (Accessibility & Usability) engine on a crawl result.
 *
 * Executes all accessibility checks (image alt, lang, contrast, form labels,
 * heading order, landmarks, ARIA roles, duplicate IDs, link text, button names,
 * table headers) and all usability checks (navigation, forms, typography,
 * interactive elements) across every page in the crawl result.
 *
 * @param crawlResult - The result from the crawler containing all page data.
 * @returns A flat array of CheckResult objects from all audits.
 */
export async function runAuEngine(crawlResult: CrawlResult): Promise<CheckResult[]> {
  const { pages } = crawlResult;

  if (pages.length === 0) {
    return [];
  }

  // Run all audit modules. Each operates on the full set of pages.
  const results: CheckResult[] = [
    // Accessibility checks (WCAG-mapped)
    ...runAccessibilityAudit(pages),

    // Usability checks
    ...runNavigationAudit(pages),
    ...runFormAudit(pages),
    ...runTypographyAudit(pages),
    ...runInteractiveAudit(pages),
  ];

  return results;
}
