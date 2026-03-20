import type { AuditConfig, Pillar } from './audit-config.js';
import type { AuditScores, CheckResult } from './check-result.js';
import type { PageData } from './page-data.js';

export type AuditStatus =
  | 'queued'
  | 'crawling'
  | 'analyzing'
  | 'scoring'
  | 'reporting'
  | 'complete'
  | 'failed'
  | 'cancelled';

export interface CrawlResult {
  pages: PageData[];
  robotsTxt: string | null;
  sitemapUrls: string[];
  linkGraph: LinkGraphEdge[];
  crawlLog: CrawlLogEntry[];
  startedAt: Date;
  completedAt: Date;
}

export interface LinkGraphEdge {
  source: string;
  destination: string;
  anchorText: string;
  isNav: boolean;
}

export interface CrawlLogEntry {
  url: string;
  level: 'info' | 'warn' | 'error';
  message: string;
  timestamp: Date;
}

export interface GeoQueryResult {
  engine: string;
  query: string;
  response: string;
  cited: boolean;
  citationPosition: number | null;
  citedUrl: string | null;
  citedSnippet: string | null;
  sentiment: 'positive' | 'neutral' | 'negative';
  competitorsCited: { name: string; url: string; position: number }[];
  queriedAt: Date;
}

export interface AuditResult {
  id: string;
  url: string;
  status: AuditStatus;
  config: AuditConfig;
  crawl: CrawlResult | null;
  checks: CheckResult[];
  geoQueries: GeoQueryResult[];
  scores: AuditScores | null;
  startedAt: Date;
  completedAt: Date | null;
  error: string | null;
}

export interface AuditProgress {
  status: AuditStatus;
  crawl: { total: number; done: number };
  seo: { total: number; done: number };
  au: { total: number; done: number };
  geo: { total: number; done: number };
}
