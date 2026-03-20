/**
 * Navigation usability audit.
 * Checks NAV-001 through NAV-007 for common navigation patterns and best practices.
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
    category: 'usability-navigation',
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
 * NAV-001: Navigation element exists.
 * The page should contain a <nav> element or an element with role="navigation".
 */
function checkNavExists($: cheerio.CheerioAPI, pageUrl: string): CheckResult {
  const navElements = $('nav, [role="navigation"]');

  if (navElements.length === 0) {
    return makeResult(
      'NAV-001',
      'Navigation Element Exists',
      pageUrl,
      'fail',
      'high',
      0,
      'No <nav> element or [role="navigation"] found on the page.',
      { navCount: 0 },
      'Add a <nav> element to wrap the site\u2019s primary navigation links.',
      null,
    );
  }

  return makeResult(
    'NAV-001',
    'Navigation Element Exists',
    pageUrl,
    'pass',
    'info',
    100,
    `Found ${navElements.length} navigation element(s).`,
    { navCount: navElements.length },
    null,
    null,
  );
}

/**
 * NAV-002: Navigation item count.
 * Primary navigation should have between 3 and 8 top-level items for optimal usability.
 * Too few means the nav may be incomplete; too many overwhelms users.
 */
function checkNavItemCount($: cheerio.CheerioAPI, pageUrl: string): CheckResult {
  // Look for the primary nav (first <nav> or header nav)
  const primaryNav = $('header nav, nav').first();

  if (primaryNav.length === 0) {
    return makeResult(
      'NAV-002',
      'Navigation Item Count',
      pageUrl,
      'info',
      'info',
      100,
      'No navigation element found to evaluate item count.',
      { itemCount: 0 },
      null,
      null,
    );
  }

  // Count direct list items or direct anchor children
  let items = primaryNav.find('> ul > li, > ol > li').length;
  if (items === 0) {
    // Fallback: count direct anchor children
    items = primaryNav.find('> a').length;
  }
  if (items === 0) {
    // Try deeper: any top-level list
    items = primaryNav.find('ul').first().children('li').length;
  }

  if (items === 0) {
    return makeResult(
      'NAV-002',
      'Navigation Item Count',
      pageUrl,
      'warning',
      'warning',
      50,
      'Navigation element found but no nav items detected.',
      { itemCount: 0 },
      'Ensure navigation contains clearly structured links, ideally in an unordered list.',
      null,
    );
  }

  if (items > 8) {
    return makeResult(
      'NAV-002',
      'Navigation Item Count',
      pageUrl,
      'warning',
      'warning',
      60,
      `Primary navigation has ${items} top-level items. More than 8 can overwhelm users.`,
      { itemCount: items },
      'Consider reducing primary navigation to 7\u00b11 items. Use sub-menus or a mega menu for additional links.',
      null,
    );
  }

  if (items < 3) {
    return makeResult(
      'NAV-002',
      'Navigation Item Count',
      pageUrl,
      'warning',
      'info',
      80,
      `Primary navigation has only ${items} item(s). This may be insufficient.`,
      { itemCount: items },
      'Consider whether the navigation covers all key sections of the site.',
      null,
    );
  }

  return makeResult(
    'NAV-002',
    'Navigation Item Count',
    pageUrl,
    'pass',
    'info',
    100,
    `Primary navigation has ${items} items, which is within the optimal range (3\u20138).`,
    { itemCount: items },
    null,
    null,
  );
}

/**
 * NAV-003: Logo links to homepage.
 * The site logo (usually the first image/link in the header) should link to the homepage ("/").
 */
function checkLogoLinksHome($: cheerio.CheerioAPI, pageUrl: string): CheckResult {
  // Look for common logo patterns
  const headerLinks = $('header a, [role="banner"] a');
  let logoLink: cheerio.Cheerio<any> | null = null;

  // Strategy 1: Look for a link containing an image with "logo" in class, alt, or src
  headerLinks.each((_, el) => {
    if (logoLink) return;
    const link = $(el);
    const img = link.find('img');
    if (img.length > 0) {
      const alt = (img.attr('alt') || '').toLowerCase();
      const src = (img.attr('src') || '').toLowerCase();
      const cls = (img.attr('class') || '').toLowerCase();
      const linkCls = (link.attr('class') || '').toLowerCase();

      if (alt.includes('logo') || src.includes('logo') || cls.includes('logo') || linkCls.includes('logo')) {
        logoLink = link;
      }
    }
  });

  // Strategy 2: Look for any element with class/id containing "logo"
  if (!logoLink) {
    const logoEl = $('header [class*="logo"] a, header a[class*="logo"], [role="banner"] [class*="logo"] a, [role="banner"] a[class*="logo"]').first();
    if (logoEl.length > 0) {
      logoLink = logoEl;
    }
  }

  // Strategy 3: First link in header
  if (!logoLink) {
    const firstLink = headerLinks.first();
    if (firstLink.length > 0) {
      logoLink = firstLink;
    }
  }

  if (!logoLink) {
    return makeResult(
      'NAV-003',
      'Logo Links to Homepage',
      pageUrl,
      'info',
      'info',
      100,
      'No logo link detected in the header.',
      { logoFound: false },
      'Add a logo in the header that links to the homepage.',
      null,
    );
  }

  const href = logoLink.attr('href') || '';
  const isHome = href === '/' || href === '/index.html' || href === '/index.htm' ||
    href.match(/^https?:\/\/[^/]+\/?$/) !== null || href === '#' || href === '';

  if (isHome || href === '') {
    return makeResult(
      'NAV-003',
      'Logo Links to Homepage',
      pageUrl,
      href === '' || href === '#' ? 'warning' : 'pass',
      href === '' || href === '#' ? 'warning' : 'info',
      href === '' || href === '#' ? 70 : 100,
      href === '' || href === '#'
        ? 'Logo link found but its href is empty or "#".'
        : 'Logo links to the homepage.',
      { logoHref: href },
      href === '' || href === '#' ? 'Set the logo\u2019s href to "/" so it navigates to the homepage.' : null,
      null,
    );
  }

  return makeResult(
    'NAV-003',
    'Logo Links to Homepage',
    pageUrl,
    'warning',
    'warning',
    60,
    `Logo links to "${href}" instead of the homepage.`,
    { logoHref: href },
    'Set the logo\u2019s href to "/" so users can easily navigate to the homepage.',
    null,
  );
}

