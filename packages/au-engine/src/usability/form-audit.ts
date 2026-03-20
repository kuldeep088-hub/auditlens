/**
 * Form usability audit.
 * Checks FORM-001 through FORM-005 for form design best practices.
 */

import * as cheerio from 'cheerio';
import crypto from 'node:crypto';
import type { CheckResult, PageData } from '@audit/types';

/**
 * Escape a string for use in a CSS selector (Node.js-compatible replacement for cssEscape).
 */
function cssEscape(value: string): string {
  return value.replace(/([!"#$%&'()*+,./:;<=>?@[\\\]^`{|}~])/g, '\\$1');
}

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
    category: 'usability-forms',
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
 * Get a truncated outer HTML snippet for an element.
 */
function getSnippet(el: cheerio.Cheerio<any>, maxLen = 200): string {
  const node = el.get(0);
  if (!node || node.type !== 'tag') return '';
  const tag = node.tagName;
  let attrs = '';
  for (const [key, value] of Object.entries(node.attribs || {})) {
    attrs += ` ${key}="${String(value).replace(/"/g, '&quot;')}"`;
  }
  const inner = el.text().trim();
  const innerSnip = inner.length > 40 ? inner.slice(0, 40) + '...' : inner;
  const html = `<${tag}${attrs}>${innerSnip}</${tag}>`;
  return html.length > maxLen ? html.slice(0, maxLen) + '...' : html;
}

/**
 * FORM-001: Visible labels.
 * Every form input should have a visible label (not just a placeholder).
 * Placeholder-only inputs are problematic for usability as the hint disappears on focus.
 */
function checkVisibleLabels($: cheerio.CheerioAPI, pageUrl: string): CheckResult {
  const inputs = $('input, select, textarea').not(
    '[type="hidden"], [type="submit"], [type="button"], [type="reset"], [type="image"]',
  );

  if (inputs.length === 0) {
    return makeResult(
      'FORM-001',
      'Visible Form Labels',
      pageUrl,
      'info',
      'info',
      100,
      'No form inputs found on the page.',
      { inputCount: 0 },
      null,
      null,
    );
  }

  let placeholderOnly = 0;
  const violations: string[] = [];

  inputs.each((_, el) => {
    const input = $(el);
    const id = input.attr('id');
    const placeholder = input.attr('placeholder');
    const ariaLabel = input.attr('aria-label');
    const ariaLabelledby = input.attr('aria-labelledby');

    let hasVisibleLabel = false;

    // Check for a <label> with matching for attribute
    if (id) {
      const label = $(`label[for="${cssEscape(id)}"]`);
      if (label.length > 0 && label.text().trim().length > 0) {
        // Check the label is not visually hidden
        const cls = (label.attr('class') || '').toLowerCase();
        const style = (label.attr('style') || '').toLowerCase();
        const isSrOnly =
          cls.includes('sr-only') ||
          cls.includes('visually-hidden') ||
          cls.includes('screen-reader') ||
          style.includes('display: none') ||
          style.includes('display:none') ||
          style.includes('position: absolute') && style.includes('clip');

        if (!isSrOnly) {
          hasVisibleLabel = true;
        }
      }
    }

    // Check for wrapping <label>
    if (!hasVisibleLabel) {
      const parentLabel = input.closest('label');
      if (parentLabel.length > 0) {
        // Check if the label has text beyond just the input's own content
        const labelText = parentLabel.clone().children('input, select, textarea').remove().end().text().trim();
        if (labelText.length > 0) {
          const cls = (parentLabel.attr('class') || '').toLowerCase();
          if (!cls.includes('sr-only') && !cls.includes('visually-hidden')) {
            hasVisibleLabel = true;
          }
        }
      }
    }

    // Float label / adjacent text patterns are hard to detect statically,
    // so we also accept aria-labelledby pointing to a visible element
    if (!hasVisibleLabel && ariaLabelledby) {
      const ids = ariaLabelledby.trim().split(/\s+/);
      for (const refId of ids) {
        const refEl = $(`#${cssEscape(refId)}`);
        if (refEl.length > 0) {
          const cls = (refEl.attr('class') || '').toLowerCase();
          const style = (refEl.attr('style') || '').toLowerCase();
          if (
            !cls.includes('sr-only') &&
            !cls.includes('visually-hidden') &&
            !style.includes('display: none') &&
            !style.includes('display:none')
          ) {
            hasVisibleLabel = true;
            break;
          }
        }
      }
    }

    // If only aria-label or placeholder exist, it's not a visible label
    if (!hasVisibleLabel && placeholder && (ariaLabel || !id)) {
      placeholderOnly++;
      violations.push(getSnippet(input));
    } else if (!hasVisibleLabel && !placeholder && !ariaLabel) {
      // No label at all
      placeholderOnly++;
      violations.push(getSnippet(input));
    } else if (!hasVisibleLabel) {
      placeholderOnly++;
      violations.push(getSnippet(input));
    }
  });

  if (placeholderOnly > 0) {
    const score = Math.round(((inputs.length - placeholderOnly) / inputs.length) * 100);
    return makeResult(
      'FORM-001',
      'Visible Form Labels',
      pageUrl,
      'fail',
      'high',
      score,
      `${placeholderOnly} of ${inputs.length} form input(s) lack visible labels.`,
      { placeholderOnlyCount: placeholderOnly, totalInputs: inputs.length, violations: violations.slice(0, 10) },
      'Add visible <label> elements for all form inputs. Placeholders alone are insufficient because they disappear when users start typing.',
      violations[0] ?? null,
    );
  }

  return makeResult(
    'FORM-001',
    'Visible Form Labels',
    pageUrl,
    'pass',
    'info',
    100,
    `All ${inputs.length} form input(s) have visible labels.`,
    { totalInputs: inputs.length },
    null,
    null,
  );
}

/**
 * FORM-002: Appropriate input types.
 * Inputs should use semantic HTML5 types (email, tel, url, number, date) when applicable,
 * rather than plain text inputs, for better mobile UX and validation.
 */
function checkInputTypes($: cheerio.CheerioAPI, pageUrl: string): CheckResult {
  const textInputs = $('input[type="text"], input:not([type])').not('[type="hidden"]');

  if (textInputs.length === 0) {
    return makeResult(
      'FORM-002',
      'Appropriate Input Types',
      pageUrl,
      'info',
      'info',
      100,
      'No text inputs found to evaluate.',
      { textInputCount: 0 },
      null,
      null,
    );
  }

  const suspiciousInputs: { element: string; suggestedType: string; reason: string }[] = [];

  // Pattern-based detection via name, id, placeholder, label text
  const typeHints: { pattern: RegExp; type: string; label: string }[] = [
    { pattern: /email|e-mail|e_mail/i, type: 'email', label: 'email' },
    { pattern: /phone|tel|mobile|fax|cell/i, type: 'tel', label: 'telephone' },
    { pattern: /\burl\b|website|homepage|web.?site/i, type: 'url', label: 'URL' },
    { pattern: /\bdate\b|birthday|dob|birth.?date/i, type: 'date', label: 'date' },
    { pattern: /\bnumber\b|quantity|qty|amount|count|age|zip|postal/i, type: 'number', label: 'number' },
    { pattern: /password|passwd|pass.?word/i, type: 'password', label: 'password' },
  ];

  textInputs.each((_, el) => {
    const input = $(el);
    const name = (input.attr('name') || '').toLowerCase();
    const id = (input.attr('id') || '').toLowerCase();
    const placeholder = (input.attr('placeholder') || '').toLowerCase();
    const autocomplete = (input.attr('autocomplete') || '').toLowerCase();

    // Also check the associated label
    let labelText = '';
    const inputId = input.attr('id');
    if (inputId) {
      labelText = ($(`label[for="${cssEscape(inputId)}"]`).text() || '').toLowerCase();
    }
    const parentLabel = input.closest('label').text().toLowerCase();
    const combined = `${name} ${id} ${placeholder} ${autocomplete} ${labelText} ${parentLabel}`;

    for (const hint of typeHints) {
      if (hint.pattern.test(combined)) {
        suspiciousInputs.push({
          element: getSnippet(input),
          suggestedType: hint.type,
          reason: `Input appears to collect ${hint.label} data but uses type="text".`,
        });
        break;
      }
    }
  });

  if (suspiciousInputs.length > 0) {
    const score = Math.round(((textInputs.length - suspiciousInputs.length) / textInputs.length) * 100);
    return makeResult(
      'FORM-002',
      'Appropriate Input Types',
      pageUrl,
      'warning',
      'warning',
      Math.max(score, 30),
      `${suspiciousInputs.length} text input(s) could benefit from a more specific input type.`,
      { suspiciousCount: suspiciousInputs.length, totalTextInputs: textInputs.length, suggestions: suspiciousInputs.slice(0, 10) },
      'Use semantic HTML5 input types (email, tel, url, number, date) for better mobile keyboards and built-in validation.',
      suspiciousInputs[0]?.element ?? null,
    );
  }

  return makeResult(
    'FORM-002',
    'Appropriate Input Types',
    pageUrl,
    'pass',
    'info',
    100,
    `All ${textInputs.length} text input(s) appear to use appropriate types.`,
    { totalTextInputs: textInputs.length },
    null,
    null,
  );
}

/**
 * FORM-003: Autocomplete attributes.
 * Common personal data inputs (name, email, address, etc.) should have autocomplete attributes
 * for faster form completion.
 */
function checkAutocomplete($: cheerio.CheerioAPI, pageUrl: string): CheckResult {
  const inputs = $('input').not('[type="hidden"], [type="submit"], [type="button"], [type="reset"], [type="checkbox"], [type="radio"], [type="file"], [type="image"]');

  if (inputs.length === 0) {
    return makeResult(
      'FORM-003',
      'Autocomplete Attributes',
      pageUrl,
      'info',
      'info',
      100,
      'No applicable form inputs found.',
      { inputCount: 0 },
      null,
      null,
    );
  }

  // Inputs that should typically have autocomplete
  const autocompleteHints: { pattern: RegExp; value: string }[] = [
    { pattern: /^(first.?name|fname|given.?name)$/i, value: 'given-name' },
    { pattern: /^(last.?name|lname|surname|family.?name)$/i, value: 'family-name' },
    { pattern: /^(full.?name|name)$/i, value: 'name' },
    { pattern: /^(email|e.?mail)$/i, value: 'email' },
    { pattern: /^(phone|tel|telephone|mobile)$/i, value: 'tel' },
    { pattern: /^(address|street|address.?1|address.?line.?1)$/i, value: 'address-line1' },
    { pattern: /^(city|town)$/i, value: 'address-level2' },
    { pattern: /^(state|province|region)$/i, value: 'address-level1' },
    { pattern: /^(zip|postal|postcode|zip.?code|postal.?code)$/i, value: 'postal-code' },
    { pattern: /^(country)$/i, value: 'country-name' },
    { pattern: /^(cc.?name|card.?name|cardholder)$/i, value: 'cc-name' },
    { pattern: /^(cc.?number|card.?number)$/i, value: 'cc-number' },
    { pattern: /^(username|user.?name|login)$/i, value: 'username' },
    { pattern: /^(password|passwd|pass)$/i, value: 'current-password' },
    { pattern: /^(new.?password|confirm.?password)$/i, value: 'new-password' },
  ];

  let missingAutocomplete = 0;
  const suggestions: { element: string; name: string; suggestedAutocomplete: string }[] = [];

  inputs.each((_, el) => {
    const input = $(el);
    const name = input.attr('name') || '';
    const id = input.attr('id') || '';
    const existingAutocomplete = input.attr('autocomplete');

    if (existingAutocomplete && existingAutocomplete !== 'off') {
      return; // Already has autocomplete
    }

    const identifier = name || id;
    for (const hint of autocompleteHints) {
      if (hint.pattern.test(identifier)) {
        missingAutocomplete++;
        suggestions.push({
          element: getSnippet(input),
          name: identifier,
          suggestedAutocomplete: hint.value,
        });
        break;
      }
    }
  });

  if (missingAutocomplete > 0) {
    return makeResult(
      'FORM-003',
      'Autocomplete Attributes',
      pageUrl,
      'warning',
      'warning',
      Math.max(30, 100 - missingAutocomplete * 15),
      `${missingAutocomplete} input(s) could benefit from autocomplete attributes.`,
      { missingCount: missingAutocomplete, totalInputs: inputs.length, suggestions: suggestions.slice(0, 10) },
      'Add autocomplete attributes to personal data inputs (e.g., autocomplete="email") for faster form completion.',
      suggestions[0]?.element ?? null,
    );
  }

  return makeResult(
    'FORM-003',
    'Autocomplete Attributes',
    pageUrl,
    'pass',
    'info',
    100,
    'All applicable inputs have autocomplete attributes or do not appear to collect personal data.',
    { totalInputs: inputs.length },
    null,
    null,
  );
}

/**
 * FORM-004: Required fields are clearly marked.
 * Required inputs should be visually indicated (not just through the required attribute).
 * Check for asterisks, "(required)" text, or aria-required.
 */
function checkRequiredMarked($: cheerio.CheerioAPI, pageUrl: string): CheckResult {
  const requiredInputs = $('input[required], select[required], textarea[required], [aria-required="true"]');

  if (requiredInputs.length === 0) {
    return makeResult(
      'FORM-004',
      'Required Fields Marked',
      pageUrl,
      'info',
      'info',
      100,
      'No required form fields found.',
      { requiredCount: 0 },
      null,
      null,
    );
  }

  let unmarkedRequired = 0;
  const violations: string[] = [];

  requiredInputs.each((_, el) => {
    const input = $(el);
    const id = input.attr('id');
    let isMarked = false;

    // Check for aria-required (accessible, good)
    if (input.attr('aria-required') === 'true') {
      isMarked = true;
    }

    // Check associated label for asterisk or "(required)"
    if (id) {
      const label = $(`label[for="${cssEscape(id)}"]`);
      const labelText = label.text();
      const labelHtml = label.html() || '';
      if (
        labelText.includes('*') ||
        labelText.toLowerCase().includes('required') ||
        labelHtml.includes('*') ||
        labelHtml.includes('required')
      ) {
        isMarked = true;
      }
    }

    // Check wrapping label
    if (!isMarked) {
      const parentLabel = input.closest('label');
      const labelText = parentLabel.text();
      const labelHtml = parentLabel.html() || '';
      if (
        labelText.includes('*') ||
        labelText.toLowerCase().includes('required') ||
        labelHtml.includes('*') ||
        labelHtml.includes('required')
      ) {
        isMarked = true;
      }
    }

    // Check for adjacent elements with asterisk
    if (!isMarked) {
      const next = input.next();
      const prev = input.prev();
      if (
        (next.text().trim() === '*') ||
        (prev.text().trim() === '*') ||
        next.hasClass('required') ||
        prev.hasClass('required')
      ) {
        isMarked = true;
      }
    }

    // The required attribute itself provides browser validation but not always visible indication
    // We still consider it partially marked
    if (!isMarked && input.attr('required') !== undefined) {
      // Has required attr but no visible mark - count as a mild issue
      // Give partial credit for using the required attribute
      isMarked = false;
    }

    if (!isMarked) {
      unmarkedRequired++;
      violations.push(getSnippet(input));
    }
  });

  if (unmarkedRequired > 0) {
    const score = Math.round(((requiredInputs.length - unmarkedRequired) / requiredInputs.length) * 100);
    return makeResult(
      'FORM-004',
      'Required Fields Marked',
      pageUrl,
      'warning',
      'warning',
      Math.max(score, 30),
      `${unmarkedRequired} of ${requiredInputs.length} required field(s) lack a visible "required" indicator.`,
      { unmarkedCount: unmarkedRequired, totalRequired: requiredInputs.length, violations: violations.slice(0, 10) },
      'Mark required fields with a visible asterisk (*) or the text "(required)" next to the label. Also use aria-required="true" for screen readers.',
      violations[0] ?? null,
    );
  }

  return makeResult(
    'FORM-004',
    'Required Fields Marked',
    pageUrl,
    'pass',
    'info',
    100,
    `All ${requiredInputs.length} required field(s) are visibly marked.`,
    { totalRequired: requiredInputs.length },
    null,
    null,
  );
}

/**
 * FORM-005: Submit button clarity.
 * Forms should have a clearly labeled submit button (not just "Submit").
 * The button text should describe the action (e.g., "Create Account", "Place Order").
 */
function checkSubmitButtonClarity($: cheerio.CheerioAPI, pageUrl: string): CheckResult {
  const forms = $('form');

  if (forms.length === 0) {
    return makeResult(
      'FORM-005',
      'Submit Button Clarity',
      pageUrl,
      'info',
      'info',
      100,
      'No forms found on the page.',
      { formCount: 0 },
      null,
      null,
    );
  }

  let formsWithoutSubmit = 0;
  let formsWithGenericSubmit = 0;
  const issues: { formIndex: number; issue: string; element: string | null }[] = [];

  const genericLabels = ['submit', 'go', 'send', 'ok', 'click', 'continue'];

  forms.each((i, el) => {
    const form = $(el);

    // Find submit buttons within the form
    const submitButtons = form.find(
      'button[type="submit"], input[type="submit"], button:not([type]), [role="button"][type="submit"]',
    );

    if (submitButtons.length === 0) {
      // Check for any button at all
      const anyButton = form.find('button, input[type="button"], [role="button"]');
      if (anyButton.length === 0) {
        formsWithoutSubmit++;
        issues.push({
          formIndex: i,
          issue: 'Form has no submit button.',
          element: null,
        });
        return;
      }
    }

    submitButtons.each((_, btn) => {
      const button = $(btn);
      let label = '';

      if (button.is('input')) {
        label = button.attr('value') || '';
      } else {
        label = button.text().trim();
      }

      // Check aria-label as alternative
      const ariaLabel = button.attr('aria-label');
      if (ariaLabel && ariaLabel.trim().length > 0) {
        label = ariaLabel.trim();
      }

      if (!label) {
        formsWithoutSubmit++;
        issues.push({
          formIndex: i,
          issue: 'Submit button has no visible label.',
          element: getSnippet(button),
        });
      } else if (genericLabels.includes(label.toLowerCase().trim())) {
        formsWithGenericSubmit++;
        issues.push({
          formIndex: i,
          issue: `Submit button uses generic label: "${label}".`,
          element: getSnippet(button),
        });
      }
    });
  });

  if (formsWithoutSubmit > 0) {
    return makeResult(
      'FORM-005',
      'Submit Button Clarity',
      pageUrl,
      'fail',
      'high',
      Math.max(0, 100 - formsWithoutSubmit * 30),
      `${formsWithoutSubmit} form(s) lack a visible submit button.`,
      { formsWithoutSubmit, formsWithGenericSubmit, totalForms: forms.length, issues: issues.slice(0, 10) },
      'Add a clearly labeled submit button to every form. The label should describe the action (e.g., "Create Account").',
      issues[0]?.element ?? null,
    );
  }

  if (formsWithGenericSubmit > 0) {
    return makeResult(
      'FORM-005',
      'Submit Button Clarity',
      pageUrl,
      'warning',
      'warning',
      Math.max(50, 100 - formsWithGenericSubmit * 15),
      `${formsWithGenericSubmit} form(s) use generic submit button labels.`,
      { formsWithoutSubmit: 0, formsWithGenericSubmit, totalForms: forms.length, issues: issues.slice(0, 10) },
      'Use descriptive button text that explains the action (e.g., "Create Account" instead of "Submit").',
      issues[0]?.element ?? null,
    );
  }

  return makeResult(
    'FORM-005',
    'Submit Button Clarity',
    pageUrl,
    'pass',
    'info',
    100,
    `All ${forms.length} form(s) have clearly labeled submit buttons.`,
    { totalForms: forms.length },
    null,
    null,
  );
}

/**
 * Run form usability audit across all pages.
 */
export function runFormAudit(pages: PageData[]): CheckResult[] {
  const results: CheckResult[] = [];

  for (const page of pages) {
    const html = page.renderedHtml || page.rawHtml;
    if (!html) continue;

    const $ = cheerio.load(html);

    // Only run form checks if there are forms or form-like elements
    const hasForms = $('form, input, select, textarea').length > 0;
    if (!hasForms) {
      results.push(
        makeResult(
          'FORM-001',
          'Visible Form Labels',
          page.url,
          'info',
          'info',
          100,
          'No forms or form elements found on this page.',
          { inputCount: 0 },
          null,
          null,
        ),
      );
      continue;
    }

    results.push(checkVisibleLabels($, page.url));
    results.push(checkInputTypes($, page.url));
    results.push(checkAutocomplete($, page.url));
    results.push(checkRequiredMarked($, page.url));
    results.push(checkSubmitButtonClarity($, page.url));
  }

  return results;
}
