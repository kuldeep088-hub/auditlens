export interface RedirectHop {
  url: string;
  statusCode: number;
}

export interface HeadingData {
  level: number;
  text: string;
}

export interface ImageData {
  src: string;
  alt: string | null;
  width: number | null;
  height: number | null;
  loading: string | null;
  fileSize: number | null;
  format: string | null;
}

export interface LinkData {
  href: string;
  anchorText: string;
  rel: string | null;
  isNav: boolean;
}

export interface ExternalLinkData extends LinkData {
  domain: string;
}

export interface LoadTimingData {
  ttfb: number;
  fcp: number;
  lcp: number;
  domComplete: number;
  fullyLoaded: number;
}

export interface PageData {
  url: string;
  requestUrl: string;
  statusCode: number;
  redirectChain: RedirectHop[];
  responseHeaders: Record<string, string>;
  canonicalUrl: string | null;
  metaRobots: string | null;
  title: string | null;
  metaDescription: string | null;
  headings: HeadingData[];
  images: ImageData[];
  internalLinks: LinkData[];
  externalLinks: ExternalLinkData[];
  schemaMarkup: unknown[];
  ogTags: Record<string, string>;
  twitterTags: Record<string, string>;
  contentText: string;
  wordCount: number;
  language: string | null;
  isJsDependent: boolean;
  rawHtml: string;
  renderedHtml: string;
  screenshotDesktopPath: string | null;
  screenshotMobilePath: string | null;
  pageSize: number;
  totalResourceSize: number;
  loadTiming: LoadTimingData;
  crawledAt: Date;
}
