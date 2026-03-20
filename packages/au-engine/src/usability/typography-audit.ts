/**
 * Typography usability audit.
 * Checks TYPO-001 through TYPO-004 for readability best practices.
 * Parses inline styles and <style> blocks to evaluate typography.
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
    category: 'usability-typography',
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
 * Parse a CSS size value into pixels (approximate).
 * Handles px, em, rem, pt, and unitless values.
 * Returns null if the value cannot be parsed.
 */
function parseSizeToPixels(value: string, baseFontSize = 16): number | null {
  const trimmed = value.trim().toLowerCase();

  const pxMatch = trimmed.match(/^([\d.]+)\s*px$/);
  if (pxMatch) return parseFloat(pxMatch[1]);

  const emMatch = trimmed.match(/^([\d.]+)\s*(?:em|rem)$/);
  if (emMatch) return parseFloat(emMatch[1]) * baseFontSize;

  const ptMatch = trimmed.match(/^([\d.]+)\s*pt$/);
  if (ptMatch) return parseFloat(ptMatch[1]) * (4 / 3); // 1pt = 1.333px

  const percentMatch = trimmed.match(/^([\d.]+)\s*%$/);
  if (percentMatch) return (parseFloat(percentMatch[1]) / 100) * baseFontSize;

  // Unitless number (e.g., line-height: 1.5)
  const numMatch = trimmed.match(/^([\d.]+)$/);
  if (numMatch) return parseFloat(numMatch[1]);

  return null;
}

/**
 * Extract all CSS rule blocks from <style> elements and inline styles.
 * Returns an array of { selector, property, value } objects.
 */
interface CssDeclaration {
  selector: string;
  property: string;
  value: string;
}

function extractCssDeclarations($: cheerio.CheerioAPI): CssDeclaration[] {
  const declarations: CssDeclaration[] = [];

  // Parse <style> blocks
  $('style').each((_, el) => {
    const css = $(el).text();
    // Simple regex-based CSS parser (handles basic selectors and declarations)
    const ruleRegex = /([^{}]+)\{([^}]*)\}/g;
    let match;
    while ((match = ruleRegex.exec(css)) !== null) {
      const selector = match[1].trim();
      const block = match[2];
      const propRegex = /([\w-]+)\s*:\s*([^;]+)/g;
      let propMatch;
      while ((propMatch = propRegex.exec(block)) !== null) {
        declarations.push({
          selector,
          property: propMatch[1].trim().toLowerCase(),
          value: propMatch[2].trim(),
        });
      }
    }
  });

  // Parse inline styles
  $('[style]').each((_, el) => {
    const elem = $(el);
    const style = elem.attr('style') || '';
    const tag = (el as any).tagName || 'unknown';
    const propRegex = /([\w-]+)\s*:\s*([^;]+)/g;
    let propMatch;
    while ((propMatch = propRegex.exec(style)) !== null) {
      declarations.push({
        selector: `inline:${tag}`,
        property: propMatch[1].trim().toLowerCase(),
        value: propMatch[2].trim(),
      });
    }
  });

  return declarations;
}

/**
 * TYPO-001: Body font size.
 * Body text should be at least 16px for comfortable reading on screens.
 */
