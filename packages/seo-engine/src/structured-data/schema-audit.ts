import type { CheckResult, PageData } from '@audit/types';
import { randomUUID } from 'crypto';

/**
 * Known Schema.org types (~50 common types).
 */
const KNOWN_SCHEMA_TYPES = new Set([
  'Article',
  'BlogPosting',
  'Organization',
  'WebSite',
  'Person',
  'Product',
  'FAQPage',
  'BreadcrumbList',
  'HowTo',
  'LocalBusiness',
  'Event',
  'Recipe',
  'Review',
  'AggregateRating',
  'VideoObject',
  'ImageObject',
  'ItemList',
  'CollectionPage',
  'ContactPoint',
  'Offer',
  'SearchAction',
  'SiteNavigationElement',
  'WebPage',
  'AboutPage',
  'ContactPage',
  'ProfilePage',
  'NewsArticle',
  'Course',
  'JobPosting',
  'Service',
  'Place',
  'Restaurant',
  'Store',
  'PostalAddress',
  'GeoCoordinates',
  'ListItem',
  'Thing',
  'CreativeWork',
  'SoftwareApplication',
  'MedicalCondition',
  'CheckoutPage',
  'ItemPage',
  'MedicalWebPage',
  'QAPage',
  'RealEstateListing',
  'SearchResultsPage',
  'HowToStep',
  'Question',
  'Answer',
  'Rating',
]);

/**
 * Required properties for common schema types.
 */
const REQUIRED_PROPS: Record<string, string[]> = {
  Article: ['headline', 'author', 'datePublished'],
  NewsArticle: ['headline', 'author', 'datePublished'],
  BlogPosting: ['headline', 'author', 'datePublished'],
  Product: ['name', 'image'],
  Organization: ['name', 'url'],
  BreadcrumbList: ['itemListElement'],
  FAQPage: ['mainEntity'],
};

/**
 * Extracts the @type from a schema markup object.
 */
function extractSchemaType(schema: unknown): string | null {
  if (typeof schema !== 'object' || schema === null) return null;
  const obj = schema as Record<string, unknown>;

  if (typeof obj['@type'] === 'string') {
    return obj['@type'];
  }
  if (Array.isArray(obj['@type']) && typeof obj['@type'][0] === 'string') {
    return obj['@type'][0];
  }
  if (typeof obj['type'] === 'string') {
    return obj['type'];
  }

  return null;
}

/**
 * SCHEMA-001 through SCHEMA-007
 * Audits structured data (Schema.org / JSON-LD).
 */