/**
 * NAV-004: Search functionality present.
 * The site should have a search form or search input for discoverability.
 */
function checkSearchPresent($: cheerio.CheerioAPI, pageUrl: string): CheckResult {
  // Look for search inputs
  const searchInputs = $('input[type="search"], [role="search"], form[action*="search"], input[name="q"], input[name="query"], input[name="search"], input[name="s"]');

  // Also look for search-related aria
  const searchLandmark = $('[role="search"]');

  if (searchInputs.length > 0 || searchLandmark.length > 0) {
    return makeResult(
      'NAV-004',
      'Search Functionality',
      pageUrl,
      'pass',
      'info',
      100,
      'Search functionality detected on the page.',
      { searchInputCount: searchInputs.length, hasSearchLandmark: searchLandmark.length > 0 },
      null,
      null,
    );
  }

  return makeResult(
    'NAV-004',
    'Search Functionality',
    pageUrl,
    'warning',
    'warning',
    40,
    'No search functionality detected on the page.',
    { searchInputCount: 0, hasSearchLandmark: false },
    'Add a search form to help users find content quickly. Wrap it in a [role="search"] landmark.',
    null,
  );
}

/**
 * NAV-005: Breadcrumbs present.
 * Interior pages should have breadcrumb navigation for orientation.
 */
function checkBreadcrumbs($: cheerio.CheerioAPI, pageUrl: string): CheckResult {
  const breadcrumbs = $(
    'nav[aria-label*="breadcrumb" i], nav[aria-label*="Breadcrumb" i], [role="navigation"][aria-label*="breadcrumb" i], .breadcrumb, .breadcrumbs, [class*="breadcrumb"], ol[typeof="BreadcrumbList"], [itemtype*="BreadcrumbList"]',
  );

  if (breadcrumbs.length > 0) {
    return makeResult(
      'NAV-005',
      'Breadcrumbs Present',
      pageUrl,
      'pass',
      'info',
      100,
      'Breadcrumb navigation detected.',
      { breadcrumbCount: breadcrumbs.length },
      null,
      null,
    );
  }

  // Only flag as warning if it's not the homepage
  try {
    const url = new URL(pageUrl);
    const isHomepage = url.pathname === '/' || url.pathname === '/index.html';
    if (isHomepage) {
      return makeResult(
        'NAV-005',
        'Breadcrumbs Present',
        pageUrl,
        'info',
        'info',
        100,
        'Homepage detected; breadcrumbs are not required.',
        { isHomepage: true },
        null,
        null,
      );
    }
  } catch {
    // If URL parsing fails, continue with the check
  }

  return makeResult(
    'NAV-005',
    'Breadcrumbs Present',
    pageUrl,
    'warning',
    'warning',
    50,
    'No breadcrumb navigation detected on this interior page.',
    { breadcrumbCount: 0 },
    'Add breadcrumb navigation to help users understand their location in the site hierarchy.',
    null,
  );
}

/**
 * NAV-006: Custom 404 page detection.
 * Checks if the page itself appears to be a proper custom 404 error page (based on status code from PageData).
 * Also checks if error-related content exists.
 */