function checkBodyFontSize($: cheerio.CheerioAPI, pageUrl: string, declarations: CssDeclaration[]): CheckResult {
  // Check inline style on body
  const bodyStyle = $('body').attr('style') || '';
  const htmlStyle = $('html').attr('style') || '';

  let detectedBodySize: number | null = null;
  let detectedSource = '';

  // Check body inline style
  const bodyFontMatch = bodyStyle.match(/font-size\s*:\s*([^;]+)/i);
  if (bodyFontMatch) {
    detectedBodySize = parseSizeToPixels(bodyFontMatch[1].trim());
    detectedSource = 'body inline style';
  }

  // Check html inline style
  if (detectedBodySize === null) {
    const htmlFontMatch = htmlStyle.match(/font-size\s*:\s*([^;]+)/i);
    if (htmlFontMatch) {
      detectedBodySize = parseSizeToPixels(htmlFontMatch[1].trim());
      detectedSource = 'html inline style';
    }
  }

  // Check <style> blocks for body/html font-size
  if (detectedBodySize === null) {
    for (const decl of declarations) {
      if (
        (decl.selector === 'body' || decl.selector === 'html' || decl.selector === ':root') &&
        decl.property === 'font-size'
      ) {
        const size = parseSizeToPixels(decl.value);
        if (size !== null) {
          detectedBodySize = size;
          detectedSource = `<style> rule: ${decl.selector}`;
          break;
        }
      }
    }
  }

  // Also look for common reset patterns like *, html, body selectors
  if (detectedBodySize === null) {
    for (const decl of declarations) {
      const sel = decl.selector.toLowerCase().replace(/\s+/g, '');
      if (
        (sel.includes('body') || sel === '*' || sel === 'html,body' || sel === 'body,html') &&
        decl.property === 'font-size'
      ) {
        const size = parseSizeToPixels(decl.value);
        if (size !== null) {
          detectedBodySize = size;
          detectedSource = `<style> rule: ${decl.selector}`;
          break;
        }
      }
    }
  }

  if (detectedBodySize === null) {
    return makeResult(
      'TYPO-001',
      'Body Font Size',
      pageUrl,
      'info',
      'info',
      100,
      'No explicit body font-size declaration found. Browser default (typically 16px) applies.',
      { detectedSize: null, source: 'browser default' },
      null,
      null,
    );
  }

  if (detectedBodySize < 14) {
    return makeResult(
      'TYPO-001',
      'Body Font Size',
      pageUrl,
      'fail',
      'high',
      20,
      `Body font size is ${detectedBodySize}px (from ${detectedSource}), which is too small for comfortable reading.`,
      { detectedSizePx: detectedBodySize, source: detectedSource },
      'Set body font size to at least 16px (1rem) for optimal readability on screens.',
      null,
    );
  }

  if (detectedBodySize < 16) {
    return makeResult(
      'TYPO-001',
      'Body Font Size',
      pageUrl,
      'warning',
      'warning',
      60,
      `Body font size is ${detectedBodySize}px (from ${detectedSource}), which is slightly below the recommended minimum of 16px.`,
      { detectedSizePx: detectedBodySize, source: detectedSource },
      'Consider increasing body font size to 16px (1rem) for better readability.',
      null,
    );
  }

  return makeResult(
    'TYPO-001',
    'Body Font Size',
    pageUrl,
    'pass',
    'info',
    100,
    `Body font size is ${detectedBodySize}px (from ${detectedSource}), which meets readability standards.`,
    { detectedSizePx: detectedBodySize, source: detectedSource },
    null,
    null,
  );
}

/**
 * TYPO-002: Line height.
 * Body text line-height should be at least 1.5 for comfortable reading (WCAG 1.4.12 recommendation).
 */
