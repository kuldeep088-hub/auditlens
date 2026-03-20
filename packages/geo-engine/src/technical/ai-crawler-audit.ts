/**
 * AI Crawler audit for GEO.
 * Checks GEO-TECH-001 through GEO-TECH-003 to evaluate how the site
 * interacts with AI crawlers: robots.txt bot permissions, llms.txt, and
 * ai.txt presence.
 */

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
): CheckResult {
  return {
    id: crypto.randomUUID(),
    checkId,
    checkName,
    pillar: 'geo',
    category: 'Technical GEO',
    pageUrl,
    status,
    severity,
    score: Math.max(0, Math.min(100, score)),
    message,
    details,
    recommendation,
    wcagCriterion: null,
    element: null,
  };
}

/** Known AI bot user-agent strings to check in robots.txt. */
const AI_BOTS = [
  'GPTBot', 'OAI-SearchBot', 'ClaudeBot', 'anthropic-ai', 'PerplexityBot',
  'Google-Extended', 'Bytespider', 'CCBot', 'Applebot-Extended', 'Amazonbot',
  'FacebookBot', 'cohere-ai',
] as const;

type BotAccessStatus = 'allowed' | 'blocked' | 'not-mentioned';

interface BotAccessEntry {
  bot: string;
  status: BotAccessStatus;
  rules: string[];
}

function checkWildcardBlocksAll(robotsTxt: string): boolean {
  const lines = robotsTxt.split(/\r?\n/);
  let inWildcard = false;
  for (const rawLine of lines) {
    const line = rawLine.replace(/#.*$/, '').trim();
    if (line.toLowerCase().startsWith('user-agent:')) {
      inWildcard = line.slice('user-agent:'.length).trim() === '*';
      continue;
    }
    if (inWildcard && line.toLowerCase().startsWith('disallow:')) {
      const p = line.slice('disallow:'.length).trim();
      if (p === '/' || p === '/*') return true;
    }
    if (line === '') inWildcard = false;
  }
  return false;
}

/** Parse robots.txt and determine access status for each AI bot. */
function parseRobotsTxtForBots(robotsTxt: string): BotAccessEntry[] {
  const lines = robotsTxt.split(/\r?\n/);
  const results: BotAccessEntry[] = [];

  for (const bot of AI_BOTS) {
    const botLower = bot.toLowerCase();
    let inBotBlock = false;
    let mentioned = false;
    const rules: string[] = [];
    let hasDisallow = false;
    let hasAllow = false;
    let disallowsRoot = false;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].replace(/#.*$/, '').trim();
      if (line.toLowerCase().startsWith('user-agent:')) {
        const agent = line.slice('user-agent:'.length).trim().toLowerCase();
        if (agent === botLower) { mentioned = true; inBotBlock = true; continue; }
        else if (inBotBlock) break;
        continue;
      }
      if (line === '' && inBotBlock) break;
      if (inBotBlock) {
        if (line.toLowerCase().startsWith('disallow:')) {
          const p = line.slice('disallow:'.length).trim();
          rules.push(line);
          hasDisallow = true;
          if (p === '/' || p === '/*') disallowsRoot = true;
        } else if (line.toLowerCase().startsWith('allow:')) {
          rules.push(line);
          hasAllow = true;
        }
      }
    }

    let status: BotAccessStatus;
    if (!mentioned) {
      status = checkWildcardBlocksAll(robotsTxt) ? 'blocked' : 'not-mentioned';
    } else if (disallowsRoot && !hasAllow) {
      status = 'blocked';
    } else if (hasDisallow && hasAllow) {
      status = disallowsRoot ? 'blocked' : 'allowed';
    } else if (hasDisallow) {
      status = 'blocked';
    } else {
      status = 'allowed';
    }
    results.push({ bot, status, rules });
  }
  return results;
}

/**
 * GEO-TECH-001: AI bot access in robots.txt.
 */