function checkCustom404(page: PageData): CheckResult {
  // We check if this page IS a 404 page and whether it has helpful content
  if (page.statusCode === 404) {
    const html = page.renderedHtml || page.rawHtml;
    const $ = cheerio.load(html || '');

    // Check if it has navigation, links back to homepage, search, etc.
    const hasNav = $('nav, [role="navigation"]').length > 0;
    const hasLinks = $('a[href]').length > 3;
    const hasSearch = $('input[type="search"], [role="search"], input[name="q"]').length > 0;
    const hasCustomContent = page.wordCount > 20;

    const isCustom = hasNav || hasLinks || hasSearch || hasCustomContent;

    if (isCustom) {
      return makeResult(
        'NAV-006',
        'Custom 404 Page',
        page.url,
        'pass',
        'info',
        100,
        'This 404 page has custom content with helpful navigation.',
        { hasNav, hasLinks, hasSearch, wordCount: page.wordCount },
        null,
        null,
      );
    }

    return makeResult(
      'NAV-006',
      'Custom 404 Page',
      page.url,
      'fail',
      'warning',
      30,
      'This 404 page lacks custom content and helpful navigation.',
      { hasNav, hasLinks, hasSearch, wordCount: page.wordCount },
      'Create a custom 404 page with navigation links, a search bar, and helpful suggestions.',
      null,
    );
  }

  // For non-404 pages, this check is informational
  return makeResult(
    'NAV-006',
    'Custom 404 Page',
    page.url,
    'info',
    'info',
    100,
    'Page returned a non-404 status code; 404 check not applicable.',
    { statusCode: page.statusCode },
    null,
    null,
  );
}

/**
 * NAV-007: Mobile navigation.
 * Check for mobile-friendly navigation patterns: hamburger menus, responsive nav,
 * or viewport meta tag combined with collapsible nav patterns.
 */
function checkMobileNav($: cheerio.CheerioAPI, pageUrl: string): CheckResult {
  // Check for viewport meta tag first (required for mobile friendliness)
  const viewportMeta = $('meta[name="viewport"]');
  const hasViewport = viewportMeta.length > 0;

  if (!hasViewport) {
    return makeResult(
      'NAV-007',
      'Mobile Navigation',
      pageUrl,
      'fail',
      'high',
      20,
      'No viewport meta tag found. The page is likely not mobile-friendly.',
      { hasViewport: false, mobileNavPatterns: [] },
      'Add <meta name="viewport" content="width=device-width, initial-scale=1"> and implement responsive navigation.',
      null,
    );
  }

  // Look for common mobile nav patterns
  const patterns: string[] = [];

  // Hamburger menu button patterns
  const hamburger = $('button[class*="menu"], button[class*="hamburger"], button[class*="toggle"], button[aria-label*="menu" i], button[aria-label*="Menu" i], [class*="navbar-toggler"], [class*="menu-toggle"], [class*="mobile-menu"], [class*="nav-toggle"]');
  if (hamburger.length > 0) {
    patterns.push('hamburger-menu');
  }

  // Collapsible nav via data attributes
  const collapsible = $('[data-toggle="collapse"], [data-bs-toggle="collapse"], [class*="collapse"]');
  if (collapsible.length > 0) {
    patterns.push('collapsible-nav');
  }

  // Responsive CSS classes (Bootstrap, Tailwind, etc.)
  const responsiveClasses = $('[class*="navbar-expand"], [class*="sm:hidden"], [class*="md:hidden"], [class*="lg:hidden"], [class*="hidden-xs"], [class*="visible-xs"], [class*="d-none d-md-block"], [class*="d-block d-md-none"]');
  if (responsiveClasses.length > 0) {
    patterns.push('responsive-classes');
  }

  // Media queries in style tags
  let hasMediaQueries = false;
  $('style').each((_, el) => {
    const css = $(el).text();
    if (css.includes('@media') && (css.includes('max-width') || css.includes('min-width'))) {
      hasMediaQueries = true;
    }
  });
  if (hasMediaQueries) {
    patterns.push('css-media-queries');
  }

  if (patterns.length > 0) {
    return makeResult(
      'NAV-007',
      'Mobile Navigation',
      pageUrl,
      'pass',
      'info',
      100,
      `Mobile navigation patterns detected: ${patterns.join(', ')}.`,
      { hasViewport: true, mobileNavPatterns: patterns },
      null,
      null,
    );
  }

  return makeResult(
    'NAV-007',
    'Mobile Navigation',
    pageUrl,
    'warning',
    'warning',
    50,
    'Viewport meta tag found but no mobile navigation patterns detected.',
    { hasViewport: true, mobileNavPatterns: [] },
    'Implement a responsive navigation that works on small screens (e.g., hamburger menu or collapsible nav).',
    null,
  );
}

/**
 * Run navigation usability audit across all pages.
 */
export function runNavigationAudit(pages: PageData[]): CheckResult[] {
  const results: CheckResult[] = [];

  for (const page of pages) {
    const html = page.renderedHtml || page.rawHtml;
    if (!html) continue;

    const $ = cheerio.load(html);

    results.push(checkNavExists($, page.url));
    results.push(checkNavItemCount($, page.url));
    results.push(checkLogoLinksHome($, page.url));
    results.push(checkSearchPresent($, page.url));
    results.push(checkBreadcrumbs($, page.url));
    results.push(checkCustom404(page));
    results.push(checkMobileNav($, page.url));
  }

  return results;
}
