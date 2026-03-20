/**
 * Accessibility checker using cheerio-based HTML analysis.
 * Performs static analysis of raw HTML to detect WCAG violations
 * without requiring a live browser context.
 */

import * as cheerio from 'cheerio';
import crypto from 'node:crypto';
import type { CheckResult, PageData } from '@audit/types';
import { getWcagCriterion } from './wcag-mapper.js';

/**
 * Escape a string for use in a CSS selector (Node.js-compatible replacement for cssEscape).
 */
function cssEscape(value: string): string {
  return value.replace(/([!"#$%&'()*+,./:;<=>?@[\\\]^`{|}~])/g, '\\$1');
}

// Valid ARIA landmark roles
const VALID_ARIA_ROLES = new Set([
  'alert',
  'alertdialog',
  'application',
  'article',
  'banner',
  'button',
  'cell',
  'checkbox',
  'columnheader',
  'combobox',
  'complementary',
  'contentinfo',
  'definition',
  'dialog',
  'directory',
  'document',
  'feed',
  'figure',
  'form',
  'grid',
  'gridcell',
  'group',
  'heading',
  'img',
  'link',
  'list',
  'listbox',
  'listitem',
  'log',
  'main',
  'marquee',
  'math',
  'menu',
  'menubar',
  'menuitem',
  'menuitemcheckbox',
  'menuitemradio',
  'navigation',
  'none',
  'note',
  'option',
  'presentation',
  'progressbar',
  'radio',
  'radiogroup',
  'region',
  'row',
  'rowgroup',
  'rowheader',
  'scrollbar',
  'search',
  'searchbox',
  'separator',
  'slider',
  'spinbutton',
  'status',
  'switch',
  'tab',
  'table',
  'tablist',
  'tabpanel',
  'term',
  'textbox',
  'timer',
  'toolbar',
  'tooltip',
  'tree',
  'treegrid',
  'treeitem',
]);

// Link text patterns that are considered poor
const BAD_LINK_TEXT_PATTERNS = [
  /^click\s*here$/i,
  /^here$/i,
  /^read\s*more$/i,
  /^more$/i,
  /^link$/i,
  /^learn\s*more$/i,
  /^go$/i,
  /^this$/i,
  /^page$/i,
  /^this\s*page$/i,
  /^info$/i,
  /^details$/i,
];

// Valid BCP 47 language tag pattern (simplified)
const LANG_TAG_PATTERN = /^[a-z]{2,3}(-[A-Z][a-z]{3})?(-([A-Z]{2}|[0-9]{3}))?$/i;

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
    category: 'accessibility',
    pageUrl,
    status,
    severity,
    score: Math.max(0, Math.min(100, score)),
    message,
    details,
    recommendation,
    wcagCriterion: getWcagCriterion(checkId),
    element,
  };
}

/**
 * AXE-IMG-ALT: Check all images for alt text (WCAG 1.1.1).
 * Every <img> must have an alt attribute. Decorative images should use alt="".
 */
function checkImageAlt($: cheerio.CheerioAPI, pageUrl: string): CheckResult[] {
  const results: CheckResult[] = [];
  const images = $('img');

  if (images.length === 0) {
    results.push(
      makeResult(
        'AXE-IMG-ALT',
        'Image Alt Text',
        pageUrl,
        'info',
        'info',
        100,
        'No images found on page.',
        { imageCount: 0 },
        null,
        null,
      ),
    );
    return results;
  }

  let missingAlt = 0;
  const violations: string[] = [];

  images.each((_, el) => {
    const img = $(el);
    const altAttr = img.attr('alt');
    const src = img.attr('src') || '(unknown)';
    const role = img.attr('role');

    // Images with role="presentation" or role="none" are decorative
    if (role === 'presentation' || role === 'none') {
      return;
    }

    if (altAttr === undefined) {
      missingAlt++;
      violations.push(src);
    }
  });

  if (missingAlt > 0) {
    const score = Math.round(((images.length - missingAlt) / images.length) * 100);
    results.push(
      makeResult(
        'AXE-IMG-ALT',
        'Image Alt Text',
        pageUrl,
        'fail',
        'critical',
        score,
        `${missingAlt} image(s) missing alt attribute out of ${images.length} total.`,
        { missingCount: missingAlt, totalImages: images.length, violatingSrcs: violations.slice(0, 10) },
        'Add descriptive alt text to all images. Use alt="" for purely decorative images.',
        violations[0] ? `<img src="${violations[0]}">` : null,
      ),
    );
  } else {
    results.push(
      makeResult(
        'AXE-IMG-ALT',
        'Image Alt Text',
        pageUrl,
        'pass',
        'info',
        100,
        `All ${images.length} image(s) have alt attributes.`,
        { totalImages: images.length },
        null,
        null,
      ),
    );
  }

  return results;
}

/**
 * AXE-HTML-LANG: Check html lang attribute (WCAG 3.1.1).
 * The <html> element must have a valid lang attribute.
 */
function checkHtmlLang($: cheerio.CheerioAPI, pageUrl: string): CheckResult[] {
  const results: CheckResult[] = [];
  const htmlEl = $('html');
  const lang = htmlEl.attr('lang');

  if (!lang) {
    results.push(
      makeResult(
        'AXE-HTML-LANG',
        'HTML Language Attribute',
        pageUrl,
        'fail',
        'critical',
        0,
        'The <html> element does not have a lang attribute.',
        { lang: null },
        'Add a lang attribute to the <html> element, e.g., <html lang="en">.',
        '<html>',
      ),
    );
  } else if (!LANG_TAG_PATTERN.test(lang.trim())) {
    results.push(
      makeResult(
        'AXE-HTML-LANG',
        'HTML Language Attribute',
        pageUrl,
        'fail',
        'high',
        30,
        `The <html> element has an invalid lang attribute value: "${lang}".`,
        { lang },
        'Use a valid BCP 47 language tag, e.g., "en", "en-US", "fr", "de".',
        `<html lang="${lang}">`,
      ),
    );
  } else {
    results.push(
      makeResult(
        'AXE-HTML-LANG',
        'HTML Language Attribute',
        pageUrl,
        'pass',
        'info',
        100,
        `The <html> element has a valid lang attribute: "${lang}".`,
        { lang },
        null,
        null,
      ),
    );
  }

  return results;
}

/**
 * AXE-COLOR-CONTRAST: Basic color contrast check (WCAG 1.4.3).
 * Since we cannot compute rendered styles, we flag elements with inline
 * color/background-color styles for manual review and detect known-bad patterns.
 */
function checkColorContrast($: cheerio.CheerioAPI, pageUrl: string): CheckResult[] {
  const results: CheckResult[] = [];
  const flagged: { element: string; color: string; background: string }[] = [];

  $('[style]').each((_, el) => {
    const elem = $(el);
    const style = elem.attr('style') || '';

    const colorMatch = style.match(/(?:^|;)\s*color\s*:\s*([^;]+)/i);
    const bgMatch = style.match(/(?:^|;)\s*background(?:-color)?\s*:\s*([^;]+)/i);

    if (colorMatch && bgMatch) {
      const color = colorMatch[1].trim();
      const background = bgMatch[1].trim();

      // Flag same or very similar values
      if (color.toLowerCase() === background.toLowerCase()) {
        flagged.push({
          element: getOuterHtmlSnippet(elem),
          color,
          background,
        });
      }
    }
  });

  // Also check for light-on-light or dark-on-dark known patterns
  $('[style]').each((_, el) => {
    const elem = $(el);
    const style = elem.attr('style') || '';

    const colorMatch = style.match(/(?:^|;)\s*color\s*:\s*([^;]+)/i);
    const bgMatch = style.match(/(?:^|;)\s*background(?:-color)?\s*:\s*([^;]+)/i);

    if (colorMatch || bgMatch) {
      // If only one is set, we can't determine contrast without computed styles
      // But we still flag the element for review if it has text
      const text = elem.text().trim();
      if (text && colorMatch && bgMatch) {
        const color = colorMatch[1].trim().toLowerCase();
        const bg = bgMatch[1].trim().toLowerCase();
        if (
          (isLightColor(color) && isLightColor(bg)) ||
          (isDarkColor(color) && isDarkColor(bg))
        ) {
          if (!flagged.find((f) => f.element === getOuterHtmlSnippet(elem))) {
            flagged.push({
              element: getOuterHtmlSnippet(elem),
              color: colorMatch[1].trim(),
              background: bgMatch[1].trim(),
            });
          }
        }
      }
    }
  });

  if (flagged.length > 0) {
    results.push(
      makeResult(
        'AXE-COLOR-CONTRAST',
        'Color Contrast',
        pageUrl,
        'warning',
        'warning',
        60,
        `${flagged.length} element(s) have inline color styles that may have insufficient contrast.`,
        { flaggedElements: flagged.slice(0, 10), totalFlagged: flagged.length },
        'Review these elements for WCAG 2.1 AA minimum contrast ratio of 4.5:1 for normal text and 3:1 for large text.',
        flagged[0]?.element ?? null,
      ),
    );
  } else {
    results.push(
      makeResult(
        'AXE-COLOR-CONTRAST',
        'Color Contrast',
        pageUrl,
        'info',
        'info',
        100,
        'No inline color styles detected that could be automatically checked. Manual review recommended.',
        { flaggedElements: [] },
        'Use a contrast checker tool to verify all text meets WCAG AA contrast ratios.',
        null,
      ),
    );
  }

  return results;
}

/**
 * AXE-FORM-LABEL: Check form labels (WCAG 1.3.1 / 3.3.2).
 * All input, select, and textarea elements must have an associated label
 * (via <label for="...">, wrapping <label>, aria-label, or aria-labelledby).
 */
function checkFormLabels($: cheerio.CheerioAPI, pageUrl: string): CheckResult[] {
  const results: CheckResult[] = [];
  const formControls = $('input, select, textarea').not('[type="hidden"], [type="submit"], [type="button"], [type="reset"], [type="image"]');

  if (formControls.length === 0) {
    results.push(
      makeResult(
        'AXE-FORM-LABEL',
        'Form Input Labels',
        pageUrl,
        'info',
        'info',
        100,
        'No form controls found on page.',
        { controlCount: 0 },
        null,
        null,
      ),
    );
    return results;
  }

  let unlabeled = 0;
  const violations: string[] = [];

  formControls.each((_, el) => {
    const control = $(el);
    const id = control.attr('id');
    const ariaLabel = control.attr('aria-label');
    const ariaLabelledby = control.attr('aria-labelledby');
    const title = control.attr('title');
    const placeholder = control.attr('placeholder');

    // Check for associated label
    let hasLabel = false;

    // 1. aria-label
    if (ariaLabel && ariaLabel.trim().length > 0) {
      hasLabel = true;
    }

    // 2. aria-labelledby
    if (!hasLabel && ariaLabelledby && ariaLabelledby.trim().length > 0) {
      // Verify the referenced element exists
      const refIds = ariaLabelledby.trim().split(/\s+/);
      for (const refId of refIds) {
        if ($(`#${cssEscape(refId)}`).length > 0) {
          hasLabel = true;
          break;
        }
      }
    }

    // 3. <label for="id">
    if (!hasLabel && id) {
      const labelFor = $(`label[for="${cssEscape(id)}"]`);
      if (labelFor.length > 0 && labelFor.text().trim().length > 0) {
        hasLabel = true;
      }
    }

    // 4. Wrapping <label>
    if (!hasLabel) {
      const parentLabel = control.closest('label');
      if (parentLabel.length > 0 && parentLabel.text().trim().length > 0) {
        hasLabel = true;
      }
    }

    // 5. title attribute (accepted but not ideal)
    if (!hasLabel && title && title.trim().length > 0) {
      hasLabel = true;
    }

    // Note: placeholder alone is NOT sufficient for labeling

    if (!hasLabel) {
      unlabeled++;
      violations.push(getOuterHtmlSnippet(control));
    }
  });

  if (unlabeled > 0) {
    const score = Math.round(((formControls.length - unlabeled) / formControls.length) * 100);
    results.push(
      makeResult(
        'AXE-FORM-LABEL',
        'Form Input Labels',
        pageUrl,
        'fail',
        'critical',
        score,
        `${unlabeled} form control(s) out of ${formControls.length} are missing accessible labels.`,
        { unlabeledCount: unlabeled, totalControls: formControls.length, violations: violations.slice(0, 10) },
        'Add a <label> element, aria-label, or aria-labelledby attribute to every form control.',
        violations[0] ?? null,
      ),
    );
  } else {
    results.push(
      makeResult(
        'AXE-FORM-LABEL',
        'Form Input Labels',
        pageUrl,
        'pass',
        'info',
        100,
        `All ${formControls.length} form control(s) have accessible labels.`,
        { totalControls: formControls.length },
        null,
        null,
      ),
    );
  }

  return results;
}

/**
 * AXE-HEADING-ORDER: Check heading hierarchy (WCAG 1.3.1).
 * Headings should not skip levels (e.g., h1 -> h3 with no h2).
 */
function checkHeadingOrder($: cheerio.CheerioAPI, pageUrl: string): CheckResult[] {
  const results: CheckResult[] = [];
  const headings: { level: number; text: string }[] = [];

  $('h1, h2, h3, h4, h5, h6').each((_, el) => {
    const tag = ((el as any).tagName ?? '').toLowerCase();
    const level = parseInt(tag.charAt(1), 10);
    headings.push({ level, text: $(el).text().trim() });
  });

  if (headings.length === 0) {
    results.push(
      makeResult(
        'AXE-HEADING-ORDER',
        'Heading Order',
        pageUrl,
        'warning',
        'warning',
        50,
        'No headings found on page. Pages should have a heading structure.',
        { headings: [] },
        'Add at least an <h1> heading to the page to establish document structure.',
        null,
      ),
    );
    return results;
  }

  const skips: { from: number; to: number; text: string }[] = [];

  // First heading should ideally be h1
  if (headings[0].level !== 1) {
    skips.push({ from: 0, to: headings[0].level, text: headings[0].text });
  }

  for (let i = 1; i < headings.length; i++) {
    const prev = headings[i - 1].level;
    const curr = headings[i].level;
    // Skipping means jumping more than 1 level deeper (going shallower is fine)
    if (curr > prev + 1) {
      skips.push({ from: prev, to: curr, text: headings[i].text });
    }
  }

  if (skips.length > 0) {
    const score = Math.round(((headings.length - skips.length) / headings.length) * 100);
    results.push(
      makeResult(
        'AXE-HEADING-ORDER',
        'Heading Order',
        pageUrl,
        'fail',
        'warning',
        Math.max(score, 0),
        `${skips.length} heading level skip(s) detected.`,
        { headingStructure: headings, skips },
        'Ensure headings follow a logical order without skipping levels (e.g., do not jump from h1 to h3).',
        skips[0] ? `<h${skips[0].to}>${skips[0].text}</h${skips[0].to}>` : null,
      ),
    );
  } else {
    results.push(
      makeResult(
        'AXE-HEADING-ORDER',
        'Heading Order',
        pageUrl,
        'pass',
        'info',
        100,
        `All ${headings.length} heading(s) follow a correct hierarchical order.`,
        { headingStructure: headings },
        null,
        null,
      ),
    );
  }

  return results;
}

/**
 * AXE-LANDMARK-MAIN and AXE-LANDMARK-NAV: Check landmarks (WCAG 1.3.1).
 * Pages should have <main> and <nav> landmarks.
 */
function checkLandmarks($: cheerio.CheerioAPI, pageUrl: string): CheckResult[] {
  const results: CheckResult[] = [];

  // Check for <main> or role="main"
  const mainCount = $('main, [role="main"]').length;
  if (mainCount === 0) {
    results.push(
      makeResult(
        'AXE-LANDMARK-MAIN',
        'Main Landmark',
        pageUrl,
        'fail',
        'high',
        0,
        'No <main> landmark found on the page.',
        { mainCount: 0 },
        'Add a <main> element to wrap the primary content of the page.',
        null,
      ),
    );
  } else if (mainCount > 1) {
    results.push(
      makeResult(
        'AXE-LANDMARK-MAIN',
        'Main Landmark',
        pageUrl,
        'warning',
        'warning',
        70,
        `Multiple <main> landmarks found (${mainCount}). There should be only one.`,
        { mainCount },
        'Use only one <main> element per page.',
        null,
      ),
    );
  } else {
    results.push(
      makeResult(
        'AXE-LANDMARK-MAIN',
        'Main Landmark',
        pageUrl,
        'pass',
        'info',
        100,
        'A single <main> landmark is present.',
        { mainCount: 1 },
        null,
        null,
      ),
    );
  }

  // Check for <nav> or role="navigation"
  const navCount = $('nav, [role="navigation"]').length;
  if (navCount === 0) {
    results.push(
      makeResult(
        'AXE-LANDMARK-NAV',
        'Navigation Landmark',
        pageUrl,
        'warning',
        'warning',
        50,
        'No <nav> landmark found on the page.',
        { navCount: 0 },
        'Add a <nav> element to wrap primary navigation links.',
        null,
      ),
    );
  } else {
    results.push(
      makeResult(
        'AXE-LANDMARK-NAV',
        'Navigation Landmark',
        pageUrl,
        'pass',
        'info',
        100,
        `${navCount} <nav> landmark(s) found.`,
        { navCount },
        null,
        null,
      ),
    );
  }

  return results;
}

/**
 * AXE-ARIA-ROLES: Check ARIA role validity (WCAG 4.1.2).
 * All role attribute values must be valid WAI-ARIA roles.
 */
function checkAriaRoles($: cheerio.CheerioAPI, pageUrl: string): CheckResult[] {
  const results: CheckResult[] = [];
  const invalidRoles: { element: string; role: string }[] = [];

  $('[role]').each((_, el) => {
    const elem = $(el);
    const role = elem.attr('role')?.trim().toLowerCase();

    if (role && !VALID_ARIA_ROLES.has(role)) {
      // Role may be a space-separated list of tokens
      const roles = role.split(/\s+/);
      for (const r of roles) {
        if (r && !VALID_ARIA_ROLES.has(r)) {
          invalidRoles.push({
            element: getOuterHtmlSnippet(elem),
            role: r,
          });
        }
      }
    }
  });

  if (invalidRoles.length > 0) {
    results.push(
      makeResult(
        'AXE-ARIA-ROLES',
        'ARIA Role Validity',
        pageUrl,
        'fail',
        'high',
        Math.max(0, 100 - invalidRoles.length * 20),
        `${invalidRoles.length} invalid ARIA role(s) found.`,
        { invalidRoles: invalidRoles.slice(0, 10) },
        'Use only valid WAI-ARIA role values. Refer to the WAI-ARIA specification for the list of allowed roles.',
        invalidRoles[0]?.element ?? null,
      ),
    );
  } else {
    const roledElements = $('[role]').length;
    results.push(
      makeResult(
        'AXE-ARIA-ROLES',
        'ARIA Role Validity',
        pageUrl,
        'pass',
        'info',
        100,
        roledElements > 0
          ? `All ${roledElements} ARIA role(s) are valid.`
          : 'No ARIA roles found on page.',
        { totalRoledElements: roledElements },
        null,
        null,
      ),
    );
  }

  return results;
}

/**
 * AXE-DUPLICATE-ID: Check for duplicate IDs (WCAG 4.1.1).
 * Element IDs must be unique within a page.
 */
function checkDuplicateIds($: cheerio.CheerioAPI, pageUrl: string): CheckResult[] {
  const results: CheckResult[] = [];
  const idCounts = new Map<string, number>();

  $('[id]').each((_, el) => {
    const id = $(el).attr('id');
    if (id && id.trim().length > 0) {
      const trimmed = id.trim();
      idCounts.set(trimmed, (idCounts.get(trimmed) || 0) + 1);
    }
  });

  const duplicates: { id: string; count: number }[] = [];
  for (const [id, count] of idCounts) {
    if (count > 1) {
      duplicates.push({ id, count });
    }
  }

  if (duplicates.length > 0) {
    results.push(
      makeResult(
        'AXE-DUPLICATE-ID',
        'Duplicate IDs',
        pageUrl,
        'fail',
        'high',
        Math.max(0, 100 - duplicates.length * 15),
        `${duplicates.length} duplicate ID(s) found on the page.`,
        { duplicates: duplicates.slice(0, 20), totalUniqueIds: idCounts.size },
        'Ensure all id attribute values are unique within the page.',
        duplicates[0] ? `[id="${duplicates[0].id}"]` : null,
      ),
    );
  } else {
    results.push(
      makeResult(
        'AXE-DUPLICATE-ID',
        'Duplicate IDs',
        pageUrl,
        'pass',
        'info',
        100,
        `All ${idCounts.size} IDs are unique.`,
        { totalUniqueIds: idCounts.size },
        null,
        null,
      ),
    );
  }

  return results;
}

/**
 * AXE-LINK-NAME: Check link text quality (WCAG 2.4.4).
 * Links must have discernible text; generic text like "click here" is flagged.
 */
function checkLinkText($: cheerio.CheerioAPI, pageUrl: string): CheckResult[] {
  const results: CheckResult[] = [];
  const links = $('a[href]');

  if (links.length === 0) {
    results.push(
      makeResult(
        'AXE-LINK-NAME',
        'Link Text Quality',
        pageUrl,
        'info',
        'info',
        100,
        'No links found on the page.',
        { linkCount: 0 },
        null,
        null,
      ),
    );
    return results;
  }

  const emptyLinks: string[] = [];
  const genericLinks: { href: string; text: string }[] = [];

  links.each((_, el) => {
    const link = $(el);
    const href = link.attr('href') || '';

    // Gather accessible name: text content, aria-label, aria-labelledby, title, or img alt
    let accessibleName = '';

    const ariaLabel = link.attr('aria-label');
    if (ariaLabel && ariaLabel.trim().length > 0) {
      accessibleName = ariaLabel.trim();
    } else {
      // Check for child img alt text
      const imgAlt = link.find('img').first().attr('alt');
      const textContent = link.text().trim();

      accessibleName = textContent || imgAlt || '';
    }

    // Also check title as fallback
    if (!accessibleName) {
      const title = link.attr('title');
      if (title && title.trim().length > 0) {
        accessibleName = title.trim();
      }
    }

    if (!accessibleName || accessibleName.length === 0) {
      emptyLinks.push(getOuterHtmlSnippet(link));
    } else {
      // Check for generic link text
      for (const pattern of BAD_LINK_TEXT_PATTERNS) {
        if (pattern.test(accessibleName)) {
          genericLinks.push({ href, text: accessibleName });
          break;
        }
      }
    }
  });

  const issueCount = emptyLinks.length + genericLinks.length;

  if (emptyLinks.length > 0) {
    results.push(
      makeResult(
        'AXE-LINK-NAME',
        'Link Text Quality',
        pageUrl,
        'fail',
        'critical',
        Math.round(((links.length - emptyLinks.length) / links.length) * 100),
        `${emptyLinks.length} link(s) have no discernible text.`,
        { emptyCount: emptyLinks.length, emptyLinks: emptyLinks.slice(0, 10) },
        'Add visible text, aria-label, or an img with alt text inside every link.',
        emptyLinks[0] ?? null,
      ),
    );
  }

  if (genericLinks.length > 0) {
    results.push(
      makeResult(
        'AXE-LINK-NAME',
        'Link Text Quality',
        pageUrl,
        'warning',
        'warning',
        Math.round(((links.length - genericLinks.length) / links.length) * 100),
        `${genericLinks.length} link(s) use generic text (e.g., "click here", "read more").`,
        { genericCount: genericLinks.length, genericLinks: genericLinks.slice(0, 10) },
        'Use descriptive link text that explains the destination or action.',
        genericLinks[0] ? `<a href="${genericLinks[0].href}">${genericLinks[0].text}</a>` : null,
      ),
    );
  }

  if (issueCount === 0) {
    results.push(
      makeResult(
        'AXE-LINK-NAME',
        'Link Text Quality',
        pageUrl,
        'pass',
        'info',
        100,
        `All ${links.length} link(s) have descriptive text.`,
        { linkCount: links.length },
        null,
        null,
      ),
    );
  }

  return results;
}

/**
 * AXE-BUTTON-NAME: Check button names (WCAG 4.1.2).
 * All buttons must have an accessible name.
 */
function checkButtonNames($: cheerio.CheerioAPI, pageUrl: string): CheckResult[] {
  const results: CheckResult[] = [];
  const buttons = $('button, [role="button"], input[type="button"], input[type="submit"], input[type="reset"]');

  if (buttons.length === 0) {
    results.push(
      makeResult(
        'AXE-BUTTON-NAME',
        'Button Names',
        pageUrl,
        'info',
        'info',
        100,
        'No buttons found on page.',
        { buttonCount: 0 },
        null,
        null,
      ),
    );
    return results;
  }

  let unnamed = 0;
  const violations: string[] = [];

  buttons.each((_, el) => {
    const button = $(el);
    let hasName = false;

    // Check aria-label
    const ariaLabel = button.attr('aria-label');
    if (ariaLabel && ariaLabel.trim().length > 0) {
      hasName = true;
    }

    // Check aria-labelledby
    if (!hasName) {
      const ariaLabelledby = button.attr('aria-labelledby');
      if (ariaLabelledby && ariaLabelledby.trim().length > 0) {
        hasName = true;
      }
    }

    // Check text content
    if (!hasName) {
      const text = button.text().trim();
      if (text.length > 0) {
        hasName = true;
      }
    }

    // Check value attribute (for input buttons)
    if (!hasName) {
      const value = button.attr('value');
      if (value && value.trim().length > 0) {
        hasName = true;
      }
    }

    // Check title
    if (!hasName) {
      const title = button.attr('title');
      if (title && title.trim().length > 0) {
        hasName = true;
      }
    }

    // Check img alt inside button
    if (!hasName) {
      const imgAlt = button.find('img').first().attr('alt');
      if (imgAlt && imgAlt.trim().length > 0) {
        hasName = true;
      }
    }

    if (!hasName) {
      unnamed++;
      violations.push(getOuterHtmlSnippet(button));
    }
  });

  if (unnamed > 0) {
    results.push(
      makeResult(
        'AXE-BUTTON-NAME',
        'Button Names',
        pageUrl,
        'fail',
        'critical',
        Math.round(((buttons.length - unnamed) / buttons.length) * 100),
        `${unnamed} button(s) out of ${buttons.length} are missing an accessible name.`,
        { unnamedCount: unnamed, totalButtons: buttons.length, violations: violations.slice(0, 10) },
        'Add visible text, aria-label, or a value attribute to all buttons.',
        violations[0] ?? null,
      ),
    );
  } else {
    results.push(
      makeResult(
        'AXE-BUTTON-NAME',
        'Button Names',
        pageUrl,
        'pass',
        'info',
        100,
        `All ${buttons.length} button(s) have accessible names.`,
        { totalButtons: buttons.length },
        null,
        null,
      ),
    );
  }

  return results;
}

/**
 * AXE-TABLE-HEADER: Check table headers (WCAG 1.3.1).
 * Data tables should have <th> elements or headers attribute.
 */
function checkTableHeaders($: cheerio.CheerioAPI, pageUrl: string): CheckResult[] {
  const results: CheckResult[] = [];
  const tables = $('table').not('[role="presentation"], [role="none"]');

  if (tables.length === 0) {
    results.push(
      makeResult(
        'AXE-TABLE-HEADER',
        'Table Headers',
        pageUrl,
        'info',
        'info',
        100,
        'No data tables found on page.',
        { tableCount: 0 },
        null,
        null,
      ),
    );
    return results;
  }

  let tablesWithoutHeaders = 0;
  const violations: string[] = [];

  tables.each((_, el) => {
    const table = $(el);
    const headers = table.find('th');
    const cellsWithHeaders = table.find('td[headers]');
    const caption = table.find('caption');
    const ariaLabel = table.attr('aria-label');
    const ariaLabelledby = table.attr('aria-labelledby');

    // A data table should have th elements or td[headers]
    if (headers.length === 0 && cellsWithHeaders.length === 0) {
      tablesWithoutHeaders++;
      // Get a snippet of the table (just opening tag + first row)
      const snippet = getOuterHtmlSnippet(table);
      violations.push(snippet);
    }
  });

  if (tablesWithoutHeaders > 0) {
    results.push(
      makeResult(
        'AXE-TABLE-HEADER',
        'Table Headers',
        pageUrl,
        'fail',
        'high',
        Math.round(((tables.length - tablesWithoutHeaders) / tables.length) * 100),
        `${tablesWithoutHeaders} data table(s) out of ${tables.length} lack header cells (<th>).`,
        { tablesWithoutHeaders, totalTables: tables.length, violations: violations.slice(0, 5) },
        'Add <th> elements to identify row and column headers in data tables.',
        violations[0] ?? null,
      ),
    );
  } else {
    results.push(
      makeResult(
        'AXE-TABLE-HEADER',
        'Table Headers',
        pageUrl,
        'pass',
        'info',
        100,
        `All ${tables.length} data table(s) have proper header cells.`,
        { totalTables: tables.length },
        null,
        null,
      ),
    );
  }

  return results;
}

// ---- Utility functions ----

/**
 * Get a truncated outer HTML snippet for reporting.
 */
function getOuterHtmlSnippet(el: cheerio.Cheerio<any>, maxLen = 200): string {
  // Reconstruct the opening tag
  const node = el.get(0);
  if (!node || node.type !== 'tag') return '';

  const tag = node.tagName;
  let attrs = '';
  for (const [key, value] of Object.entries(node.attribs || {})) {
    attrs += ` ${key}="${escapeAttr(String(value))}"`;
  }

  const text = el.text().trim();
  const snippet = text.length > 50 ? text.slice(0, 50) + '...' : text;
  const html = `<${tag}${attrs}>${snippet}</${tag}>`;

  return html.length > maxLen ? html.slice(0, maxLen) + '...' : html;
}

function escapeAttr(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Rough heuristic to detect if a named CSS color / hex is "light".
 */
function isLightColor(color: string): boolean {
  const light = ['white', '#fff', '#ffffff', '#fafafa', '#f5f5f5', '#eee', '#eeeeee', '#ddd', '#dddddd', 'rgb(255,255,255)', 'rgb(255, 255, 255)', '#f0f0f0', '#e0e0e0', 'lightyellow', 'lightyellow', 'ivory', 'snow', 'ghostwhite', 'floralwhite', 'linen', 'oldlace', 'seashell', 'beige', 'cornsilk', 'lemonchiffon', 'lightgoldenrodyellow', 'honeydew', 'mintcream', 'azure', 'aliceblue', 'lavender', 'lavenderblush', 'mistyrose', 'whitesmoke'];
  return light.includes(color.toLowerCase().replace(/\s/g, ''));
}

function isDarkColor(color: string): boolean {
  const dark = ['black', '#000', '#000000', '#111', '#111111', '#222', '#222222', '#333', '#333333', 'rgb(0,0,0)', 'rgb(0, 0, 0)', 'darkslategray', 'darkslategrey', '#1a1a1a', '#0a0a0a', '#2b2b2b'];
  return dark.includes(color.toLowerCase().replace(/\s/g, ''));
}

/**
 * Run all accessibility checks on a single page's HTML.
 */
function runChecksOnPage(page: PageData): CheckResult[] {
  const html = page.renderedHtml || page.rawHtml;
  if (!html) {
    return [
      makeResult(
        'AXE-PARSE-ERROR',
        'HTML Parse Error',
        page.url,
        'error',
        'critical',
        0,
        'No HTML content available for accessibility analysis.',
        null,
        'Ensure the page returns valid HTML content.',
        null,
      ),
    ];
  }

  const $ = cheerio.load(html);
  const results: CheckResult[] = [];

  results.push(...checkImageAlt($, page.url));
  results.push(...checkHtmlLang($, page.url));
  results.push(...checkColorContrast($, page.url));
  results.push(...checkFormLabels($, page.url));
  results.push(...checkHeadingOrder($, page.url));
  results.push(...checkLandmarks($, page.url));
  results.push(...checkAriaRoles($, page.url));
  results.push(...checkDuplicateIds($, page.url));
  results.push(...checkLinkText($, page.url));
  results.push(...checkButtonNames($, page.url));
  results.push(...checkTableHeaders($, page.url));

  return results;
}

/**
 * Run accessibility audit across all crawled pages.
 */
export function runAccessibilityAudit(pages: PageData[]): CheckResult[] {
  const results: CheckResult[] = [];

  for (const page of pages) {
    results.push(...runChecksOnPage(page));
  }

  return results;
}
