import type { CheckResult, PageData } from '@audit/types';
import { randomUUID } from 'crypto';

/**
 * MOBILE-001 through MOBILE-004
 * Audits mobile-friendliness using rawHtml parsing.
 */
export function runMobileAudit(pages: PageData[]): CheckResult[] {
  const results: CheckResult[] = [];
  const okPages = pages.filter((p) => p.statusCode === 200);

  if (okPages.length === 0) return results;

  // ── MOBILE-001: viewport meta tag ─────────────────────────────────────
  const missingViewport: string[] = [];
  const badViewport: { url: string; content: string }[] = [];
  for (const page of okPages) {
    const html = page.rawHtml || '';
    const viewportMatch = html.match(
      /<meta\s[^>]*name=["']viewport["'][^>]*content=["']([^"']*)["'][^>]*>/i,
    ) || html.match(
      /<meta\s[^>]*content=["']([^"']*)["'][^>]*name=["']viewport["'][^>]*>/i,
    );

    if (!viewportMatch) {
      missingViewport.push(page.url);
    } else {
      const content = viewportMatch[1].toLowerCase();
      // Check for width=device-width
      if (!content.includes('width=device-width')) {
        badViewport.push({ url: page.url, content: viewportMatch[1] });
      }
      // Check for user-scalable=no (not recommended)
      // Note: not a "missing" issue, but a usability concern — tracked in AU engine
    }
  }
  const viewportOk = missingViewport.length === 0 && badViewport.length === 0;
  results.push({
    id: randomUUID(),
    checkId: 'MOBILE-001',
    checkName: 'Viewport meta tag configured',
    pillar: 'seo',
    category: 'Mobile',
    pageUrl: null,
    status: viewportOk
      ? 'pass'
      : missingViewport.length > 0
        ? 'fail'
        : 'warning',
    severity: missingViewport.length > 0 ? 'critical' : 'warning',
    score: viewportOk
      ? 100
      : Math.max(
          0,
          100 -
            Math.round(
              ((missingViewport.length + badViewport.length) /
                Math.max(1, okPages.length)) *
                100,
            ),
        ),
    message: viewportOk
      ? 'All pages have a properly configured viewport meta tag.'
      : `${missingViewport.length} page(s) missing viewport meta tag; ${badViewport.length} have misconfigured viewport.`,
    details: {
      missingViewport: missingViewport.slice(0, 30),
      badViewport: badViewport.slice(0, 30),
    },
    recommendation: viewportOk
      ? null
      : 'Add <meta name="viewport" content="width=device-width, initial-scale=1"> to every page\'s <head>.',
    wcagCriterion: null,
    element: null,
  });

  // ── MOBILE-002: content width (check for fixed-width elements) ────────
  const fixedWidthPages: { url: string; elements: string[] }[] = [];
  for (const page of okPages) {
    const html = page.rawHtml || '';
    const problems: string[] = [];

    // Check for fixed-width inline styles > 500px
    const fixedWidthMatches = html.match(
      /style=["'][^"']*width\s*:\s*(\d{4,})px[^"']*["']/gi,
    );
    if (fixedWidthMatches) {
      for (const m of fixedWidthMatches) {
        const widthMatch = m.match(/width\s*:\s*(\d+)px/i);
        if (widthMatch && parseInt(widthMatch[1], 10) > 500) {
          problems.push(m.substring(0, 100));
        }
      }
    }

    // Check for <table> with fixed width
    const tableWidthMatches = html.match(
      /<table[^>]*width=["']?\d{4,}["']?[^>]*>/gi,
    );
    if (tableWidthMatches) {
      for (const m of tableWidthMatches) {
        problems.push(m.substring(0, 100));
      }
    }

    if (problems.length > 0) {
      fixedWidthPages.push({ url: page.url, elements: problems.slice(0, 5) });
    }
  }
  const contentWidthOk = fixedWidthPages.length === 0;
  results.push({
    id: randomUUID(),
    checkId: 'MOBILE-002',
    checkName: 'Content fits mobile viewport',
    pillar: 'seo',
    category: 'Mobile',
    pageUrl: null,
    status: contentWidthOk ? 'pass' : 'warning',
    severity: 'warning',
    score: contentWidthOk
      ? 100
      : Math.max(
          0,
          100 -
            Math.round(
              (fixedWidthPages.length / Math.max(1, okPages.length)) * 100,
            ),
        ),
    message: contentWidthOk
      ? 'No elements with excessively fixed widths detected.'
      : `${fixedWidthPages.length} page(s) contain elements with fixed widths that may overflow on mobile.`,
    details: contentWidthOk ? null : { fixedWidthPages: fixedWidthPages.slice(0, 30) },
    recommendation: contentWidthOk
      ? null
      : 'Use responsive CSS (max-width, percentages, flexbox, grid) instead of fixed pixel widths exceeding mobile screen size.',
    wcagCriterion: null,
    element: null,
  });

  // ── MOBILE-003: tap targets (check for small links/buttons) ───────────
  // Heuristic: look for inline styles with very small dimensions on interactive elements
  const smallTapTargetPages: { url: string; count: number }[] = [];
  for (const page of okPages) {
    const html = page.rawHtml || '';
    let smallCount = 0;

    // Find links and buttons with small inline dimensions
    const interactivePattern =
      /<(?:a|button|input|select)\b[^>]*style=["'][^"']*(?:width|height)\s*:\s*(\d+)px[^"']*["'][^>]*>/gi;
    let match: RegExpExecArray | null;
    while ((match = interactivePattern.exec(html)) !== null) {
      const sizeMatch = match[0].match(/(?:width|height)\s*:\s*(\d+)px/gi);
      if (sizeMatch) {
        for (const sm of sizeMatch) {
          const val = parseInt(sm.replace(/[^0-9]/g, ''), 10);
          if (val < 44) {
            // 44px is the minimum recommended tap target size
            smallCount++;
            break;
          }
        }
      }
    }

    // Also check for very small font-size on links (proxy for small tap targets)
    const smallFontLinks =
      html.match(/<a\b[^>]*style=["'][^"']*font-size\s*:\s*(\d+)px[^"']*["'][^>]*>/gi) || [];
    for (const sfl of smallFontLinks) {
      const fontSize = sfl.match(/font-size\s*:\s*(\d+)px/i);
      if (fontSize && parseInt(fontSize[1], 10) < 12) {
        smallCount++;
      }
    }

    if (smallCount > 0) {
      smallTapTargetPages.push({ url: page.url, count: smallCount });
    }
  }
  const tapTargetsOk = smallTapTargetPages.length === 0;
  results.push({
    id: randomUUID(),
    checkId: 'MOBILE-003',
    checkName: 'Tap targets are appropriately sized',
    pillar: 'seo',
    category: 'Mobile',
    pageUrl: null,
    status: tapTargetsOk ? 'pass' : 'warning',
    severity: 'warning',
    score: tapTargetsOk
      ? 100
      : Math.max(
          0,
          100 -
            Math.round(
              (smallTapTargetPages.length / Math.max(1, okPages.length)) * 100,
            ),
        ),
    message: tapTargetsOk
      ? 'No obviously small tap targets detected in inline styles.'
      : `${smallTapTargetPages.length} page(s) may have tap targets smaller than 44px.`,
    details: tapTargetsOk ? null : { smallTapTargetPages: smallTapTargetPages.slice(0, 30) },
    recommendation: tapTargetsOk
      ? null
      : 'Ensure all interactive elements (links, buttons, inputs) are at least 44x44 CSS pixels with adequate spacing.',
    wcagCriterion: null,
    element: null,
  });

  // ── MOBILE-004: font legibility ───────────────────────────────────────
  const smallFontPages: { url: string; instances: number }[] = [];
  for (const page of okPages) {
    const html = page.rawHtml || '';
    let smallFontCount = 0;

    // Check inline font-size declarations < 12px (excluding 0 which is a hide technique)
    const fontSizePattern = /font-size\s*:\s*(\d+(?:\.\d+)?)\s*px/gi;
    let fsMatch: RegExpExecArray | null;
    while ((fsMatch = fontSizePattern.exec(html)) !== null) {
      const size = parseFloat(fsMatch[1]);
      if (size > 0 && size < 12) {
        smallFontCount++;
      }
    }

    // Check for <font size="1"> or size="2" (legacy)
    const legacyFontPattern = /<font\b[^>]*size=["']([12])["'][^>]*>/gi;
    while (legacyFontPattern.exec(html) !== null) {
      smallFontCount++;
    }

    if (smallFontCount > 0) {
      smallFontPages.push({ url: page.url, instances: smallFontCount });
    }
  }
  const fontOk = smallFontPages.length === 0;
  results.push({
    id: randomUUID(),
    checkId: 'MOBILE-004',
    checkName: 'Font sizes are legible on mobile',
    pillar: 'seo',
    category: 'Mobile',
    pageUrl: null,
    status: fontOk ? 'pass' : 'warning',
    severity: 'warning',
    score: fontOk
      ? 100
      : Math.max(
          0,
          100 -
            Math.round(
              (smallFontPages.length / Math.max(1, okPages.length)) * 100,
            ),
        ),
    message: fontOk
      ? 'No excessively small font sizes detected.'
      : `${smallFontPages.length} page(s) use font sizes below 12px which may be hard to read on mobile devices.`,
    details: fontOk ? null : { smallFontPages: smallFontPages.slice(0, 30) },
    recommendation: fontOk
      ? null
      : 'Use a minimum font size of 16px for body text. Ensure no text is smaller than 12px on mobile devices.',
    wcagCriterion: null,
    element: null,
  });

  return results;
}
