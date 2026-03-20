/**
 * Interactive element usability audit.
 * Checks UX-001 and UX-002 for interactive element best practices.
 */

import * as cheerio from 'cheerio';
import crypto from 'node:crypto';
import type { CheckResult, PageData } from '@audit/types';

function makeResult(
  checkId: string,
  checkName: string,
  pageUrl: string | null,
  status: CheckResult['status'],
  severity: CheckResult['severity'],
  score: number,
  message: string,
  details: Record<string, unknown> | null,
  recommendation: string | null,
  element: string | null,
): CheckResult {
  return {
    id: crypto.randomUUID(),
    checkId,
    checkName,
    pillar: 'au',
    category: 'usability-interactive',
    pageUrl,
    status,
    severity,
    score: Math.max(0, Math.min(100, score)),
    message,
    details,
    recommendation,
    wcagCriterion: null,
    element,
  };
}

/**
 * Parse a CSS property value that might be a size into pixels.
 */
function parseSizeToPx(value: string, baseFontSize = 16): number | null {
  const trimmed = value.trim().toLowerCase();

  const pxMatch = trimmed.match(/^([\d.]+)\s*px$/);
  if (pxMatch) return parseFloat(pxMatch[1]);

  const emMatch = trimmed.match(/^([\d.]+)\s*(?:em|rem)$/);
  if (emMatch) return parseFloat(emMatch[1]) * baseFontSize;

  const vhMatch = trimmed.match(/^([\d.]+)\s*vh$/);
  if (vhMatch) return parseFloat(vhMatch[1]); // Return as vh percentage for comparison

  const percentMatch = trimmed.match(/^([\d.]+)\s*%$/);
  if (percentMatch) return parseFloat(percentMatch[1]);

  return null;
}

/**
 * UX-001: Hover states for interactive elements.
 * Interactive elements (links, buttons) should have visual hover/focus states defined in CSS.
 * Without hover/focus styles, users cannot easily identify clickable elements.
 */
