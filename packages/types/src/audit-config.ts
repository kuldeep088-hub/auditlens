export type Pillar = 'seo' | 'au' | 'geo';
export type AiEngine = 'chatgpt' | 'perplexity' | 'google-ai' | 'bing-copilot';

export interface ViewportConfig {
  width: number;
  height: number;
  label: string;
}

export interface AuditConfig {
  url: string;
  maxPages: number;
  crawlDelay: number;
  respectRobotsTxt: boolean;
  renderJs: boolean;
  screenshotViewports: ViewportConfig[];
  userAgent: string;
  pillars: Pillar[];

  // GEO-specific
  geoQueries: string[];
  geoEngines: AiEngine[];

  // Storage
  storageDir: string;
}

export const DEFAULT_AUDIT_CONFIG: Omit<AuditConfig, 'url'> = {
  maxPages: 1000,
  crawlDelay: 1000,
  respectRobotsTxt: true,
  renderJs: true,
  screenshotViewports: [
    { width: 1440, height: 900, label: 'desktop' },
    { width: 375, height: 812, label: 'mobile' },
  ],
  userAgent:
    'AuditBot/1.0 (+https://github.com/audit-system; audit@example.com)',
  pillars: ['seo', 'au', 'geo'],
  geoQueries: [],
  geoEngines: ['chatgpt', 'perplexity'],
  storageDir: './data',
};