export function runSchemaAudit(pages: PageData[]): CheckResult[] {
  const results: CheckResult[] = [];
  const indexablePages = pages.filter(
    (p) =>
      p.statusCode === 200 &&
      !(p.metaRobots && p.metaRobots.toLowerCase().includes('noindex')),
  );

  if (indexablePages.length === 0) return results;

  // ── SCHEMA-001: Schema markup present ─────────────────────────────────
  const pagesWithSchema: string[] = [];
  const pagesWithoutSchema: string[] = [];

  for (const page of indexablePages) {
    if (page.schemaMarkup && page.schemaMarkup.length > 0) {
      pagesWithSchema.push(page.url);
    } else {
      pagesWithoutSchema.push(page.url);
    }
  }

  const schemaAdoption =
    indexablePages.length > 0
      ? pagesWithSchema.length / indexablePages.length
      : 0;
  const schemaPercent = Math.round(schemaAdoption * 100);
  const schemaOk = pagesWithoutSchema.length === 0;

  results.push({
    id: randomUUID(),
    checkId: 'SCHEMA-001',
    checkName: 'Schema markup present',
    pillar: 'seo',
    category: 'Structured Data',
    pageUrl: null,
    status: schemaOk ? 'pass' : 'warning',
    severity: 'warning',
    score: schemaPercent,
    message: schemaOk
      ? `All ${indexablePages.length} indexable pages have structured data markup.`
      : `${pagesWithSchema.length} of ${indexablePages.length} indexable pages (${schemaPercent}%) have structured data markup.`,
    details: {
      pagesWithSchema: pagesWithSchema.length,
      pagesWithoutSchema: pagesWithoutSchema.slice(0, 30),
    },
    recommendation: schemaOk
      ? null
      : 'Add structured data (JSON-LD) to pages that are missing it. Schema markup helps search engines understand your content and can enable rich results.',
    wcagCriterion: null,
    element: null,
  });

  // ── SCHEMA-002: Schema valid JSON (entries are objects with @type) ────
  let totalSchemaEntries = 0;
  let validEntries = 0;
  const invalidSchemaEntries: { url: string; index: number; issue: string }[] = [];

  for (const page of indexablePages) {
    for (let i = 0; i < page.schemaMarkup.length; i++) {
      totalSchemaEntries++;
      const entry = page.schemaMarkup[i];
      if (typeof entry !== 'object' || entry === null) {
        invalidSchemaEntries.push({
          url: page.url,
          index: i,
          issue: 'Schema entry is not an object',
        });
        continue;
      }
      const type = extractSchemaType(entry);
      if (!type) {
        invalidSchemaEntries.push({
          url: page.url,
          index: i,
          issue: 'Schema entry missing @type property',
        });
        continue;
      }
      validEntries++;
    }
  }

  const validPercent =
    totalSchemaEntries > 0
      ? Math.round((validEntries / totalSchemaEntries) * 100)
      : 100;
  const validOk = invalidSchemaEntries.length === 0;

  results.push({
    id: randomUUID(),
    checkId: 'SCHEMA-002',
    checkName: 'Schema valid JSON',
    pillar: 'seo',
    category: 'Structured Data',
    pageUrl: null,
    status: validOk ? 'pass' : 'fail',
    severity: 'critical',
    score: validPercent,
    message: validOk
      ? `All ${totalSchemaEntries} schema entries are valid objects with @type.`
      : `${invalidSchemaEntries.length} of ${totalSchemaEntries} schema entries are invalid (not an object or missing @type).`,
    details: validOk
      ? null
      : { invalidEntries: invalidSchemaEntries.slice(0, 30) },
    recommendation: validOk
      ? null
      : 'Ensure all structured data entries are valid JSON objects with an @type property. Invalid entries will be ignored by search engines.',
    wcagCriterion: null,
    element: null,
  });

  // ── SCHEMA-003: Schema types valid ────────────────────────────────────
  let totalTypes = 0;
  let knownTypeCount = 0;
  const unknownTypes: { url: string; type: string }[] = [];
  const typeDistribution: Record<string, number> = {};

  for (const page of indexablePages) {
    for (const schema of page.schemaMarkup) {
      const type = extractSchemaType(schema);
      if (!type) continue;
      totalTypes++;
      typeDistribution[type] = (typeDistribution[type] || 0) + 1;

      if (KNOWN_SCHEMA_TYPES.has(type)) {
        knownTypeCount++;
      } else {
        unknownTypes.push({ url: page.url, type });
      }
    }
  }

  const knownPercent =
    totalTypes > 0
      ? Math.round((knownTypeCount / totalTypes) * 100)
      : 100;
  const typesOk = unknownTypes.length === 0;

  results.push({
    id: randomUUID(),
    checkId: 'SCHEMA-003',
    checkName: 'Schema types valid',
    pillar: 'seo',
    category: 'Structured Data',
    pageUrl: null,
    status: typesOk ? 'pass' : 'fail',
    severity: 'high',
    score: knownPercent,
    message: typesOk
      ? `All ${totalTypes} schema types are recognized Schema.org types. Types found: ${Object.keys(typeDistribution).join(', ')}.`
      : `${unknownTypes.length} of ${totalTypes} schema entries use unrecognized types. ${knownPercent}% use known types.`,
    details: {
      typeDistribution,
      unknownTypes: unknownTypes.slice(0, 30),
    },
    recommendation: typesOk
      ? null
      : 'Verify that all @type values match valid Schema.org types. Typos or invalid types prevent rich results.',
    wcagCriterion: null,
    element: null,
  });

  // ── SCHEMA-004: Required properties ───────────────────────────────────
  let totalChecked = 0;
  let meetingRequirements = 0;
  const missingProps: { url: string; type: string; missing: string[] }[] = [];

  for (const page of indexablePages) {
    for (const schema of page.schemaMarkup) {
      const type = extractSchemaType(schema);
      if (!type || !REQUIRED_PROPS[type]) continue;

      totalChecked++;
      const obj = schema as Record<string, unknown>;
      const missing: string[] = [];

      for (const prop of REQUIRED_PROPS[type]) {
        if (!obj[prop] && !obj[`schema:${prop}`]) {
          missing.push(prop);
        }
      }

      if (missing.length > 0) {
        missingProps.push({ url: page.url, type, missing });
      } else {
        meetingRequirements++;
      }
    }
  }

  const propsPercent =
    totalChecked > 0
      ? Math.round((meetingRequirements / totalChecked) * 100)
      : 100;
  const propsOk = missingProps.length === 0;

  results.push({
    id: randomUUID(),
    checkId: 'SCHEMA-004',
    checkName: 'Required properties',
    pillar: 'seo',
    category: 'Structured Data',
    pageUrl: null,
    status: propsOk ? 'pass' : 'fail',
    severity: 'high',
    score: propsPercent,
    message: propsOk
      ? `All ${totalChecked} checked schema entries include the required properties for their type.`
      : `${missingProps.length} of ${totalChecked} schema entries are missing required properties (${propsPercent}% compliance).`,
    details: propsOk
      ? null
      : { missingProps: missingProps.slice(0, 30) },
    recommendation: propsOk
      ? null
      : 'Add the missing required properties to your structured data. Google requires specific properties for each schema type to enable rich results.',
    wcagCriterion: null,
    element: null,
  });

  // ── SCHEMA-005: Organization schema on homepage ───────────────────────
  // Find the homepage: first page with pathname "/" or the first page in the list
  let homepage: PageData | null = null;
  for (const page of indexablePages) {
    try {
      if (new URL(page.url).pathname === '/') {
        homepage = page;
        break;
      }
    } catch {
      // skip unparseable
    }
  }
  if (!homepage && indexablePages.length > 0) {
    homepage = indexablePages[0];
  }

  let homepageHasOrgOrWebsite = false;
  if (homepage) {
    for (const schema of homepage.schemaMarkup) {
      const type = extractSchemaType(schema);
      if (type === 'Organization' || type === 'WebSite' || type === 'LocalBusiness') {
        homepageHasOrgOrWebsite = true;
        break;
      }
    }
  }

  results.push({
    id: randomUUID(),
    checkId: 'SCHEMA-005',
    checkName: 'Organization schema on homepage',
    pillar: 'seo',
    category: 'Structured Data',
    pageUrl: homepage ? homepage.url : null,
    status: homepageHasOrgOrWebsite ? 'pass' : 'warning',
    severity: 'warning',
    score: homepageHasOrgOrWebsite ? 100 : 0,
    message: homepageHasOrgOrWebsite
      ? 'Homepage includes Organization or WebSite structured data.'
      : 'Homepage is missing Organization or WebSite structured data.',
    details: { homepageUrl: homepage ? homepage.url : null },
    recommendation: homepageHasOrgOrWebsite
      ? null
      : 'Add WebSite and Organization (or LocalBusiness) schema to your homepage. This enables sitelinks search box and knowledge panel features.',
    wcagCriterion: null,
    element: null,
  });

  // ── SCHEMA-006: Article schema on blog posts ──────────────────────────
  // Heuristic: pages with URL containing /blog/, /article/, /post/, /news/
  const blogPatterns = ['/blog/', '/article/', '/post/', '/news/'];
  const blogPages = indexablePages.filter((p) => {
    const lower = p.url.toLowerCase();
    return blogPatterns.some((pattern) => lower.includes(pattern));
  });

  let blogWithArticle = 0;
  const blogWithoutArticle: string[] = [];

  for (const page of blogPages) {
    let hasArticle = false;
    for (const schema of page.schemaMarkup) {
      const type = extractSchemaType(schema);
      if (type === 'Article' || type === 'BlogPosting' || type === 'NewsArticle') {
        hasArticle = true;
        break;
      }
    }
    if (hasArticle) {
      blogWithArticle++;
    } else {
      blogWithoutArticle.push(page.url);
    }
  }

  const blogCompliance =
    blogPages.length > 0
      ? Math.round((blogWithArticle / blogPages.length) * 100)
      : 100;
  const blogOk = blogWithoutArticle.length === 0;

  results.push({
    id: randomUUID(),
    checkId: 'SCHEMA-006',
    checkName: 'Article schema on blog posts',
    pillar: 'seo',
    category: 'Structured Data',
    pageUrl: null,
    status: blogOk ? 'pass' : 'warning',
    severity: 'warning',
    score: blogCompliance,
    message: blogPages.length === 0
      ? 'No blog/article pages detected (URLs containing /blog/, /article/, /post/, or /news/).'
      : blogOk
        ? `All ${blogPages.length} blog/article pages have Article or BlogPosting schema.`
        : `${blogWithArticle} of ${blogPages.length} blog/article pages (${blogCompliance}%) have Article or BlogPosting schema.`,
    details: {
      blogPagesFound: blogPages.length,
      blogWithArticle,
      blogWithoutArticle: blogWithoutArticle.slice(0, 30),
    },
    recommendation: blogOk
      ? null
      : 'Add Article or BlogPosting structured data to blog/article pages. This enables rich results like headline, author, and date in search results.',
    wcagCriterion: null,
    element: null,
  });

  // ── SCHEMA-007: BreadcrumbList on inner pages ─────────────────────────
  const innerPages = indexablePages.filter((p) => {
    try {
      return new URL(p.url).pathname !== '/';
    } catch {
      return true;
    }
  });

  let innerWithBreadcrumbs = 0;
  const innerWithoutBreadcrumbs: string[] = [];

  for (const page of innerPages) {
    let hasBreadcrumb = false;
    for (const schema of page.schemaMarkup) {
      if (extractSchemaType(schema) === 'BreadcrumbList') {
        hasBreadcrumb = true;
        break;
      }
    }
    if (hasBreadcrumb) {
      innerWithBreadcrumbs++;
    } else {
      innerWithoutBreadcrumbs.push(page.url);
    }
  }

  const breadcrumbPercent =
    innerPages.length > 0
      ? Math.round((innerWithBreadcrumbs / innerPages.length) * 100)
      : 100;
  const breadcrumbOk = innerWithoutBreadcrumbs.length === 0;

  results.push({
    id: randomUUID(),
    checkId: 'SCHEMA-007',
    checkName: 'BreadcrumbList on inner pages',
    pillar: 'seo',
    category: 'Structured Data',
    pageUrl: null,
    status: breadcrumbOk ? 'pass' : 'info',
    severity: 'info',
    score: breadcrumbPercent,
    message: breadcrumbOk
      ? `All ${innerPages.length} inner pages have BreadcrumbList structured data.`
      : `${innerWithBreadcrumbs} of ${innerPages.length} inner pages (${breadcrumbPercent}%) have BreadcrumbList schema.`,
    details: {
      innerPagesTotal: innerPages.length,
      withBreadcrumbs: innerWithBreadcrumbs,
      withoutBreadcrumbs: innerWithoutBreadcrumbs.slice(0, 30),
    },
    recommendation: breadcrumbOk
      ? null
      : 'Add BreadcrumbList structured data to inner pages. Breadcrumbs improve SERP appearance and help users understand site hierarchy.',
    wcagCriterion: null,
    element: null,
  });

  return results;
}