function checkHoverStates($: cheerio.CheerioAPI, pageUrl: string): CheckResult {
  // Count interactive elements
  const links = $('a[href]').length;
  const buttons = $('button, [role="button"], input[type="button"], input[type="submit"]').length;
  const totalInteractive = links + buttons;

  if (totalInteractive === 0) {
    return makeResult(
      'UX-001',
      'Hover & Focus States',
      pageUrl,
      'info',
      'info',
      100,
      'No interactive elements (links or buttons) found on the page.',
      { links: 0, buttons: 0 },
      null,
      null,
    );
  }

  // Analyze CSS for hover/focus pseudo-class rules
  let hasHoverRules = false;
  let hasFocusRules = false;
  let hasFocusVisibleRules = false;
  const hoverSelectors: string[] = [];
  const focusSelectors: string[] = [];

  $('style').each((_, el) => {
    const css = $(el).text();

    // Check for :hover rules on interactive elements
    const hoverRegex = /([^{}]*:hover[^{]*)\{/gi;
    let match;
    while ((match = hoverRegex.exec(css)) !== null) {
      const selector = match[1].trim();
      if (
        selector.includes('a') ||
        selector.includes('button') ||
        selector.includes('btn') ||
        selector.includes('link') ||
        selector.includes('nav')
      ) {
        hasHoverRules = true;
        hoverSelectors.push(selector);
      } else {
        // Any :hover rule at all is a good sign
        hasHoverRules = true;
        hoverSelectors.push(selector);
      }
    }

    // Check for :focus rules
    const focusRegex = /([^{}]*:focus(?:-visible|-within)?[^{]*)\{/gi;
    while ((match = focusRegex.exec(css)) !== null) {
      const selector = match[1].trim();
      hasFocusRules = true;
      focusSelectors.push(selector);
      if (selector.includes('focus-visible')) {
        hasFocusVisibleRules = true;
      }
    }
  });

  // Also check for outline: none / outline: 0 (bad practice - removes focus indicator)
  let outlineRemoved = false;
  $('style').each((_, el) => {
    const css = $(el).text();
    if (/outline\s*:\s*(none|0)\s*[;}]/i.test(css) && /:focus/.test(css)) {
      outlineRemoved = true;
    }
  });

  // Check inline styles on links/buttons for cursor changes or hover-related
  let inlineCursor = 0;
  $('a[href], button, [role="button"]').each((_, el) => {
    const style = $(el).attr('style') || '';
    if (style.includes('cursor')) {
      inlineCursor++;
    }
  });

  // Scoring logic
  const issues: string[] = [];

  if (!hasHoverRules && !hasFocusRules) {
    issues.push('No :hover or :focus CSS rules found for interactive elements.');
  }

  if (!hasFocusRules) {
    issues.push('No :focus styles found. Keyboard users need visible focus indicators.');
  }

  if (outlineRemoved) {
    issues.push(':focus outline has been removed without a visible replacement.');
  }

  if (issues.length > 0) {
    const score = hasHoverRules || hasFocusRules ? 50 : 20;
    return makeResult(
      'UX-001',
      'Hover & Focus States',
      pageUrl,
      outlineRemoved ? 'fail' : 'warning',
      outlineRemoved ? 'high' : 'warning',
      score,
      issues.join(' '),
      {
        totalInteractive,
        links,
        buttons,
        hasHoverRules,
        hasFocusRules,
        hasFocusVisibleRules,
        outlineRemoved,
        hoverSelectorCount: hoverSelectors.length,
        focusSelectorCount: focusSelectors.length,
      },
      'Define :hover and :focus (or :focus-visible) CSS styles for all interactive elements. Never remove the outline on :focus without providing an alternative visible focus indicator.',
      null,
    );
  }

  return makeResult(
    'UX-001',
    'Hover & Focus States',
    pageUrl,
    'pass',
    'info',
    100,
    `Hover and focus styles detected for interactive elements (${hoverSelectors.length} hover rule(s), ${focusSelectors.length} focus rule(s)).`,
    {
      totalInteractive,
      links,
      buttons,
      hasHoverRules,
      hasFocusRules,
      hasFocusVisibleRules,
      outlineRemoved: false,
      hoverSelectorCount: hoverSelectors.length,
      focusSelectorCount: focusSelectors.length,
    },
    null,
    null,
  );
}

/**
 * UX-002: Sticky element height.
 * Sticky/fixed headers and navigation bars should not consume excessive viewport height.
 * A sticky element taller than ~20% of the viewport significantly reduces readable area,
 * especially on mobile.
 */
function checkStickyElementHeight($: cheerio.CheerioAPI, pageUrl: string): CheckResult {
  interface StickyElement {
    tag: string;
    position: string;
    height: string | null;
    heightPx: number | null;
    snippet: string;
  }

  const stickyElements: StickyElement[] = [];

  // Check inline styles for position: fixed or position: sticky
  $('[style]').each((_, el) => {
    const elem = $(el);
    const style = elem.attr('style') || '';
    const posMatch = style.match(/position\s*:\s*(fixed|sticky)/i);

    if (posMatch) {
      const position = posMatch[1].toLowerCase();
      const heightMatch = style.match(/height\s*:\s*([^;]+)/i);
      const heightValue = heightMatch ? heightMatch[1].trim() : null;
      let heightPx: number | null = null;

      if (heightValue) {
        heightPx = parseSizeToPx(heightValue);
      }

      const tag = (el as any).tagName || 'unknown';
      const snippet = `<${tag}${elem.attr('class') ? ' class="' + elem.attr('class') + '"' : ''}>`;

      stickyElements.push({
        tag,
        position,
        height: heightValue,
        heightPx,
        snippet: snippet.length > 200 ? snippet.slice(0, 200) + '...' : snippet,
      });
    }
  });

  // Check CSS rules for position: fixed/sticky
  $('style').each((_, el) => {
    const css = $(el).text();
    const ruleRegex = /([^{}]+)\{([^}]*)\}/g;
    let match;

    while ((match = ruleRegex.exec(css)) !== null) {
      const selector = match[1].trim();
      const block = match[2];

      const posMatch = block.match(/position\s*:\s*(fixed|sticky)/i);
      if (posMatch) {
        const position = posMatch[1].toLowerCase();
        const heightMatch = block.match(/height\s*:\s*([^;}\s]+)/i);
        const heightValue = heightMatch ? heightMatch[1].trim() : null;
        let heightPx: number | null = null;

        if (heightValue) {
          heightPx = parseSizeToPx(heightValue);
        }

        stickyElements.push({
          tag: selector,
          position,
          height: heightValue,
          heightPx,
          snippet: `${selector} { position: ${position}; ${heightValue ? 'height: ' + heightValue + ';' : ''} }`,
        });
      }
    }
  });

  // Also check for common sticky header patterns via classes
  const commonStickyClasses = $('[class*="sticky"], [class*="fixed-top"], [class*="fixed-header"], [class*="navbar-fixed"], [class*="is-stuck"]');
  commonStickyClasses.each((_, el) => {
    const elem = $(el);
    const tag = (el as any).tagName || 'unknown';
    const style = elem.attr('style') || '';
    const heightMatch = style.match(/height\s*:\s*([^;]+)/i);
    const heightValue = heightMatch ? heightMatch[1].trim() : null;
    let heightPx: number | null = null;
    if (heightValue) {
      heightPx = parseSizeToPx(heightValue);
    }

    // Avoid duplicates
    const snippet = `<${tag} class="${elem.attr('class')}">`;
    if (!stickyElements.find((s) => s.snippet === snippet)) {
      stickyElements.push({
        tag,
        position: 'class-based',
        height: heightValue,
        heightPx,
        snippet: snippet.length > 200 ? snippet.slice(0, 200) + '...' : snippet,
      });
    }
  });

  if (stickyElements.length === 0) {
    return makeResult(
      'UX-002',
      'Sticky Element Height',
      pageUrl,
      'info',
      'info',
      100,
      'No fixed or sticky positioned elements detected.',
      { stickyElements: [] },
      null,
      null,
    );
  }

  // Check for excessively tall sticky elements
  // Use 150px as a threshold (roughly 20% of a 768px viewport)
  const tallSticky = stickyElements.filter((s) => {
    if (s.heightPx !== null) {
      return s.heightPx > 150;
    }
    // For vh-based heights, check if > 20
    if (s.height) {
      const vhMatch = s.height.match(/^([\d.]+)\s*vh$/);
      if (vhMatch && parseFloat(vhMatch[1]) > 20) {
        return true;
      }
    }
    return false;
  });

  if (tallSticky.length > 0) {
    return makeResult(
      'UX-002',
      'Sticky Element Height',
      pageUrl,
      'warning',
      'warning',
      50,
      `${tallSticky.length} sticky/fixed element(s) may consume excessive viewport space (height > 150px).`,
      {
        totalSticky: stickyElements.length,
        tallStickyCount: tallSticky.length,
        tallStickyElements: tallSticky.slice(0, 5),
        allStickyElements: stickyElements.slice(0, 10),
      },
      'Keep sticky/fixed headers under 80px on desktop and 60px on mobile. Use auto-hide patterns for tall navigation on scroll.',
      tallSticky[0]?.snippet ?? null,
    );
  }

  return makeResult(
    'UX-002',
    'Sticky Element Height',
    pageUrl,
    'pass',
    'info',
    100,
    `${stickyElements.length} sticky/fixed element(s) detected with reasonable height.`,
    { totalSticky: stickyElements.length, stickyElements: stickyElements.slice(0, 10) },
    null,
    null,
  );
}

/**
 * Run interactive element usability audit across all pages.
 */
export function runInteractiveAudit(pages: PageData[]): CheckResult[] {
  const results: CheckResult[] = [];

  for (const page of pages) {
    const html = page.renderedHtml || page.rawHtml;
    if (!html) continue;

    const $ = cheerio.load(html);

    results.push(checkHoverStates($, page.url));
    results.push(checkStickyElementHeight($, page.url));
  }

  return results;
}