function checkLineHeight($: cheerio.CheerioAPI, pageUrl: string, declarations: CssDeclaration[]): CheckResult {
  let detectedLineHeight: number | null = null;
  let detectedSource = '';
  let isUnitless = false;

  // Check body inline style
  const bodyStyle = $('body').attr('style') || '';
  const lhMatch = bodyStyle.match(/line-height\s*:\s*([^;]+)/i);
  if (lhMatch) {
    const raw = lhMatch[1].trim();
    // Check if it's unitless
    if (/^[\d.]+$/.test(raw)) {
      detectedLineHeight = parseFloat(raw);
      isUnitless = true;
    } else {
      detectedLineHeight = parseSizeToPixels(raw);
      isUnitless = false;
    }
    detectedSource = 'body inline style';
  }

  // Check <style> blocks for body line-height
  if (detectedLineHeight === null) {
    for (const decl of declarations) {
      if (
        (decl.selector === 'body' || decl.selector === 'html' || decl.selector === 'p' || decl.selector === ':root') &&
        decl.property === 'line-height'
      ) {
        const raw = decl.value.trim();
        if (/^[\d.]+$/.test(raw)) {
          detectedLineHeight = parseFloat(raw);
          isUnitless = true;
        } else {
          detectedLineHeight = parseSizeToPixels(raw);
          isUnitless = false;
        }
        detectedSource = `<style> rule: ${decl.selector}`;
        break;
      }
    }
  }

  if (detectedLineHeight === null) {
    return makeResult(
      'TYPO-002',
      'Line Height',
      pageUrl,
      'info',
      'info',
      100,
      'No explicit line-height declaration found for body text. Browser default applies.',
      { detectedLineHeight: null, source: 'browser default' },
      'Consider setting line-height to at least 1.5 for body text.',
      null,
    );
  }

  // For unitless values, compare directly against 1.5
  // For pixel values, we need to compare relative to font size
  let ratio: number;
  if (isUnitless) {
    ratio = detectedLineHeight;
  } else {
    // Assume 16px base font if we can't determine it
    let baseFontSize = 16;
    const bodyFsMatch = bodyStyle.match(/font-size\s*:\s*([^;]+)/i);
    if (bodyFsMatch) {
      baseFontSize = parseSizeToPixels(bodyFsMatch[1].trim()) ?? 16;
    }
    ratio = detectedLineHeight / baseFontSize;
  }

  if (ratio < 1.2) {
    return makeResult(
      'TYPO-002',
      'Line Height',
      pageUrl,
      'fail',
      'high',
      20,
      `Line height is ${isUnitless ? detectedLineHeight : detectedLineHeight + 'px'} (ratio: ${ratio.toFixed(2)}) from ${detectedSource}. This is too tight for comfortable reading.`,
      { detectedLineHeight, ratio: Number(ratio.toFixed(2)), isUnitless, source: detectedSource },
      'Set line-height to at least 1.5 for body text to improve readability.',
      null,
    );
  }

  if (ratio < 1.5) {
    return makeResult(
      'TYPO-002',
      'Line Height',
      pageUrl,
      'warning',
      'warning',
      60,
      `Line height ratio is ${ratio.toFixed(2)} (from ${detectedSource}), which is below the recommended 1.5.`,
      { detectedLineHeight, ratio: Number(ratio.toFixed(2)), isUnitless, source: detectedSource },
      'Increase line-height to at least 1.5 for body text (WCAG 1.4.12 recommendation).',
      null,
    );
  }

  return makeResult(
    'TYPO-002',
    'Line Height',
    pageUrl,
    'pass',
    'info',
    100,
    `Line height ratio is ${ratio.toFixed(2)} (from ${detectedSource}), meeting readability standards.`,
    { detectedLineHeight, ratio: Number(ratio.toFixed(2)), isUnitless, source: detectedSource },
    null,
    null,
  );
}

/**
 * TYPO-003: Line length (measure).
 * Body text containers should be limited to roughly 45-80 characters per line (optimal: ~66).
 * Check for max-width or width constraints on text containers.
 */