function checkAiBotAccess(robotsTxt: string | null): CheckResult {
  if (!robotsTxt) {
    return makeResult('GEO-TECH-001', 'AI Bot Access in robots.txt', null, 'info', 'info', 75,
      'No robots.txt found. AI bots have no explicit restrictions (default: allowed).',
      { robotsTxtPresent: false, botMatrix: AI_BOTS.map((bot) => ({ bot, status: 'not-mentioned' as BotAccessStatus })) },
      'Consider adding a robots.txt file with explicit rules for AI crawler bots to control how your content is accessed and used.');
  }

  const botEntries = parseRobotsTxtForBots(robotsTxt);
  const allowed = botEntries.filter((b) => b.status === 'allowed');
  const blocked = botEntries.filter((b) => b.status === 'blocked');
  const notMentioned = botEntries.filter((b) => b.status === 'not-mentioned');
  const accessibleBots = allowed.length + notMentioned.length;
  const score = Math.round((accessibleBots / AI_BOTS.length) * 100);

  let status: CheckResult['status'];
  let message: string;
  if (blocked.length === AI_BOTS.length) {
    status = 'warning';
    message = 'All known AI bots are blocked in robots.txt. Your content will not be crawled by AI engines.';
  } else if (blocked.length > 0) {
    status = 'info';
    message = `${allowed.length} AI bot(s) allowed, ${blocked.length} blocked, ${notMentioned.length} not mentioned in robots.txt.`;
  } else {
    status = 'pass';
    message = `No AI bots are blocked. ${allowed.length} explicitly allowed, ${notMentioned.length} not mentioned (default: allowed).`;
  }

  return makeResult('GEO-TECH-001', 'AI Bot Access in robots.txt', null, status, 'info', score, message,
    {
      robotsTxtPresent: true, totalBots: AI_BOTS.length, allowedCount: allowed.length,
      blockedCount: blocked.length, notMentionedCount: notMentioned.length,
      botMatrix: botEntries.map((b) => ({ bot: b.bot, status: b.status, rules: b.rules })),
    },
    blocked.length > 0
      ? `Review blocked AI bots: ${blocked.map((b) => b.bot).join(', ')}. If GEO visibility is a goal, consider allowing these bots access to your content.`
      : null);
}

/** GEO-TECH-002: llms.txt presence. */
function checkLlmsTxt(pages: PageData[]): CheckResult {
  const llmsTxtPage = pages.find((p) => {
    try { const pn = new URL(p.url).pathname; return pn === '/llms.txt' || pn === '/llms-full.txt'; }
    catch { return p.url.endsWith('/llms.txt') || p.url.endsWith('/llms-full.txt'); }
  });

  if (llmsTxtPage) {
    const isFullVersion = llmsTxtPage.url.includes('llms-full.txt');
    return makeResult('GEO-TECH-002', 'llms.txt Presence', llmsTxtPage.url, 'pass', 'info', 100,
      `${isFullVersion ? 'llms-full.txt' : 'llms.txt'} found at ${llmsTxtPage.url}.`,
      { found: true, url: llmsTxtPage.url, isFullVersion, contentLength: llmsTxtPage.contentText.length }, null);
  }

  return makeResult('GEO-TECH-002', 'llms.txt Presence', null, 'info', 'info', 50,
    'No llms.txt or llms-full.txt found. This is an emerging standard for providing LLM-friendly site information.',
    { found: false },
    'Consider creating an /llms.txt file that provides a structured summary of your site for large language models. See llmstxt.org for the specification.');
}

/** GEO-TECH-003: ai.txt presence. */
function checkAiTxt(pages: PageData[]): CheckResult {
  const aiTxtPage = pages.find((p) => {
    try { return new URL(p.url).pathname === '/ai.txt'; }
    catch { return p.url.endsWith('/ai.txt'); }
  });

  if (aiTxtPage) {
    return makeResult('GEO-TECH-003', 'ai.txt Presence', aiTxtPage.url, 'pass', 'info', 100,
      `ai.txt found at ${aiTxtPage.url}.`,
      { found: true, url: aiTxtPage.url, contentLength: aiTxtPage.contentText.length }, null);
  }

  return makeResult('GEO-TECH-003', 'ai.txt Presence', null, 'info', 'info', 50,
    'No ai.txt found. This is an emerging standard for declaring AI usage preferences.',
    { found: false },
    'Consider creating an /ai.txt file to declare your preferences for how AI systems interact with your content.');
}

/** Run AI Crawler audit. */
export function runAiCrawlerAudit(robotsTxt: string | null, pages: PageData[]): CheckResult[] {
  const results: CheckResult[] = [];
  results.push(checkAiBotAccess(robotsTxt));
  results.push(checkLlmsTxt(pages));
  results.push(checkAiTxt(pages));
  return results;
}
