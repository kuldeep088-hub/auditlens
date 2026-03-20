import type { Pillar } from '@audit/types';

/**
 * Weight configuration for the scoring system.
 * All weights within a group must sum to 1.0.
 */

// Top-level pillar weights (overall score)
export const PILLAR_WEIGHTS: Record<Pillar, number> = {
  seo: 0.35,
  au: 0.30,
  geo: 0.35,
};

// SEO category weights
export const SEO_CATEGORY_WEIGHTS: Record<string, number> = {
  'technical-seo': 0.30,
  'on-page-seo': 0.35,
  'off-page-seo': 0.15,
  'structured-data': 0.20,
};

// Technical SEO check group weights
export const TECHNICAL_SEO_WEIGHTS: Record<string, number> = {
  'robots': 0.10,
  'sitemap': 0.15,
  'url-redirect': 0.25,
  'architecture': 0.15,
  'performance': 0.20,
  'mobile': 0.10,
  'security': 0.05,
};

// On-Page SEO check group weights
export const ON_PAGE_SEO_WEIGHTS: Record<string, number> = {
  'title': 0.20,
  'meta-description': 0.10,
  'heading': 0.15,
  'content-quality': 0.25,
  'image': 0.10,
  'internal-link': 0.15,
  'external-link': 0.05,
};

// AU category weights
export const AU_CATEGORY_WEIGHTS: Record<string, number> = {
  'accessibility': 0.65,
  'usability': 0.35,
};

// GEO category weights
export const GEO_CATEGORY_WEIGHTS: Record<string, number> = {
  'content-structure': 0.35,
  'technical-geo': 0.25,
  'ai-visibility': 0.40,
};

/**
 * Maps checkId prefixes to their weight group.
 */
export function getCheckGroup(checkId: string): string {
  const prefix = checkId.split('-')[0].toLowerCase();

  const groupMap: Record<string, string> = {
    'robots': 'robots',
    'sitemap': 'sitemap',
    'url': 'url-redirect',
    'arch': 'architecture',
    'perf': 'performance',
    'mobile': 'mobile',
    'sec': 'security',
    'title': 'title',
    'meta': 'meta-description',
    'heading': 'heading',
    'content': 'content-quality',
    'img': 'image',
    'ilink': 'internal-link',
    'elink': 'external-link',
    'social': 'off-page-seo',
    'schema': 'structured-data',
    'axe': 'accessibility',
    'a11y': 'accessibility',
    'nav': 'usability',
    'form': 'usability',
    'typo': 'usability',
    'ux': 'usability',
  };

  return groupMap[prefix] ?? prefix;
}

/**
 * Maps a category name to its parent pillar.
 */
export function getCategoryPillar(category: string): Pillar {
  const seoCategories = new Set([
    'technical-seo', 'on-page-seo', 'off-page-seo', 'structured-data',
    'robots', 'sitemap', 'url-redirect', 'architecture', 'performance',
    'mobile', 'security', 'title', 'meta-description', 'heading',
    'content-quality', 'image', 'internal-link', 'external-link',
  ]);

  const auCategories = new Set([
    'accessibility', 'usability',
  ]);

  if (seoCategories.has(category)) return 'seo';
  if (auCategories.has(category)) return 'au';
  return 'geo';
}