function checkLineLength($: cheerio.CheerioAPI, pageUrl: string, declarations: CssDeclaration[]): CheckResult {
  // Look for max-width on common text containers
  const textContainers = ['main', 'article', '.content', '.post', '.entry', 'p', '.container', '.wrapper'];

  let hasMaxWidth = false;
  let maxWidthValue: string | null = null;
  let maxWidthSource = '';

  // Check inline styles on key elements
  for (const sel of ['main', 'article', 'p', '[class*="content"]', '[class*="container"]', '[class*="wrapper"]', '[class*="post"]', '[class*="entry"]']) {
    $(sel).each((_, el) => {
      if (hasMaxWidth) return;
      const style = $(el).attr('style') || '';
      const mwMatch = style.match(/max-width\s*:\s*([^;]+)/i);
      if (mwMatch) {
        hasMaxWidth = true;
        maxWidthValue = mwMatch[1].trim();
        maxWidthSource = `inline style on <${(el as any).tagName}>`;
      }
    });
  }

  // Check <style> blocks
  if (!hasMaxWidth) {
    for (const decl of declarations) {
      if (decl.property === 'max-width') {
        // Check if selector targets a text container
        const selLower = decl.selector.toLowerCase();
        for (const container of textContainers) {
          if (selLower.includes(container.replace('.', ''))) {
            hasMaxWidth = true;
            maxWidthValue = decl.value;
            maxWidthSource = `<style> rule: ${decl.selector}`;
            break;
          }
        }
        if (hasMaxWidth) break;
      }
    }
  }

  // Also check for ch-based widths (ideal for line length)
  if (!hasMaxWidth) {
    for (const decl of declarations) {
      if ((decl.property === 'max-width' || decl.property === 'width') && decl.value.includes('ch')) {
        hasMaxWidth = true;
        maxWidthValue = decl.value;
        maxWidthSource = `<style> rule: ${decl.selector}`;
        break;
      }
    }
  }

  if (!hasMaxWidth) {
    // Check if the body or main has a fixed width
    for (const decl of declarations) {
      if (
        (decl.selector === 'body' || decl.selector === 'main' || decl.selector === '.container') &&
        decl.property === 'width'
      ) {
        const px = parseSizeToPixels(decl.value);
        if (px !== null && px < 1200) {
          hasMaxWidth = true;
          maxWidthValue = decl.value;
          maxWidthSource = `<style> width on ${decl.selector}`;
          break;
        }
      }
    }
  }

  if (hasMaxWidth && maxWidthValue) {
    // Check if the max-width is reasonable for text
    const px = parseSizeToPixels(maxWidthValue);

    if (px !== null && px > 1000) {
      return makeResult(
        'TYPO-003',
        'Line Length (Measure)',
        pageUrl,
        'warning',
        'warning',
        60,
        `Text container has max-width of ${maxWidthValue} (from ${maxWidthSource}), which may result in lines that are too long for comfortable reading.`,
        { maxWidth: maxWidthValue, maxWidthPx: px, source: maxWidthSource },
        'Limit text container width to around 65ch (approximately 700px) for optimal readability.',
        null,
      );
    }

    return makeResult(
      'TYPO-003',
      'Line Length (Measure)',
      pageUrl,
      'pass',
      'info',
      100,
      `Text container width is constrained (${maxWidthValue} from ${maxWidthSource}).`,
      { maxWidth: maxWidthValue, source: maxWidthSource },
      null,
      null,
    );
  }

  return makeResult(
    'TYPO-003',
    'Line Length (Measure)',
    pageUrl,
    'warning',
    'warning',
    40,
    'No max-width constraint detected on text containers. Lines may be too long on wide screens.',
    { maxWidth: null },
    'Add a max-width (e.g., max-width: 65ch or max-width: 700px) to the main text container to limit line length.',
    null,
  );
}

/**
 * TYPO-004: font-display property.
 * @font-face rules should use font-display: swap (or optional/fallback) to avoid
 * invisible text (FOIT) while custom fonts load.
 */
function checkFontDisplay($: cheerio.CheerioAPI, pageUrl: string): CheckResult {
  const styleContents: string[] = [];
  $('style').each((_, el) => {
    styleContents.push($(el).text());
  });

  // Also check <link> elements for font loading
  const fontLinks = $('link[rel="stylesheet"][href*="font"], link[rel="stylesheet"][href*="typekit"], link[rel="stylesheet"][href*="google"]');

  const allCss = styleContents.join('\n');

  // Find @font-face rules
  const fontFaceRegex = /@font-face\s*\{([^}]*)\}/gi;
  let fontFaceMatch;
  const fontFaces: { family: string; hasFontDisplay: boolean; fontDisplayValue: string | null }[] = [];

  while ((fontFaceMatch = fontFaceRegex.exec(allCss)) !== null) {
    const block = fontFaceMatch[1];
    const familyMatch = block.match(/font-family\s*:\s*["']?([^"';]+)/i);
    const displayMatch = block.match(/font-display\s*:\s*([^;}\s]+)/i);

    fontFaces.push({
      family: familyMatch ? familyMatch[1].trim() : 'unknown',
      hasFontDisplay: !!displayMatch,
      fontDisplayValue: displayMatch ? displayMatch[1].trim() : null,
    });
  }

  // If no @font-face rules found but external font links exist
  if (fontFaces.length === 0 && fontLinks.length > 0) {
    return makeResult(
      'TYPO-004',
      'Font Display Strategy',
      pageUrl,
      'warning',
      'warning',
      60,
      `${fontLinks.length} external font stylesheet(s) detected but no @font-face rules in inline styles to verify font-display.`,
      { externalFontLinks: fontLinks.length, fontFaces: [] },
      'Ensure all @font-face rules in external stylesheets include font-display: swap to prevent invisible text during font loading.',
      null,
    );
  }

  if (fontFaces.length === 0) {
    return makeResult(
      'TYPO-004',
      'Font Display Strategy',
      pageUrl,
      'info',
      'info',
      100,
      'No @font-face rules found. System fonts or default fonts are in use.',
      { fontFaces: [] },
      null,
      null,
    );
  }

  const missingDisplay = fontFaces.filter((ff) => !ff.hasFontDisplay);
  const badDisplay = fontFaces.filter(
    (ff) =>
      ff.hasFontDisplay &&
      ff.fontDisplayValue !== 'swap' &&
      ff.fontDisplayValue !== 'optional' &&
      ff.fontDisplayValue !== 'fallback',
  );

  if (missingDisplay.length > 0) {
    const score = Math.round(((fontFaces.length - missingDisplay.length) / fontFaces.length) * 100);
    return makeResult(
      'TYPO-004',
      'Font Display Strategy',
      pageUrl,
      'fail',
      'warning',
      Math.max(score, 20),
      `${missingDisplay.length} of ${fontFaces.length} @font-face rule(s) lack a font-display property.`,
      {
        totalFontFaces: fontFaces.length,
        missingDisplayCount: missingDisplay.length,
        missingFamilies: missingDisplay.map((ff) => ff.family),
        fontFaces,
      },
      'Add font-display: swap to all @font-face rules to show fallback text while custom fonts load.',
      null,
    );
  }

  if (badDisplay.length > 0) {
    return makeResult(
      'TYPO-004',
      'Font Display Strategy',
      pageUrl,
      'warning',
      'warning',
      70,
      `${badDisplay.length} @font-face rule(s) use font-display: ${badDisplay[0].fontDisplayValue}, which may cause invisible text.`,
      {
        totalFontFaces: fontFaces.length,
        badDisplayCount: badDisplay.length,
        badFamilies: badDisplay.map((ff) => ({ family: ff.family, value: ff.fontDisplayValue })),
        fontFaces,
      },
      'Use font-display: swap, fallback, or optional for best user experience.',
      null,
    );
  }

  return makeResult(
    'TYPO-004',
    'Font Display Strategy',
    pageUrl,
    'pass',
    'info',
    100,
    `All ${fontFaces.length} @font-face rule(s) have an appropriate font-display strategy.`,
    { totalFontFaces: fontFaces.length, fontFaces },
    null,
    null,
  );
}

/**
 * Run typography usability audit across all pages.
 */
export function runTypographyAudit(pages: PageData[]): CheckResult[] {
  const results: CheckResult[] = [];

  for (const page of pages) {
    const html = page.renderedHtml || page.rawHtml;
    if (!html) continue;

    const $ = cheerio.load(html);
    const declarations = extractCssDeclarations($);

    results.push(checkBodyFontSize($, page.url, declarations));
    results.push(checkLineHeight($, page.url, declarations));
    results.push(checkLineLength($, page.url, declarations));
    results.push(checkFontDisplay($, page.url));
  }

  return results;
}
